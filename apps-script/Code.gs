/**
 * Bassment Hub — motore dei dati (Apps Script).
 * Collega l'Hub al foglio "Registro Definitivo Da Bassment Shaolin".
 *  - doGet senza parametri: la vecchia versione web dell'Hub (Index.html), solo per te.
 *  - doPost: l'API usata dall'app (PWA su GitHub Pages). Risponde in JSON.
 * Le notifiche stanno in Notify.gs (regole) e Push.gs (firma e invio).
 */
const SHEET_ID = '1FYRP6PXDlydO_meaNmgrS_LUdlgLBscrrBh4AKcg3m8';
const RANGES = {
  s1: "'1° Stagione'!A1:Q130", s2: "'2° Stagione'!A1:Q130", s3: "'3° Stagione'!A1:Q130",
  rep: "'Repertorio'!A1:R1043", arch: "'Archivio scartati'!A1:S400", ord: "'Ordine di registrazione'!A1:S75", obi: "'Obiettivi'!A1:H60",
  rete: "'Rete'!A1:I60", stat: "'Statistiche'!A1:S300", promo: "'Promozioni'!A1:M100", acc: "'Account da studiare'!A1:J40", dis: "'Dischi da scremare'!A1:G308", foto: "'Post foto'!A1:G80", rd: "'Reddit'!A1:K120", su: "'Suono'!A1:R80", rk: "'Reddit karma'!A1:G300", leg: "'Legenda'!A1:A60"
};
const CHECK_TAB = 'Storico Check';

function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  let snap = null;
  try {
    const keys = Object.keys(RANGES), vals = batchGet_(keys.map(k => RANGES[k]));
    snap = {};
    keys.forEach((k, i) => { snap[k] = vals[i]; });
  } catch (e) { snap = null; }
  t.snap = JSON.stringify(snap).replace(/</g, '\\u003c');
  t.snapOk = snap ? 'true' : 'false';
  t.time = String(Date.now());
  return t.evaluate()
    .setTitle('Bassment Hub')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/* ---- API per l'app ---- */
function doPost(e) {
  let out;
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const a = b.args || [];
    switch (b.fn) {
      case 'hubGet': out = batchGet_(a[0] || []); break;
      case 'hubCall': out = JSON.parse(hubCall(a[0], JSON.stringify(a[1] || {}))); break;
      case 'checkList': out = JSON.parse(checkList()); break;
      case 'checkSet': checkSet(String(a[0]), JSON.stringify(a[1] || {})); out = 'ok'; break;
      case 'checkDel': checkDel(String(a[0])); out = 'ok'; break;
      case 'pushKey': out = vapidPublicKey(); break;
      case 'pushSub': out = pushSub(String(a[0]), a[1], a[2], a[3]); break;
      case 'pushUnsub': out = pushUnsub(String(a[0])); break;
      case 'pushInbox': out = pushInbox(a[0]); break;
      case 'pushTest': out = pushTest(); break;
      default: throw new Error('Funzione non prevista: ' + b.fn);
    }
    out = { ok: true, data: out };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---- lettura e scrittura del foglio, con il tuo account ---- */
function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function col_(s) { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
function parseA1_(ss, a1) {
  const m = /^(?:'((?:[^']|'')+)'|([^!]+))!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(String(a1).trim());
  if (!m) throw new Error('Intervallo non valido: ' + a1);
  const name = m[1] ? m[1].replace(/''/g, "'") : m[2];
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Scheda non trovata: ' + name);
  const c0 = col_(m[3]), r0 = +m[4];
  return { sh: sh, r0: r0, c0: c0, r1: m[6] ? +m[6] : r0, c1: m[5] ? col_(m[5]) : c0 };
}
function read_(ss, a1) {
  const p = parseA1_(ss, a1), sh = p.sh;
  const last = Math.min(p.r1, sh.getLastRow()), cc = Math.min(p.c1, sh.getMaxColumns());
  if (last < p.r0 || cc < p.c0) return [];
  const v = sh.getRange(p.r0, p.c0, last - p.r0 + 1, cc - p.c0 + 1).getDisplayValues();
  const out = v.map(r => { let n = r.length; while (n && r[n - 1] === '') n--; return r.slice(0, n); });
  let n = out.length; while (n && !out[n - 1].length) n--;
  return out.slice(0, n);
}
function batchGet_(ranges) { const ss = ss_(); return ranges.map(r => read_(ss, r)); }
function hubGet(ranges) { return JSON.stringify(batchGet_(ranges)); }
function sheetById_(ss, id) {
  const sh = ss.getSheets().filter(s => s.getSheetId() === Number(id))[0];
  if (!sh) throw new Error('Scheda non trovata: ' + id);
  return sh;
}
function hubCall(tool, argsJson) {
  const a = JSON.parse(argsJson), ss = ss_();
  if (tool === 'update_values') {
    const p = parseA1_(ss, a.range), rows = a.values || [];
    const w = Math.max(1, ...rows.map(r => r.length));
    const vals = rows.map(r => { const x = r.map(v => v === null || v === undefined ? '' : v); while (x.length < w) x.push(''); return x; });
    p.sh.getRange(p.r0, p.c0, vals.length, w).setValues(vals);
    SpreadsheetApp.flush();
    return '{}';
  }
  if (tool === 'insert_dimension') {
    if (a.dimension !== 'ROWS') throw new Error('Solo righe');
    const sh = sheetById_(ss, a.sheetId), n = a.endIndex - a.startIndex;
    if (a.startIndex > 0) sh.insertRowsAfter(a.startIndex, n); else sh.insertRowsBefore(1, n);
    SpreadsheetApp.flush();
    return '{}';
  }
  if (tool === 'update_spreadsheet') {
    (a.requests || []).forEach(rq => {
      const d = rq.deleteDimension;
      if (!d || d.range.dimension !== 'ROWS') throw new Error('Operazione non prevista');
      sheetById_(ss, d.range.sheetId).deleteRows(d.range.startIndex + 1, d.range.endIndex - d.range.startIndex);
    });
    SpreadsheetApp.flush();
    return '{}';
  }
  throw new Error('Operazione non prevista: ' + tool);
}

/* ---- storico di Bassment Check, nella scheda "Storico Check" ---- */
function checkSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(CHECK_TAB);
  if (!sh) {
    sh = ss.insertSheet(CHECK_TAB);
    sh.getRange(1, 1, 1, 3).setValues([['ID', 'Titolo', 'Dati (non modificare)']]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function checkRow_(sh, id) {
  const n = sh.getLastRow();
  if (n < 2) return 0;
  const ids = sh.getRange(2, 1, n - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}
function checkList() {
  const sh = checkSheet_(), n = sh.getLastRow();
  if (n < 2) return '[]';
  const out = [];
  sh.getRange(2, 1, n - 1, 3).getDisplayValues().forEach(r => {
    if (!r[0]) return;
    try { const d = JSON.parse(r[2]); d.id = r[0]; out.push(d); } catch (e) {}
  });
  return JSON.stringify(out);
}
function checkSet(id, json) {
  const sh = checkSheet_(), d = JSON.parse(json);
  const row = checkRow_(sh, id) || sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, 3).setNumberFormat('@').setValues([[id, String(d.title || ''), json]]);
  return 'ok';
}
function checkDel(id) {
  const sh = checkSheet_(), row = checkRow_(sh, id);
  if (row) sh.deleteRow(row);
  return 'ok';
}
