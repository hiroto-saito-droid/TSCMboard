/************************************************************
 * TSCM オプション・共通マスタ 読み込み  (Google Apps Script)
 * GPCMボードの VenueMaster.gs を土台に、会場マスタ選択式(venueIdキー)を
 * 廃止し、会場自由入力＋全会場共通の標準オプションマスタに再設計したもの。
 *
 * マスタは「TSCM_共通マスタ」という1つのスプレッドシートに、GPCMボードの
 * 会場マスタと同じ「1ファイル・複数タブ」構成で統合されている
 * (共通オプション・料金マスタ／よく使う会場／ヒアリング項目マスタ／共有事項テンプレ)。
 ************************************************************/

var OM_SPREADSHEET_ID = '1g9Nrqdo33DCV0a-RufiQxFteW_y0lw525Tvj2GxlAJ0';
var OM_TABS = {
  standard:   '共通オプション・料金マスタ',
  venues:     'よく使う会場',
  formSchema: 'ヒアリング項目マスタ',
  staff:      '共有事項テンプレ'
};

/**
 * タブ名を引数に取り、1行目をヘッダとしたオブジェクト配列を返す汎用関数
 * （GPCMのvm_readSheet_相当）。
 */
function om_readTab_(tabName) {
  var ss = SpreadsheetApp.openById(OM_SPREADSHEET_ID);
  var sh = ss.getSheetByName(tabName);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    var obj = {};
    for (var c = 0; c < head.length; c++) obj[head[c]] = row[c];
    out.push(obj);
  }
  return out;
}

function om_num_(v) {
  var s = String(v).replace(/[,¥\s]/g, '');
  if (s === '' || /要確認/.test(String(v))) return 0;   // 未確定は 0 (= 要確認 表示)
  var n = Number(s);
  return isNaN(n) ? 0 : n;
}

/** 空欄と0を区別したい単価・率用（空欄は当日手入力=未確定のまま返す） */
function om_numOrBlank_(v) {
  if (v === '' || v === null || v === undefined) return '';
  return om_num_(v);
}

function om_activeUserEmail_() {
  try { return Session.getActiveUser().getEmail() || '(不明)'; } catch (e) { return '(不明)'; }
}

/************************************************************
 * 共通オプション・料金マスタ
 *   列: コード / 品目名 / 種別(manual・fixed・percentage) / 単価(税別) /
 *       率(%) / 単位 / 税表記(税別・税込) / 表示順 / 備考
 ************************************************************/
function getStandardOptions() {
  var rows = om_readTab_(OM_TABS.standard);
  var list = rows.map(function (r) {
    return {
      code:    String(r['コード'] || '').trim(),
      name:    String(r['品目名'] || '').trim(),
      kind:    String(r['種別'] || '').trim(),
      price:   om_numOrBlank_(r['単価(税別)']),
      rate:    om_numOrBlank_(r['率(%)']),
      unit:    String(r['単位'] || '').trim(),
      taxType: String(r['税表記'] || '').trim(),
      order:   om_num_(r['表示順']),
      note:    String(r['備考'] || '').trim()
    };
  });
  list.sort(function (a, b) { return a.order - b.order; });
  return list;
}
function apiGetStandardOptions() { return JSON.stringify(getStandardOptions()); }

/************************************************************
 * よく使う会場
 *   列: 会場名 / 会場住所 / 登録日時 / 登録者 / 備考
 ************************************************************/
function getFavoriteVenues() {
  var rows = om_readTab_(OM_TABS.venues);
  return rows.map(function (r) {
    return {
      name:         String(r['会場名'] || '').trim(),
      address:      String(r['会場住所'] || '').trim(),
      registeredAt: r['登録日時'] || '',
      registeredBy: r['登録者'] || '',
      note:         r['備考'] || ''
    };
  }).filter(function (v) { return v.name; });
}
function apiGetFavoriteVenues() { return JSON.stringify(getFavoriteVenues()); }

/**
 * 「よく使う会場」に会場を登録する。同名会場が既にあれば住所・登録日時・
 * 登録者を更新し、無ければ新規行を追加する（Pマーク対応：登録操作の追跡性確保）。
 * 戻り値(JSON文字列): { updated: true/false, name, address }
 */
function addFavoriteVenue(name, address) {
  name = String(name || '').trim();
  address = String(address || '').trim();
  if (!name) return JSON.stringify({ error: '会場名が空です' });

  var ss = SpreadsheetApp.openById(OM_SPREADSHEET_ID);
  var sh = ss.getSheetByName(OM_TABS.venues);
  var lastRow = sh.getLastRow();
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var who = om_activeUserEmail_();

  if (lastRow >= 2) {
    var names = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim() === name) {
        var row = i + 2;
        sh.getRange(row, 2, 1, 1).setValues([[address]]);            // B: 会場住所
        sh.getRange(row, 3, 1, 1).setNumberFormat('@').setValues([[now]]); // C: 登録日時（更新）
        sh.getRange(row, 4, 1, 1).setValues([[who]]);                 // D: 登録者（更新）
        return JSON.stringify({ updated: true, name: name, address: address, registeredAt: now });
      }
    }
  }
  var newRow = lastRow + 1;
  sh.getRange(newRow, 3, 1, 1).setNumberFormat('@'); // 登録日時のセル書式を先にプレーンテキスト固定
  sh.getRange(newRow, 1, 1, 4).setValues([[name, address, now, who]]);
  return JSON.stringify({ updated: false, name: name, address: address, registeredAt: now });
}

/************************************************************
 * ヒアリング項目マスタ
 *   列: カテゴリ / 項目名 / 種別(select/text/date/datetime/timerange/textarea) /
 *       選択肢(｜または|区切り) / 初期値 / 補足メモ / 会場依存フラグ(常時FALSE運用) /
 *       新規項目フラグ / ラクラクパック関連フラグ / ケータリング関連フラグ / お食事関連フラグ
 * GPCMの vm_buildFormSchema_() のロジックを、venueId引数なし・単一マスタ版に移植。
 ************************************************************/
function om_buildFormSchema_(rows) {
  var cats = {};
  var order = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.every(function (c) { return c === '' || c === null; })) continue;
    var cat = String(r[0] || '').trim();
    if (!cat) continue;
    if (!cats[cat]) { cats[cat] = { cat: cat, items: [] }; order.push(cat); }
    var optStr = String(r[3] || '');
    var type = String(r[2] || '').trim();
    var rawValue = r[4];
    var value = rawValue;
    // スプレッドシートが日付文字列を自動でDate型に変換してしまう場合があるため、
    // date/datetime項目はここで文字列表現に戻す。
    if (rawValue instanceof Date) {
      if (type === 'date') {
        value = Utilities.formatDate(rawValue, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else if (type === 'datetime') {
        value = Utilities.formatDate(rawValue, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm");
      } else {
        value = Utilities.formatDate(rawValue, 'Asia/Tokyo', 'yyyy-MM-dd');
      }
    }
    var item = {
      item: String(r[1] || ''),
      type: type,
      options: optStr ? optStr.split(/[｜|]/).map(function (s) { return s.trim(); }).filter(function (s) { return s; }) : null,
      value: value || '',
      memo: r[5] || '',
      dep: String(r[6]).toUpperCase() === 'TRUE' // 会場依存フラグ：TSCMでは常時FALSE運用
    };
    if (String(r[7]).toUpperCase() === 'TRUE') item.new = true;
    if (String(r[8]).toUpperCase() === 'TRUE') item.rakuraku = true;
    if (String(r[9]).toUpperCase() === 'TRUE') item.catering = true;
    if (String(r[10]).toUpperCase() === 'TRUE') item.meal = true;
    cats[cat].items.push(item);
  }
  return order.map(function (c) { return cats[c]; });
}

function getFormSchema() {
  var ss = SpreadsheetApp.openById(OM_SPREADSHEET_ID);
  var sh = ss.getSheetByName(OM_TABS.formSchema);
  var values = sh.getDataRange().getValues();
  var rows = values.length > 1 ? values.slice(1) : []; // 1行目(見出し)を除く
  return om_buildFormSchema_(rows);
}
function apiGetFormSchema() { return JSON.stringify(getFormSchema()); }

/************************************************************
 * 共有事項テンプレ（会場非依存・単一テンプレ、案件ごとに編集可）
 *   列: テンプレ本文（2行目に本文）
 ************************************************************/
function getStaffTemplate() {
  var ss = SpreadsheetApp.openById(OM_SPREADSHEET_ID);
  var sh = ss.getSheetByName(OM_TABS.staff);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return '';
  return String(sh.getRange(2, 1, 1, 1).getValue() || '');
}
function apiGetStaffTemplate() { return JSON.stringify({ body: getStaffTemplate() }); }

/************************************************************
 * 案件データの保存（スプレッドシート「TSCM_管理システム」1シート目）
 * ボード上の「💾 保存」ボタンから呼ばれる。案件(caseId)ごとに1行。
 * GPCMの「会場ID」列を廃止し「会場住所」列を追加した点のみ列構成が異なる。
 ************************************************************/
var CASE_SPREADSHEET_ID = '1zRRDTTt9luoiH5Za8ooi00AOBC-bJwNMeWI4jGYfD60';
// 作成者/最終更新者はSession.getActiveUser()から自動記録する（Pマーク対応：操作の追跡性確保）。
var CASE_HEADERS = ['caseId', '保存日時', '更新日時', '作成者', '最終更新者', '会場名', '会場住所', '会社名', '担当者', 'データ(JSON)', 'URL'];

function cs_getSheet_() {
  var ss = SpreadsheetApp.openById(CASE_SPREADSHEET_ID);
  var sh = ss.getSheets()[0];
  // 見出し行を常に現在のCASE_HEADERSに合わせて補正する（データ行には触れない）。
  var curHeaders = sh.getRange(1, 1, 1, CASE_HEADERS.length).getValues()[0];
  var needsFix = CASE_HEADERS.some(function (h, idx) { return curHeaders[idx] !== h; });
  if (needsFix) {
    sh.getRange(1, 1, 1, CASE_HEADERS.length).setValues([CASE_HEADERS])
      .setFontWeight('bold').setBackground('#e8ecf2');
  }
  return sh;
}

// ボードの本番URL。実際のデプロイ後、WEBAPP_BASE_URLを配布URL(ドメイン制限デプロイの
// 「/a/macros/adval.jp/s/...」形式)に更新すること。未確定の間はプレースホルダのまま。
var WEBAPP_BASE_URL = 'https://script.google.com/a/macros/adval.jp/s/AKfycbxPRYx_2qBpq5OTJL7x8iZcseYcjp38jbNGDpxaV5CVjU_q_EhQGAVZzAP2LnfMId_Jig/exec';

// 案件詳細ページ(?case=xxx)へのHYPERLINK式を生成する（案件データシートから直接開けるように）。
function cs_caseUrlFormula_(caseId) {
  var url = WEBAPP_BASE_URL + '?case=' + encodeURIComponent(caseId);
  return '=HYPERLINK("' + url + '","開く")';
}

/**
 * 案件データを保存する。payload.caseIdが既存行と一致すればその行を更新、
 * 無ければ新規行(新しいcaseId発行)を追加する。作成者・最終更新者は
 * 呼び出したGoogleアカウントから自動記録する。
 * payload: { caseId, venueName, venueAddress, company, client, blocks }
 * 戻り値(JSON文字列): { caseId, updated, savedAt }
 */
function saveCase(payloadJson) {
  var payload = JSON.parse(payloadJson);
  var sh = cs_getSheet_();
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  var who = om_activeUserEmail_();
  var dataStr = JSON.stringify(payload.blocks || []);
  var venueName = payload.venueName || '', venueAddress = payload.venueAddress || '';
  var company = payload.company || '', client = payload.client || '';

  var caseId = payload.caseId;
  if (caseId) {
    var lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === caseId) {
          var row = i + 2;
          // C:更新日時（Sheetsの日付自動変換を防ぐためプレーンテキスト固定）
          sh.getRange(row, 3, 1, 1).setNumberFormat('@').setValues([[now]]);
          // D:作成者は変更しない。E:最終更新者〜J:データ(JSON)のみ更新
          sh.getRange(row, 5, 1, 6).setValues([[who, venueName, venueAddress, company, client, dataStr]]);
          sh.getRange(row, 11, 1, 1).setValues([[cs_caseUrlFormula_(caseId)]]);
          return JSON.stringify({ caseId: caseId, updated: true, savedAt: now });
        }
      }
    }
  }
  caseId = Utilities.getUuid();
  var newRow = sh.getLastRow() + 1;
  // B:保存日時/C:更新日時は、書き込み前にプレーンテキスト固定しておく
  // (先に書き込むとSheetsが日付型に自動変換し、listCases()のソートが壊れるため)。
  sh.getRange(newRow, 2, 1, 2).setNumberFormat('@');
  sh.getRange(newRow, 1, 1, 11).setValues([[caseId, now, now, who, who, venueName, venueAddress, company, client, dataStr, cs_caseUrlFormula_(caseId)]]);
  return JSON.stringify({ caseId: caseId, updated: false, savedAt: now });
}

/**
 * 案件データを削除する（Pマーク対応：本人からの削除依頼等への対応手段）。
 * 戻り値(JSON文字列): { deleted: true/false }
 */
function deleteCase(caseId) {
  var sh = cs_getSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === caseId) {
        sh.deleteRow(i + 2);
        return JSON.stringify({ deleted: true });
      }
    }
  }
  return JSON.stringify({ deleted: false });
}

/**
 * 保存済み案件の一覧を返す（データ本体のJSON列は含まない軽量版）。
 * 戻り値(JSON文字列): [{caseId,savedAt,updatedAt,createdBy,updatedBy,venueName,venueAddress,company,client}, ...]
 * 更新日時の新しい順に並べる。
 */
function listCases() {
  var sh = cs_getSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return JSON.stringify([]);
  var vals = sh.getRange(2, 1, lastRow - 1, 9).getValues();
  var list = vals.map(function (r) {
    return { caseId: r[0], savedAt: r[1], updatedAt: r[2], createdBy: r[3], updatedBy: r[4], venueName: r[5], venueAddress: r[6], company: r[7], client: r[8] };
  });
  // Sheetsが日付として自動変換した既存セルはDate型で返ってくることがあり、
  // localeCompareがDateオブジェクトに存在せずクラッシュするためString()で防御する。
  list.sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
  return JSON.stringify(list);
}

/**
 * caseIdを指定して案件データ本体を読み込む。
 * 戻り値(JSON文字列): {caseId,savedAt,updatedAt,createdBy,updatedBy,venueName,venueAddress,company,client,blocks} または {error}
 */
function loadCase(caseId) {
  var sh = cs_getSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === caseId) {
        var row = sh.getRange(i + 2, 1, 1, 10).getValues()[0];
        var blocks = [];
        try { blocks = JSON.parse(row[9] || '[]'); } catch (err) { blocks = []; }
        return JSON.stringify({
          caseId: row[0], savedAt: row[1], updatedAt: row[2], createdBy: row[3], updatedBy: row[4],
          venueName: row[5], venueAddress: row[6], company: row[7], client: row[8],
          blocks: blocks
        });
      }
    }
  }
  return JSON.stringify({ error: '案件が見つかりません' });
}

/** 動作確認用 */
function om_test_() {
  var opts = getStandardOptions();
  Logger.log('標準オプション数: ' + opts.length);
  var venues = getFavoriteVenues();
  Logger.log('よく使う会場数: ' + venues.length);
  var schema = getFormSchema();
  Logger.log('ヒアリング項目カテゴリ数: ' + schema.length);
  Logger.log('共有事項テンプレ先頭50文字: ' + String(getStaffTemplate()).slice(0, 50));
}
