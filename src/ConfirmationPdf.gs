/************************************************************
 * TSCM 利用確認書 PDF 生成 (Google Apps Script)
 *  generateConfirmationPdf(payload) :
 *     フロントの「スタッフ用作成」「サイン用作成」から呼ばれる。
 *     会場は自由入力(venueName/venueAddress)のため、GPCMのgetVenueMaster()
 *     依存(venues[data.venueId])は廃止し、payloadの値のみで組み立てる。
 *  ※ summary はフロントのテキスト出力（buildOutput）を使用。
 ************************************************************/

function generateConfirmationPdf(payload) {
  var data = (typeof payload === 'string') ? JSON.parse(payload) : (payload || {});
  var variant = (data.variant === 'sign') ? 'sign' : 'staff';
  var venue = { name: data.venueName || '', address: data.venueAddress || '' };

  var html = renderConfirmationHtml_(variant, data, venue);

  var baseName = (venue.name || 'TSCM') + '_' + (data.company || '') + '_利用確認書_' +
                 (variant === 'sign' ? 'サイン用' : 'スタッフ用');
  var blob = Utilities.newBlob(html, 'text/html', baseName + '.html');
  var pdf  = blob.getAs('application/pdf').setName(baseName + '.pdf');

  var file = saveConfPdf_(pdf);
  return {
    status: 'ok', variant: variant,
    fileId: file.getId(), fileName: file.getName(),
    fileUrl: file.getUrl(), url: file.getUrl()
  };
}

/**
 * ②レイアウトタブでアップロードしたレイアウト図だけを、利用確認書とは別に
 * 単体のPDFとして書き出す。payload: { venueName, venueAddress, company, client,
 * useDate, useTime, layoutDayImg, layoutNextImg }（画像はdata URL文字列）
 */
function generateLayoutPdf(payload) {
  var data = (typeof payload === 'string') ? JSON.parse(payload) : (payload || {});
  var venueLabel = data.venueName || '';

  var html = renderLayoutHtml_(data, venueLabel);
  var baseName = (venueLabel || 'TSCM') + '_' + (data.company || '') + '_レイアウト図';
  var blob = Utilities.newBlob(html, 'text/html', baseName + '.html');
  var pdf = blob.getAs('application/pdf').setName(baseName + '.pdf');

  var file = saveConfPdf_(pdf);
  return {
    status: 'ok',
    fileId: file.getId(), fileName: file.getName(),
    fileUrl: file.getUrl(), url: file.getUrl()
  };
}

function renderLayoutHtml_(d, venueLabel) {
  var css =
    "body{font-family:'Hiragino Kaku Gothic ProN','Meiryo','MS PGothic',sans-serif;font-size:11px;color:#111;line-height:1.6;margin:0;}" +
    ".page{page-break-after:always;padding:3mm 2mm;}.page:last-child{page-break-after:avoid;}" +
    ".doc-head{display:flex;justify-content:space-between;border-bottom:2px solid #1a2b4a;padding-bottom:4px;margin-bottom:6px;}" +
    ".doc-title{font-size:14px;font-weight:bold;}.doc-title .badge{font-size:10.5px;font-weight:normal;color:#555;}.doc-sub{font-size:10.5px;color:#555;}" +
    ".doc-meta{font-size:10px;text-align:right;color:#444;}" +
    ".row{display:flex;gap:8px;align-items:flex-start;}" +
    ".imgcol{flex:1;min-width:0;border:1px solid #b0b6bf;display:flex;align-items:center;justify-content:center;background:#fafafa;}" +
    ".imgcol img{max-width:100%;max-height:155mm;display:block;}" +
    ".memocol{width:38mm;flex:none;}.memocol h4{font-size:10px;font-weight:bold;color:#444;margin:0 0 4px;}" +
    ".memocol .txt{white-space:pre-wrap;font-size:9.5px;border:1px solid #b0b6bf;background:#fbfbfd;padding:6px 7px;min-height:60mm;max-height:155mm;overflow:hidden;}" +
    ".empty{color:#888;border:1px dashed #b0b6bf;padding:14px;text-align:center;}" +
    "@page{size:A4 landscape;margin:8mm;}";

  var page = function (label, img, memo) {
    var hasMemo = !!(memo && String(memo).trim());
    var memoCol = hasMemo ? '<div class="memocol"><h4>メモ</h4><div class="txt">' + ce_(memo) + '</div></div>' : '';
    return '<div class="page"><div class="doc-head"><div>' +
      '<div class="doc-title">レイアウト図 <span class="badge">【' + ce_(label) + '】</span></div>' +
      '<div class="doc-sub">' + ce_(venueLabel || '') + '</div>' +
    '</div><div class="doc-meta">会社名：' + ce_(d.company || '') + ' ／ ' + ce_(d.client || '') + ' 様' +
      '<br>利用日：' + ce_(d.useDate || '') + '　利用時間：' + ce_(d.useTime || '') + '</div></div>' +
      '<div class="row"><div class="imgcol"><img src="' + img + '"></div>' + memoCol + '</div></div>';
  };

  var pages = '';
  if (d.layoutDayImg) pages += page('当日レイアウト', d.layoutDayImg, d.layoutDayMemo);
  if (d.layoutNextImg) pages += page('次回レイアウト', d.layoutNextImg, d.layoutNextMemo);
  if (!pages) pages = '<div class="page"><div class="empty">レイアウト図が未アップロードです</div></div>';

  return '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>' + css + '</style></head><body>' +
    pages +
    '</body></html>';
}

/**
 * PDFの保存先フォルダ。「TSCM_共通マスタ」フォルダのIDを直接使う
 * (共通マスタSSファイルの親フォルダ参照より確実なため、GPCMと異なりIDを固定値で指定)。
 */
var TSCM_MASTER_FOLDER_ID = '1ERHY0dOkMjwzp6DBHfn2d8cRJYmCYM8e';

function saveConfPdf_(pdf) {
  var file;
  try {
    var folder = DriveApp.getFolderById(TSCM_MASTER_FOLDER_ID);
    file = folder.createFile(pdf);
  } catch (e) {
    file = DriveApp.createFile(pdf);
  }
  // 生成スクリプトはUSER_DEPLOYING(=デプロイ者本人)として実行されるため、
  // 何もしないと他の担当者は生成したPDFを開けない。ファイル単位で
  // 社内(adval.jpドメイン)閲覧権限のみ付与する(フォルダ全体は公開しない)。
  try { file.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW); } catch (e) {}
  return file;
}

function ce_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 数字だけ入力すればPDF上で¥表記になるようにする(数値でなければそのまま表示)。 */
function money_(v) {
  if (v === '' || v == null) return '';
  var s = String(v).replace(/[,¥\s]/g, '');
  var n = Number(s);
  return isNaN(n) ? ce_(v) : '¥' + n.toLocaleString();
}

/** 成約サマリー・立会スタッフ共有事項の編集内容(太字・文字色付きHTML)を、許可したタグのみに絞って通す */
function sanitizeRichHtml_(html) {
  html = String(html == null ? '' : html);
  html = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  html = html.replace(/<(\/?)(b|strong|i|em|u|br|div)(\s[^>]*)?>/gi, function (m, close, tag) {
    tag = tag.toLowerCase();
    return close ? '</' + tag + '>' : (tag === 'br' ? '<br>' : '<' + tag + '>');
  });
  html = html.replace(/<span([^>]*)>/gi, function (m, attrs) {
    var styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/i);
    var colorMatch = styleMatch && styleMatch[1].match(/color\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]*\))/i);
    return colorMatch ? '<span style="color:' + colorMatch[1] + '">' : '<span>';
  });
  html = html.replace(/<\/span>/gi, '</span>');
  html = html.replace(/<(?!\/?(b|strong|i|em|u|br|div|span)\b)[^>]*>/gi, '');
  return html;
}

function confPayNote_(v) {
  v = v || '';
  if (/GMO/.test(v))       return 'GMO銀行振込・カード決済の場合：領収書を希望される際は、マイページからダウンロードするようご案内をお願いします。';
  if (/みずほ/.test(v))    return 'みずほ銀行振込の場合：領収書を希望される際は、後日PDFにて発行する旨をお伝えください。';
  if (/後払い/.test(v))    return 'ご利用月締めの翌月末払いにて請求書を発行いたします。請求書は翌月３営業日以内にビジネスアカウントのマイページよりダウンロード可能となります。';
  if (/予約サイト/.test(v))return '予約サイトを通じてのお支払いとなります。お支払い方法は予約サイトを通じて、ご確認ください。';
  if (/当日/.test(v))      return '領収書は後日PDFにて発行いたします。※ジョブカン領収書は「但書：スペース利用に関する費用として」固定です。';
  return '';
}

/**
 * 標準/自由記述オプションの当日追加料金行を1行分HTML化する。
 * o: { name, price, qty, unit, taxType, kind } （kind==='percentage'の行=維持管理費は
 * この関数では描画せず、confMaintRow_()で別途描画する）
 */
function confFeeRowHtml_(o) {
  var price = (o.price !== '' && o.price != null) ? ('¥' + Number(o.price).toLocaleString()) : '<span style="color:#c0392b">要確認（当日）</span>';
  var qty = (o.qty !== '' && o.qty != null && o.qty !== 0) ? ce_(String(o.qty)) : '';
  var taxBadge = (o.taxType === '税込')
    ? '<span style="background:#eef2ff;color:#3730a3;border:1px solid #a5b4fc;border-radius:4px;padding:0 5px;font-size:9.5px">税込</span>'
    : '<span style="background:#fff7ed;color:#9a3412;border:1px solid #fdba74;border-radius:4px;padding:0 5px;font-size:9.5px">税別</span>';
  var unit = o.unit ? ('（' + ce_(o.unit) + '）') : '';
  return '<tr><td>' + ce_(o.name) + unit + '</td><td class="r">' + price + '</td><td class="r">' + qty + '</td><td class="r">' + taxBadge + '</td></tr>';
}

/** 維持管理費(5%)算出前の、標準+自由記述オプションの単純合計(税抜・税込問わず)。 */
function confComputeFeeSubtotal_(standardFees, freeFees) {
  var subtotal = 0;
  (standardFees || []).forEach(function (o) {
    if (o.code === 'MAINT' || o.kind === 'percentage') return;
    subtotal += om_num_(o.price) * (om_num_(o.qty) || 0);
  });
  (freeFees || []).forEach(function (o) {
    subtotal += om_num_(o.price) * (om_num_(o.qty) || 0);
  });
  return subtotal;
}

/** 利用確認書HTMLをサーバー描画（variant: 'staff' | 'sign'）。会場は自由入力のため住所も表示する。 */
function renderConfirmationHtml_(variant, d, venue) {
  var isStaff = (variant !== 'sign');
  var venueName = venue.name || '';
  var venueAddress = venue.address || '';

  var standardFees = d.standardFees || [];
  var freeFees = d.freeFees || [];
  var stdRows = standardFees.filter(function (o) { return o.code !== 'MAINT' && o.kind !== 'percentage'; }).map(confFeeRowHtml_).join('');
  var freeRows = freeFees.map(confFeeRowHtml_).join('');
  // 維持管理費はボード側の「維持管理費 あり/なし」トグル(d.mgmtFee)で表示自体を
  // 省略できる。表示する場合も、当日実際の数量確定後に手計算・記入するため
  // 自動計算した金額は印字せず空欄「¥」のまま出力する(GPCMボードと同方針)。
  var mgmtFeeOn = d.mgmtFee !== 'なし';
  // (A)未精算額はフロント側(cf.balance)も自動計算しているが、単一の真値を保つため
  // ここでもd.preConfirmed/d.prePaidから独立して再計算する(渡された値は信頼しない)。
  var balanceVal = om_num_(d.preConfirmed) - om_num_(d.prePaid);

  var payNote = confPayNote_(d.prePayMethod);
  var addNote = confPayNote_(d.addPayMethod);
  if (addNote && addNote !== payNote) payNote = '【事前確定分】' + payNote + '\n【追加分】' + addNote;

  var staffShareBody = (d.staffShareHtml != null && d.staffShareHtml !== '')
    ? sanitizeRichHtml_(d.staffShareHtml)
    : '';
  var staffShare = isStaff
    ? '<div class="sec">◆立会スタッフ共有事項（スタッフ用のみ）</div><div class="share">' +
      staffShareBody + '</div>'
    : '';

  var signBlock = !isStaff
    ? '<div class="sec sign">担当者確認欄</div>' +
      '<div class="sign"><div class="st">ご確認・ご署名</div>' +
      '<div style="font-size:11px">上記内容にてご利用内容を確認いたしました。当日精算分の領収書は：</div>' +
      '<div class="chk"><label>☐ 当日お渡し済</label>　<label>☐ 後日PDF送付</label>　<label>☐ 希望なし・当日精算なし</label></div>' +
      '<div class="sign-row"><div class="sign-cell"><div class="lbl">ご署名</div><div class="sign-line"></div></div>' +
      '<div class="sign-cell" style="max-width:200px"><div class="lbl">日付</div><div class="sign-line"></div></div></div></div>'
    : '';

  // 領収書欄はお客様控(サイン用)にのみ必要な情報のため、担当者確認欄と同様
  // サイン用限定・同系統の枠囲みで表示し、見た目でも区別できるようにする。
  // 宛名・送付先が未入力の場合は当日その場で手書きできるよう、欄に十分な高さを確保する。
  var receiptBlock = !isStaff
    ? '<div class="sec receipt">◆領収書</div>' +
      '<div class="receipt-box"><table class="receipt-table">' +
        '<tr><th class="k">宛名</th><td class="name">' + ce_(d.receiptName || '') + '</td></tr>' +
        '<tr><th class="k">送付先</th><td class="addr">' + ce_(d.receiptAddress || '') + '</td></tr></table>' +
      '<div style="font-size:10px;color:#7a4a12;margin-top:6px">※恐れ入りますが、領収書の宛名を「上様」とすることはご遠慮いただいております。<br>※発行後の領収書を分割してのご発行も承っておりませんので、あらかじめご了承ください。</div></div>'
    : '';

  var css =
    "*{box-sizing:border-box;}" +
    "body{font-family:'Hiragino Kaku Gothic ProN','Meiryo','MS PGothic',sans-serif;font-size:9.5px;color:#111;line-height:1.32;margin:0;}" +
    ".doc-head{display:flex;justify-content:space-between;border-bottom:2px solid #1a2b4a;padding-bottom:4px;margin-bottom:4px;}" +
    ".doc-title{font-size:15px;font-weight:bold;}.doc-title .badge{font-size:10px;}.doc-sub{font-size:9.5px;color:#555;}" +
    ".doc-meta{font-size:9.5px;text-align:right;color:#444;}" +
    ".sec{background:#1a2b4a;color:#fff;font-size:10px;font-weight:bold;padding:2.5px 8px;margin:5px 0 2px;page-break-after:avoid;}.sec.sign{background:#0e7a5f;}.sec.receipt{background:#9a6a1e;}" +
    ".receipt-box{border:2px solid #9a6a1e;padding:6px 9px;margin-top:2px;page-break-inside:avoid;}" +
    ".receipt-table td{height:15mm;vertical-align:top;font-size:11px;}.receipt-table td.name{height:12mm;}.receipt-table td.addr{height:8mm;}" +
    "table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:2px;}" +
    "tr{page-break-inside:avoid;}" +
    "th,td{border:1px solid #b0b6bf;padding:1.5px 5px;vertical-align:top;}th{background:#e8ecf2;font-weight:bold;}th.k{width:110px;}" +
    ".summary{white-space:pre-wrap;border:1px solid #b0b6bf;background:#fbfbfd;padding:5px 8px;font-size:9.5px;}" +
    ".share{white-space:pre-wrap;border:1px solid #b0b6bf;background:#fffdf5;padding:5px 8px;font-size:9px;}" +
    ".fee .r{text-align:right;}.paynote{white-space:pre-wrap;border:1px solid #b0b6bf;background:#f4f8ff;padding:4px 7px;font-size:9px;margin-top:2px;}" +
    ".maintnote{font-size:8.5px;color:#666;margin:2px 0 4px;}" +
    // お支払い状況・領収書・署名欄は、お客様が最終的に確認・署名する一連の内容のため、
    // ページまたぎでバラバラに分割されないよう1つの塊としてまとめて改ページ判定する。
    ".pay-group{page-break-inside:avoid;}" +
    ".pay-total{font-size:15px;font-weight:bold;background:#eef4ff;border:1.5px solid #1d4ed8;color:#1d4ed8;}" +
    ".pay-total th{background:#dbe6ff;color:#1a2b4a;}" +
    ".sign{border:2px solid #0e7a5f;padding:6px 9px;margin-top:4px;page-break-inside:avoid;}.sign .st{font-weight:bold;color:#0e7a5f;margin-bottom:3px;}" +
    ".chk{margin:3px 0;}.sign-row{display:flex;gap:22px;margin-top:8px;}.sign-cell{flex:1;}.sign-cell .lbl{font-size:8.5px;color:#555;}.sign-line{border-bottom:1.5px solid #333;height:20px;}" +
    ".layout-block{margin-bottom:6px;}.layout-cap{font-size:9.5px;font-weight:bold;color:#444;margin-bottom:2px;}" +
    ".layout-img{max-width:100%;max-height:260px;border:1px solid #b0b6bf;display:block;}" +
    ".foot{border-top:1px solid #ccc;margin-top:5px;padding-top:3px;font-size:8px;color:#777;text-align:center;}" +
    "@page{size:A4 portrait;margin:7mm;}";

  return '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>' + css + '</style></head><body>' +
    '<div class="doc-head"><div>' +
      '<div class="doc-title">利用確認書 <span class="badge">【' + (isStaff ? 'スタッフ用' : 'サイン用') + '】</span></div>' +
      '<div class="doc-sub">' + ce_(venueName) + (venueAddress ? '　' + ce_(venueAddress) : '') + '</div>' +
    '</div><div class="doc-meta">発行日：' + ce_(d.issueDate || '') +
      '<br>立会担当：' + ce_(d.attendant || '') + '<br>営業担当：' + ce_(d.salesRep || '') + '</div></div>' +
    '<div class="sec">ご利用内容</div><table>' +
      '<tr><th class="k">会場</th><td>' + ce_(venueName) + '</td><th class="k">会場住所</th><td>' + ce_(venueAddress) + '</td></tr>' +
      '<tr><th class="k">会社名・ご担当</th><td>' + ce_(d.company || '') + ' ／ ' + ce_(d.client || '') + ' 様</td>' +
      '<th class="k">予約サイト</th><td>' + ce_(d.site || '') + '</td></tr>' +
      '<tr><th class="k">利用日</th><td>' + ce_(d.useDate || '') + '</td><th class="k">利用時間</th><td>' + ce_(d.useTime || '') + '</td></tr>' +
      '<tr><th class="k">ご利用人数</th><td colspan="3">' + ce_(d.headcount || '') + '</td></tr></table>' +
    '<div class="sec">ご成約内容サマリー</div><div class="summary">' +
      (d.summaryHtml != null ? sanitizeRichHtml_(d.summaryHtml) : ce_(d.summary || '')) + '</div>' +
    staffShare +
    '<div class="sec">◆標準オプション（全会場共通）</div>' +
    '<div style="font-size:10px;color:#666;margin-bottom:3px">スペース延長系は単価未確定(当日手入力)。ゴミ処理・飲み放題は税別・会場により編集可。数量・税抜合計は当日記入。</div>' +
    '<table class="fee"><thead><tr><th>品目</th><th style="width:100px">単価</th><th style="width:70px">数量</th><th style="width:70px">税表記</th></tr></thead><tbody>' + (stdRows || '<tr><td colspan="4" style="text-align:center;color:#888">データなし</td></tr>') + '</tbody></table>' +
    (mgmtFeeOn ? '<div class="maintnote">◆維持管理費（税込）：標準オプション＋自由記述オプションの税抜合計×5% ＝ ¥＿＿＿＿＿＿＿＿（当日記入）</div>' : '') +
    '<div class="sec">◆その他オプション（自由記述）</div>' +
    '<table class="fee"><thead><tr><th>品目</th><th style="width:100px">単価</th><th style="width:70px">数量</th><th style="width:70px">税表記</th></tr></thead><tbody>' + (freeRows || '<tr><td colspan="4" style="text-align:center;color:#888">なし</td></tr>') + '</tbody></table>' +
    '<div class="maintnote" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span>◆追加料金 合計金額（標準+自由記述オプション・税抜、当日計算して記載）＝</span><span style="border:1px solid #333;min-width:110px;display:inline-block;padding:1px 8px">￥</span></div>' +
    '<div class="pay-group">' +
    '<div class="sec">◆お支払い状況</div><table>' +
      '<tr><th class="k">事前確定金額</th><td>' + money_(d.preConfirmed) + '</td><th class="k">事前支払額</th><td>' + money_(d.prePaid) + '</td></tr>' +
      '<tr><th class="k">(A)未精算額</th><td>' + money_(balanceVal) + '</td><th class="k">支払期限</th><td>' + ce_(d.payDue || '') + '</td></tr>' +
      '<tr><th class="k">事前確定分 支払方法</th><td>' + ce_(d.prePayMethod || '') + '</td><th class="k">追加分 支払方法</th><td>' + ce_(d.addPayMethod || '') + '</td></tr>' +
      '<tr class="pay-total"><th class="k">合計お支払い金額</th><td colspan="3">追加料金合計金額 ¥＿＿＿＿＿＿＿＿　＋　<span style="color:#c0392b">(A)事前確定分未精算額 ¥' + balanceVal.toLocaleString() + '</span>　＝　¥＿＿＿＿＿＿＿＿</td></tr></table>' +
    (payNote ? '<div class="paynote">■ お支払いに関するご案内\n' + ce_(payNote) + '</div>' : '') +
    receiptBlock +
    signBlock +
    '</div>' +
    '<div class="foot">本書はTSCM管理ボードの入力内容をもとに自動生成されました（' +
      (isStaff ? 'スタッフ用・社内' : 'サイン用・お客様控') + '）。<br>' + ce_(venueName) +
      '／株式会社あどばる</div>' +
    '</body></html>';
}
