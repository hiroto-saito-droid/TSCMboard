/************************************************************
 * TSCM 管理ボード エントリ (Google Apps Script)
 *  - doGet()        : 管理ボード(HTML)を配信
 *  - include()      : HTMLファイルのインクルード
 *
 * GPCMボードと異なり、会場は自由テキスト入力（マスタ選択式ではない）。
 * 会場・オプション関連の読込は OptionMaster.gs 側に定義済み
 * （apiGetStandardOptions / apiGetFavoriteVenues / apiGetFormSchema / apiGetStaffTemplate）。
 *
 * ドメイン制限デプロイを前提とする:
 *   このコード自体には認可チェックを実装していない（GPCMボードと同水準）。
 *   実際のアクセス制限は、Apps ScriptのデプロイUIで
 *   「adval.jpドメイン内のユーザーのみ」に限定する設定によって担保する。
 ************************************************************/

function doGet(e) {
  if (e && e.parameter && e.parameter.page === 'manual') {
    return HtmlService.createHtmlOutputFromFile('Manual')
      .setTitle('TSCMボード操作マニュアル')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  // 管理者(齋藤様)専用メモ。スタッフ向けマニュアル・アプリ本体のどこからもリンクしない
  // (このURLを知っている人だけがアクセスする想定)。本番/検証URLの区別を記載。
  if (e && e.parameter && e.parameter.page === 'admin') {
    return HtmlService.createHtmlOutputFromFile('Admin')
      .setTitle('TSCMボード管理者メモ')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  var t = HtmlService.createTemplateFromFile('Index');
  t.initialCaseId = (e && e.parameter && e.parameter.case) ? e.parameter.case : '';
  return t.evaluate()
    .setTitle('TSCM 管理ボード')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 見積書PDF(ジョブカン発行)をOCR変換して「御見積金額」と品目内訳(一人あたりの
 * 金額＝単価を含む)を自動抽出する。GPCMボードで実装・実データ検証済みの機能を
 * そのまま移植したもの(2026-09-03)。
 * ③利用確認書タブの「事前確定金額」欄、および【スタッフ用】PDFの見積内訳欄への
 * 自動反映に使う。
 *   1. PDFをGoogleドキュメントとしてOCRアップロード(Drive.Files.create + ocr:true)
 *   2. 変換後のドキュメントをプレーンテキストとしてエクスポート(UrlFetchApp直叩き。
 *      Advanced Drive Serviceの型付きexport()はレスポンス型の扱いで失敗するため、
 *      REST APIを直接呼ぶ方式に統一している)
 *   3. 「御見積金額」の直後にある金額、および品目行(数量・単位・単価・金額)、
 *      「メモ」区分の行(※から始まる内訳説明等、単価を持たない行)を正規表現で
 *      抜き出す(詳細はcs_parseMitsumoriItems_のコメント参照)
 *   4. 変換用の一時ファイルは必ず削除する(Pマーク対応：不要データを残さない)
 * このプロジェクトはDrive Advanced Service(v3)・UrlFetchApp("外部サービスへの
 * リクエスト"スコープ)を初めて使うため、デプロイ担当者がApps Scriptエディタで
 * この関数を一度手動実行し、権限を承認する必要がある。
 */
function apiExtractMitsumoriAmount(base64Data, fileName) {
  var docFileId = null;
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'application/pdf', fileName || 'mitsumori.pdf');
    var docFile = Drive.Files.create({ name: 'mitsumori_ocr_tmp', mimeType: MimeType.GOOGLE_DOCS }, blob, { ocr: true, ocrLanguage: 'ja' });
    docFileId = docFile.id;
    var exportUrl = 'https://www.googleapis.com/drive/v3/files/' + docFileId + '/export?mimeType=' + encodeURIComponent('text/plain');
    var resp = UrlFetchApp.fetch(exportUrl, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      return { ok: false, error: 'PDFの読み取りに失敗しました(HTTP ' + resp.getResponseCode() + ')' };
    }
    var text = resp.getContentText('UTF-8');
    var m = /御見積金額[\s　]*[￥¥]?[\s　]*([\d,]+)/.exec(text);
    if (!m) return { ok: false, error: '「御見積金額」の記載が見つかりませんでした。手入力をお願いします。' };
    return { ok: true, amount: m[1].replace(/,/g, ''), items: cs_parseMitsumoriItems_(text) };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    try { if (docFileId) DriveApp.getFileById(docFileId).setTrashed(true); } catch (e2) {}
  }
}

/**
 * デプロイ担当者が一度だけApps Scriptエディタで手動実行するための関数。
 * これを実行して権限確認ダイアログを承認して初めて、Webアプリとしてデプロイした際に
 * Drive Advanced Service・UrlFetchAppが使えるようになる(承認前にデプロイすると、
 * この関数を使わないルートも含めてWebアプリ全体が訪問者側にHTTP 403を返してしまう
 * ため、必ずデプロイ前にこの手順を済ませること。GPCMボードで実際に発生・確認済み)。
 */
function authorizeMitsumoriOcr_() {
  var props = PropertiesService.getScriptProperties();
  return 'OK: Drive=' + (typeof Drive) + ' externalRequestScopeCheck=' + (typeof UrlFetchApp);
}

/**
 * 数量は整数だけでなく小数(例:6.5時間の按分)・マイナス(例:割引で-3時間)も
 * あり得るため、/^-?\d+(\.\d+)?$/で判定する。また単位欄が空(例:単位なしの
 * 調整項目)の場合は数量の直後に単価が来るため、次の行が金額らしい形式なら
 * その行を単位として消費せずスキップする。
 *
 * ジョブカンの見積書は「値引」区分の行も数量・単価・金額を持つ通常の品目行として
 * 印字される(マイナスの数量・金額としてそのまま出力される)ため、上記の数量・単価・
 * 金額判定だけで自然に対応できる。一方「メモ」区分の行(※から始まる内訳説明等、
 * 数量・単価を持たない行)は品目テーブル内に単独のテキスト行として現れるため、通常の
 * 品目とは別扱いで拾い、単価・数量は空欄のまま追加する。見出し行(内容詳細/数量/単位等)・
 * 税率(10%等)・小計以降の集計行は対象外。通常品目・メモ行はいずれも見積書内での
 * 出現順を保つ。
 *
 * 「小計」は見積書冒頭のサマリー欄(小計/消費税/合計)にも品目テーブル末尾にも現れるため、
 * 素朴なindexOf()では冒頭側にヒットしてスキャン範囲が品目テーブルに到達する前に
 * 終わってしまう。品目テーブルの開始位置(「内容詳細」見出し)より後で検索することで、
 * テーブル末尾の「小計」を正しく終端として使う。
 *
 * (以上、GPCMボードで実際の見積書PDF複数枚で確認・修正済みのロジックをそのまま移植)
 */
function cs_parseMitsumoriItems_(text) {
  var lines = text.split('\n').map(function (l) { return l.replace(/^\t+/, '').trim(); }).filter(function (l) { return l; });
  var qtyRe = /^-?\d+(\.\d+)?$/;
  var moneyRe = /^-?[\d,]+$/;
  var dateRe = /^\d{4}\/\d{1,2}\/\d{1,2}/;
  var taxRe = /^\d{1,2}%$/;
  var headerLabels = { '内容詳細': 1, '数量': 1, '単位': 1, '単価': 1, '金額': 1, '備考': 1, '税': 1 };
  var consumed = {};
  var found = [];

  for (var i = 0; i < lines.length; i++) {
    if (!qtyRe.test(lines[i])) continue;
    var j = i + 1;
    var unit = '';
    if (j < lines.length && !moneyRe.test(lines[j])) {
      unit = lines[j];
      j++;
    }
    if (j + 1 >= lines.length || !moneyRe.test(lines[j]) || !moneyRe.test(lines[j + 1])) continue;
    var nameIdx = i - 1;
    while (nameIdx >= 0 && dateRe.test(lines[nameIdx])) nameIdx--;
    found.push({
      pos: nameIdx >= 0 ? nameIdx : i,
      item: {
        name: nameIdx >= 0 ? lines[nameIdx] : '',
        qty: lines[i],
        unit: unit,
        unitPrice: lines[j].replace(/,/g, ''),
        amount: lines[j + 1].replace(/,/g, '')
      }
    });
    for (var k = Math.max(nameIdx, 0); k <= j + 1; k++) consumed[k] = true;
    i = j + 1;
  }

  var headerIdx = lines.indexOf('内容詳細');
  var scanStart = headerIdx >= 0 ? headerIdx + 1 : 0;
  var summaryIdx = lines.indexOf('小計', scanStart);
  var scanEnd = summaryIdx >= 0 ? summaryIdx : lines.length;
  for (var m2 = scanStart; m2 < scanEnd; m2++) {
    if (consumed[m2]) continue;
    var l = lines[m2];
    if (headerLabels[l] || taxRe.test(l) || qtyRe.test(l) || moneyRe.test(l) || dateRe.test(l)) continue;
    found.push({ pos: m2, item: { name: l, qty: '', unit: '', unitPrice: '', amount: '' } });
  }

  found.sort(function (a, b) { return a.pos - b.pos; });
  return found.map(function (f) { return f.item; });
}

/**
 * 初期HTMLへの直接埋め込み・google.script.run一括転送のどちらでも、
 * 本体スクリプトが約3〜4万文字を超えるとブラウザ側で構文的に不完全な
 * 状態(Uncaught SyntaxError: Unexpected end of input)で受信され、実行に
 * 失敗する現象を実機のDevToolsコンソールで確認した(2026-08-18)。
 * 内部の転送経路(userCodeAppPanel)自体にサイズ上限があるとみられるため、
 * 一括転送をやめ、小さなチャンクに分割してgoogle.script.runで順次取得し、
 * クライアント側で連結してから実行する方式にしている。
 */
var APISCRIPT_CHUNK_SIZE = 8000;

function apiGetAppScript_() {
  var c = HtmlService.createHtmlOutputFromFile('IndexScript').getContent();
  return c.replace(/^<script>/, '').replace(/<\/script>\s*$/, '');
}

function apiGetAppScriptChunkCount() {
  return Math.ceil(apiGetAppScript_().length / APISCRIPT_CHUNK_SIZE);
}

function apiGetAppScriptChunk(index) {
  var c = apiGetAppScript_();
  var start = index * APISCRIPT_CHUNK_SIZE;
  return c.substring(start, start + APISCRIPT_CHUNK_SIZE);
}
