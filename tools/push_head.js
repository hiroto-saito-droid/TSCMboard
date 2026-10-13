// TSCMboard の内容を HEAD（検証用URL）へ反映する。
//
// CLAUDE.md の取り決め:
//   content の更新は自由。ただし新しいバージョンを作って本番デプロイへ
//   紐付ける操作は、齋藤さんが検証用URLで確認して明示の指示を出したときだけ。
// このスクリプトは content を書くだけ。バージョンもデプロイも作らない。
//
//   node tools/push_head.js          … 送る中身を確認する
//   node tools/push_head.js --apply  … 実際に送る
const fs = require('fs');
const https = require('https');

const APPLY = process.argv.indexOf('--apply') >= 0;
const SID = '1dko-WKHjotpNwJSeqv2AS4QAajjftZBR90X8sYuON2Abw6yCRAoVJ-5M';   // TSCMboard
const SRC = 'C:/Users/hi_saitou/TSCMboard/src/';
const PROD_DEPLOY = 'AKfycbxPRYx_2qBpq5OTJL7x8iZcseYcjp38jbNGDpxaV5CVjU_q_EhQGAVZzAP2LnfMId_Jig';

const T = JSON.parse(fs.readFileSync('C:/Users/hi_saitou/.clasprc.json', 'utf8'));
const AT = T.tokens[Object.keys(T.tokens)[0]].access_token;

function call(method, path, body) {
  const data = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
  return new Promise(r => {
    const req = https.request({
      hostname: 'script.googleapis.com', path, method,
      headers: Object.assign({ Authorization: 'Bearer ' + AT },
        data ? { 'Content-Type': 'application/json; charset=UTF-8', 'Content-Length': data.length } : {})
    }, res => {
      res.setEncoding('utf8');   // これが無いとマルチバイトが境界で壊れる
      let s = '';
      res.on('data', c => s += c);
      res.on('end', () => { let j = {}; try { j = JSON.parse(s); } catch (e) { j = { raw: s }; }
        r({ status: res.statusCode, body: j }); });
    });
    req.on('error', e => r({ status: 0, body: { error: { message: e.message } } }));
    if (data) req.write(data);
    req.end();
  });
}

function collect() {
  const out = [];
  for (const f of fs.readdirSync(SRC)) {
    const src = fs.readFileSync(SRC + f, 'utf8');
    if (/\uFFFD/.test(src)) throw new Error('文字化けが混ざっている: ' + f);
    if (f === 'appsscript.json') out.push({ name: 'appsscript', type: 'JSON', source: src });
    else if (/\.gs$/.test(f)) out.push({ name: f.replace(/\.gs$/, ''), type: 'SERVER_JS', source: src });
    else if (/\.html$/.test(f)) out.push({ name: f.replace(/\.html$/, ''), type: 'HTML', source: src });
  }
  if (!out.some(x => x.name === 'appsscript')) throw new Error('appsscript.json が無い');
  return out;
}

// ---- 送る前に構文を確かめる（白紙表示の事故を防ぐ） ----
// IndexScript.html は中身がまるごとJSで、1か所でも壊れると画面が真っ白になる。
// 文字列の中に生の改行が入っていた事故が実際にあった（Issue #53）。
function checkSyntax_() {
  const vm = require('vm');
  const ng = [];
  for (const f of fs.readdirSync(SRC)) {
    const full = SRC + f;
    const src = fs.readFileSync(full, 'utf8');
    // .gs はそのまま。.html は <script> の中だけを1つずつ見る。
    // （HTMLの中にscriptが複数あるので、最初から最後までをまとめて見ると
    //   間のHTMLが混ざって、ありもしないエラーになる）
    const parts = [];
    if (/\.gs$/.test(f)) parts.push(src);
    else if (/\.html$/.test(f)) {
      const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
      let m;
      while ((m = re.exec(src))) parts.push(m[1]);
    }
    for (const raw of parts) {
      if (!raw.trim()) continue;
      // GASのテンプレート記法は、そのままでは JS として読めない。
      //   <?= 値 ?> / <?!= 値 ?> … 値の埋め込み → null に置き換える
      //   <? 文 ?>               … 制御構文     → 取り除く
      const js = raw
        .replace(/<\?!?=[\s\S]*?\?>/g, 'null')
        .replace(/<\?[\s\S]*?\?>/g, '');
      try { new vm.Script(js); }
      catch (e) { ng.push(f + ': ' + String(e.message).split('\n')[0]); break; }
    }
  }
  return ng;
}

(async () => {
  // 送る前に必ず構文を見る。1か所壊れるとボードが真っ白になるため。
  const _ng = checkSyntax_();
  if (_ng.length) {
    console.log('★構文エラーがあるので送りません:');
    _ng.forEach(x => console.log('   ' + x));
    return;
  }
  console.log('構文の確認: 問題なし');

  const files = collect();
  console.log('送るファイル ' + files.length + '件');
  files.forEach(f => console.log('  ' + f.name.padEnd(22) + f.type.padEnd(11) + f.source.length + '字'));

  // 事前に、本番デプロイが版固定のままであることを確かめる
  const dl = await call('GET', '/v1/projects/' + SID + '/deployments');
  const prod = (dl.body.deployments || []).filter(x => x.deploymentId === PROD_DEPLOY)[0];
  if (!prod) { console.log('★本番デプロイが見つからない。中止する'); return; }
  const pv = (prod.deploymentConfig || {}).versionNumber;
  if (!pv) { console.log('★本番デプロイが版固定でない。中止する'); return; }
  console.log('\n本番デプロイは @' + pv + ' に固定されたまま（ここは触らない）');

  if (!APPLY) { console.log('\n--apply を付けると HEAD へ送る'); return; }

  const up = await call('PUT', '/v1/projects/' + SID + '/content', { files });
  if (up.status !== 200) {
    console.log('★送れなかった: ' + (((up.body || {}).error || {}).message || up.status));
    return;
  }
  console.log('HEAD へ反映した（検証用URLに出る）');

  // 送ったあとも本番が動いていないことを確かめる
  const dl2 = await call('GET', '/v1/projects/' + SID + '/deployments');
  const prod2 = (dl2.body.deployments || []).filter(x => x.deploymentId === PROD_DEPLOY)[0];
  const pv2 = prod2 ? (prod2.deploymentConfig || {}).versionNumber : null;
  console.log(pv2 === pv ? ('本番デプロイは @' + pv2 + ' のまま。動いていない')
                         : ('★本番デプロイが @' + pv + ' → @' + pv2 + ' に変わった'));
})();
