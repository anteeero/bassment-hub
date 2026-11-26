/**
 * Bassment Hub — motore dei dati (Apps Script).
 * Collega l'Hub al foglio "Registro Definitivo Da Bassment Shaolin".
 *  - doGet: ?ics=1 dà il calendario delle uscite (per Google Calendar); senza parametri rimanda all'app.
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

const APP_URL = 'https://anteeero.github.io/bassment-hub/';
const DOC_IG = '1St8Lkr_pSVFMOOJXnHIjsk4Lk2PTgoGPvrh3Li-YdtE';
const DOC_TT = '1GZ7WB7AgjGsqw-pOJoVQfhdS2HAa8iWEzxYoIkNR0dM';

function doGet(e) {
  if (e && e.parameter && e.parameter.ics) {
    return ContentService.createTextOutput(icsFeed_()).setMimeType(ContentService.MimeType.ICAL);
  }
  return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><p style="font:16px system-ui;padding:24px">Bassment Hub ora è un\'app: <a href="' + APP_URL + '" target="_top">apri Bassment Hub</a>.</p>')
    .setTitle('Bassment Hub');
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
      case 'hubSet': out = hubSet_(a[0]); break;
      case 'captions': out = captions_(); break;
      case 'notifCfg': out = notifCfg_(); break;
      case 'notifCfgSet': out = notifCfgSet_(a[0]); break;
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
function batchGet_(ranges) {
  // Veloce: una sola chiamata al servizio avanzato Google Sheets (se attivo nel progetto).
  if (typeof Sheets !== 'undefined' && ranges.length) {
    try {
      const res = Sheets.Spreadsheets.Values.batchGet(SHEET_ID, { ranges: ranges, valueRenderOption: 'FORMATTED_VALUE', majorDimension: 'ROWS' });
      return (res.valueRanges || []).map(v => {
        const out = (v.values || []).map(r => { let n = r.length; while (n && r[n - 1] === '') n--; return r.slice(0, n); });
        let n = out.length; while (n && !out[n - 1].length) n--;
        return out.slice(0, n);
      });
    } catch (e) { /* ripiega sul metodo classico */ }
  }
  const ss = ss_(); return ranges.map(r => read_(ss, r));
}
/* Scrive una cella solo se nella colonna chiave della stessa riga c'è ancora quello che l'app si aspetta. */
function hubSet_(x) {
  const ss = ss_(), k = parseA1_(ss, x.keyRange), c = parseA1_(ss, x.range);
  const cur = k.sh.getRange(k.r0, k.c0).getDisplayValue();
  if (nrmKey_(cur) !== nrmKey_(x.expect)) return { moved: true, cur: cur };
  let v = x.value;
  if (v === true || v === false) c.sh.getRange(c.r0, c.c0).setValue(v);
  else c.sh.getRange(c.r0, c.c0).setValue(v === null || v === undefined ? '' : v);
  SpreadsheetApp.flush();
  return { ok: true };
}
function nrmKey_(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, "'").trim(); }

/* ---- didascalie dai due documenti (Instagram e TikTok) ---- */
function captions_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('captions:v1');
  if (hit) return JSON.parse(hit);
  const out = { ig: parseCaptions_(DOC_IG), tt: parseCaptions_(DOC_TT), t: Date.now() };
  const txt = JSON.stringify(out);
  if (txt.length < 95000) cache.put('captions:v1', txt, 600);
  return out;
}
function parseCaptions_(id) {
  const body = DocumentApp.openById(id).getBody(), out = {};
  let cur = null;
  for (let i = 0; i < body.getNumChildren(); i++) {
    const el = body.getChild(i), type = el.getType();
    if (type !== DocumentApp.ElementType.PARAGRAPH && type !== DocumentApp.ElementType.LIST_ITEM) continue;
    const p = type === DocumentApp.ElementType.PARAGRAPH ? el.asParagraph() : el.asListItem();
    const text = p.getText().trim();
    if (p.getHeading() === DocumentApp.ParagraphHeading.HEADING2) {
      const m = text.split(' · ');
      cur = (m.length > 1 && !/^prima di/i.test(text)) ? { title: m[0].trim(), artist: m.slice(1).join(' · ').trim(), lines: [], note: '' } : null;
      if (cur) out[nrmKey_(cur.title)] = cur;
      continue;
    }
    if (!cur || !text) continue;
    if (/^(Pubblicazione|TikTok):/.test(text)) continue;
    const t = p.editAsText();
    if (t.isItalic(0) && t.isItalic(text.length - 1)) { cur.note = (cur.note ? cur.note + ' ' : '') + text; continue; }
    cur.lines.push(text);
  }
  Object.keys(out).forEach(k => { out[k].text = out[k].lines.join('\n\n'); delete out[k].lines; });
  return out;
}

/* ---- calendario iCal: uscite, post foto, Reddit, video Suono, promemoria ---- */
function icsFeed_() {
  const ss = ss_(), ev = [];
  const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const day = s => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || '')); return m ? m[3] + ('0' + m[2]).slice(-2) + ('0' + m[1]).slice(-2) : null; };
  const add = (d, title, desc, uid) => { if (d) ev.push(['BEGIN:VEVENT', 'UID:' + uid + '@bassment-hub', 'DTSTAMP:' + Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'"), 'DTSTART;VALUE=DATE:' + d, 'SUMMARY:' + esc(title), 'DESCRIPTION:' + esc(desc), 'URL:' + APP_URL, 'END:VEVENT'].join('\r\n')); };
  const col = (h, name) => { const n = nrmKey_(name), hh = (h || []).map(nrmKey_); let i = hh.indexOf(n); if (i < 0) i = hh.findIndex(c => c.startsWith(n)); return i; };
  const data = batchGet_([RANGES.s1, RANGES.s2, RANGES.s3, RANGES.foto, RANGES.rd, RANGES.su, "'Promemoria'!A1:E200"]);
  data.slice(0, 3).forEach((rows, si) => {
    const h = rows[0], cd = col(h, 'Data di pubblicazione'), cv = col(h, 'Video'), ca = col(h, 'Artista'), cb = col(h, 'Basso'), cs = col(h, 'Stato');
    rows.slice(1).forEach((r, i) => { const d = day(r[cd]); if (d && r[cv]) add(d, '🎸 ' + r[cv] + ' · ' + (r[ca] || ''), 'Instagram · basso ' + (r[cb] || '-') + ' · ' + (r[cs] || ''), 's' + (si + 1) + '-' + (i + 2) + '-' + d); });
  });
  [[data[3], 'Data', 'Tipo', '📷 Post foto: ', 'foto'], [data[4], 'Data', 'Community', '💬 Reddit: ', 'rd'], [data[5], 'Data', 'Idea', '🔊 Video Suono: ', 'su']].forEach(([rows, dn, tn, pre, k]) => {
    const h = rows[0] || [], cd = col(h, dn), ct = col(h, tn), cst = col(h, 'Stato');
    rows.slice(1).forEach((r, i) => { const d = day(r[cd]); if (d && r[ct]) add(d, pre + r[ct], r[cst] || '', k + '-' + (i + 2) + '-' + d); });
  });
  (data[6] || []).slice(1).forEach((r, i) => { const d = day(r[0]); if (d && r[2]) add(d, '🔔 ' + r[2], r[1] ? 'Ore ' + r[1] : '', 'pm-' + (i + 2) + '-' + d); });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bassment Hub//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Bassment Hub', 'X-PUBLISHED-TTL:PT6H', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H'].concat(ev).concat(['END:VCALENDAR']).join('\r\n');
}

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
