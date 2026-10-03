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
 * ジョブカンの「見積書を共有」で発行される閲覧用URL(share_id付き)から、OCRを
 * 介さずプレビューページのHTMLを直接取得・解析して、御見積金額と品目・備考を
 * 取り出す(PDFの写真が不鮮明な場合の代替経路。GPCMボードから移植)。
 *   1. 共有URLにアクセスするとセッションCookieが発行され、閲覧用プレビューへ
 *      302リダイレクトされる(UrlFetchAppが自動追従)
 *   2. 取得したCookieを付けてプレビューページを取得すると、内容詳細テーブルが
 *      HTMLとして返る(共有URL自体が認可トークンで、パスワード等は不要)
 *   3. cs_parseMitsumoriHtml_でテーブル行と備考行を抽出する
 * 取得先はジョブカン(in.jobcan.jp)に限定する(任意URLへのサーバー側リクエストを
 * 防ぐため。TSCMで追加した制限)。
 */
function apiExtractMitsumoriFromUrl(shareUrl) {
  try {
    shareUrl = String(shareUrl || '').trim();
    var idMatch = /share_id=(\d+)/.exec(shareUrl);
    if (!shareUrl || !idMatch || !/^https:\/\/in\.jobcan\.jp\//.test(shareUrl)) {
      return { ok: false, error: 'ジョブカンの共有リンクの形式が正しくありません(in.jobcan.jp の share_id 付きURLを貼り付けてください)。' };
    }
    var shareId = idMatch[1];
    var resp1 = UrlFetchApp.fetch(shareUrl, { followRedirects: true, muteHttpExceptions: true });
    if (resp1.getResponseCode() !== 200) {
      return { ok: false, error: '共有リンクへのアクセスに失敗しました(HTTP ' + resp1.getResponseCode() + ')。リンクの有効期限が切れていないかご確認ください。' };
    }
    var cookieHeader = resp1.getAllHeaders()['Set-Cookie'];
    if (!cookieHeader) {
      return { ok: false, error: 'セッションCookieの取得に失敗しました。リンクが正しいかご確認ください。' };
    }
    var cookieArr = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader];
    var cookieStr = cookieArr.map(function (c) { return c.split(';')[0]; }).join('; ');
    var previewUrl = 'https://in.jobcan.jp/es01/TransShareReader/preview?share_id=' + encodeURIComponent(shareId);
    var resp2 = UrlFetchApp.fetch(previewUrl, { headers: { Cookie: cookieStr }, muteHttpExceptions: true });
    if (resp2.getResponseCode() !== 200) {
      return { ok: false, error: '見積書内容の取得に失敗しました(HTTP ' + resp2.getResponseCode() + ')。' };
    }
    var html = resp2.getContentText('UTF-8');
    var totalM = /class="totalamount">([\d,]+)</.exec(html);
    var items = cs_parseMitsumoriHtml_(html);
    if (!totalM && !items.length) {
      return { ok: false, error: '見積書の内容を読み取れませんでした。リンクの有効期限、または手入力・PDFアップロードをお試しください。' };
    }
    return { ok: true, amount: totalM ? totalM[1].replace(/,/g, '') : '', items: items };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** HTMLタグを除去し、代表的なエンティティ(&amp;等)をデコードする。 */
function cs_stripTagsDecode_(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * ジョブカン見積書プレビューHTMLから品目・備考を抽出する。
 * 通常品目行(<tr class="normal">)：内容詳細セルの1つ目のdiv＝品目名
 * (2つ目のdivは日付のため使わない)、数量・単位・単価・金額をそのまま取得し、
 * 備考セルの空でない方のdivがあれば、品目とは別のnote:true項目として追加する。
 * 表内の注記行(<tr><td class="tdmemo">…)は丸ごと1件のnote:true項目にする。
 */
function cs_parseMitsumoriHtml_(html) {
  var items = [];
  var blocks = [];
  var rowRe = /<tr class="normal">([\s\S]*?)<\/tr>/g;
  var m;
  while ((m = rowRe.exec(html))) {
    blocks.push({ idx: m.index, type: 'item', body: m[1] });
  }
  var memoRe = /<tr><td class="tdmemo"[^>]*><div class="memo_value">([\s\S]*?)<\/div><\/td><\/tr>/g;
  while ((m = memoRe.exec(html))) {
    blocks.push({ idx: m.index, type: 'memo', body: m[1] });
  }
  blocks.sort(function (a, b) { return a.idx - b.idx; });

  blocks.forEach(function (b) {
    if (b.type === 'memo') {
      var text = cs_stripTagsDecode_(b.body);
      if (text) items.push({ name: text, qty: '', unit: '', unitPrice: '', amount: '', note: true });
      return;
    }
    var body = b.body;
    var nameM = /<td class="product_name"[^>]*>([\s\S]*?)<\/td>/.exec(body);
    var name = '';
    if (nameM) {
      var divs = nameM[1].match(/<div[^>]*>([\s\S]*?)<\/div>/g) || [];
      if (divs.length) name = cs_stripTagsDecode_(divs[0]);
    }
    var qtyM = /<td class="quantity">([\s\S]*?)<\/td>/.exec(body);
    var unitM = /<td class="unit">([\s\S]*?)<\/td>/.exec(body);
    var priceM = /<td class="price">([\s\S]*?)<\/td>/.exec(body);
    var amountM = /<td class="amount">([\s\S]*?)<\/td>/.exec(body);
    var remarksM = /<td class="remarks"[^>]*>([\s\S]*?)<\/td>/.exec(body);
    items.push({
      name: name,
      qty: qtyM ? cs_stripTagsDecode_(qtyM[1]) : '',
      unit: unitM ? cs_stripTagsDecode_(unitM[1]) : '',
      unitPrice: priceM ? cs_stripTagsDecode_(priceM[1]).replace(/,/g, '') : '',
      amount: amountM ? cs_stripTagsDecode_(amountM[1]).replace(/,/g, '') : ''
    });
    if (remarksM) {
      var rdivs = remarksM[1].match(/<div[^>]*>([\s\S]*?)<\/div>/g) || [];
      var remarkText = '';
      for (var i = 0; i < rdivs.length; i++) {
        var t = cs_stripTagsDecode_(rdivs[i]);
        if (t) { remarkText = t; break; }
      }
      if (remarkText) items.push({ name: remarkText, qty: '', unit: '', unitPrice: '', amount: '', note: true });
    }
  });
  return items;
}

/**
 * デプロイ担当者が一度だけApps Scriptエディタで手動実行するための関数。
 * これを実行して権限確認ダイアログを承認して初めて、Webアプリとしてデプロイした際に
 * Drive Advanced Service・UrlFetchAppが使えるようになる(承認前にデプロイすると、
 * この関数を使わないルートも含めてWebアプリ全体が訪問者側にHTTP 403を返してしまう
 * ため、必ずデプロイ前にこの手順を済ませること。GPCMボードで実際に発生・確認済み)。
 */
function authorizeMitsumoriOcr() {
  // 末尾に_が付く関数名はApps Scriptエディタの「実行する関数」ドロップダウンに
  // 表示されないため(GPCMボードでも同じ現象を確認)、この関数だけは意図的に
  // 末尾の_を付けていない。実際にDrive Advanced Service・UrlFetchAppを呼び出す
  // ことで、権限確認ダイアログを確実に表示させる(typeof等の参照だけでは
  // 権限確認が走らないため)。
  var driveResult = Drive.Files.list({ pageSize: 1 });
  var fetchResult = UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  return 'OK: Drive一覧取得件数=' + (driveResult.files ? driveResult.files.length : 0) +
    ' / 外部リクエストHTTPステータス=' + fetchResult.getResponseCode();
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
  // 「2026/10/1」形式に加え「2026年10月1日」形式の日付も同様に読み飛ばし対象とする
  // (日付行を品目名や備考として誤って拾わないように。GPCMボードから移植)。
  var dateRe = /^\d{4}(\/\d{1,2}\/\d{1,2}|年\d{1,2}月\d{1,2}日)/;
  var taxRe = /^\d{1,2}%$/;
  var headerLabels = { '内容詳細': 1, '数量': 1, '単位': 1, '単価': 1, '金額': 1, '備考': 1, '税': 1, '税率': 1 };
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
  // 備考欄の記載(例:「※繁忙期価格」)や、表の下に続く注記(例:「※【飲食費】の内訳:…」)は
  // 品目(数量・単価を持つ行)とは別の「備考」(note:true)として拾う。長い注記はOCRの
  // テキスト化時に複数行へ折り返されることがあるため、間に品目行を挟まず連続している
  // 行は1件の備考としてまとめる(GPCMボードから移植)。
  var noteGroup = null;
  for (var m2 = scanStart; m2 < scanEnd; m2++) {
    if (consumed[m2]) { noteGroup = null; continue; }
    var l = lines[m2];
    if (headerLabels[l] || taxRe.test(l) || qtyRe.test(l) || moneyRe.test(l) || dateRe.test(l)) { noteGroup = null; continue; }
    if (noteGroup) {
      noteGroup.item.name += ' ' + l;
    } else {
      noteGroup = { pos: m2, item: { name: l, qty: '', unit: '', unitPrice: '', amount: '', note: true } };
      found.push(noteGroup);
    }
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
