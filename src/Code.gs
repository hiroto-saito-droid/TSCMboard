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
