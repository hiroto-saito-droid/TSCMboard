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
 * Index.htmlに本体スクリプトをインラインで含めると、初期HTMLがGoogle側の
 * 配信基盤の埋め込みサイズ上限(実測で約31,000文字)を超えた際に本文が
 * 無警告のまま途中で切り捨てられる現象を確認した(2026-08-17)。
 * このため本体スクリプトはIndexScript.html側に分離し、初期HTMLではなく
 * google.script.run経由(サイズ制限が無いことを確認済みの別経路)で
 * クライアント側から取得・実行する構成にしている。
 */
function apiGetAppScript() {
  var c = HtmlService.createHtmlOutputFromFile('IndexScript').getContent();
  return c.replace(/^<script>/, '').replace(/<\/script>\s*$/, '');
}
