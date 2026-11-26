/**
 * Bassment Hub — notifiche.
 * Ogni ora controlla il foglio; quando c'è qualcosa da dire lo scrive nella scheda "Notifiche"
 * e sveglia i dispositivi iscritti. L'app legge le novità e le mostra.
 *
 * Da eseguire UNA volta dall'editor: attivaNotifiche  (chiede l'autorizzazione e crea l'attivatore orario).
 */
const NOTIF_TAB = 'Notifiche';
const PROMEMORIA_TAB = 'Promemoria';
const ORA_MATTINA = 8;    // predefinita: riepilogo del mattino (ora del tuo fuso)
const ORA_DOMENICA = 20;  // predefinita: promemoria numeri della settimana
const CATEGORIE = ['uscite', 'post', 'scadenze', 'numeri', 'promemoria'];
const PROMO_RANGE = "'" + PROMEMORIA_TAB + "'!A1:E200";

/* ---------- configurazione ---------- */
function attivaNotifiche() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'notificheOrarie').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('notificheOrarie').timeBased().everyHours(1).create();
  vapidPublicKey();
  notifSheet_(); promemoriaSheet_();
  UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true });
  Logger.log('Notifiche attive. Fuso: ' + fuso_());
}
/* Impostazioni modificabili dall'app: ore e categorie spente. */
function notifCfg_() {
  let c = {};
  try { c = JSON.parse(PropertiesService.getScriptProperties().getProperty('NOTIF_CFG') || '{}'); } catch (e) {}
  return { ora: c.ora != null ? c.ora : ORA_MATTINA, oraDomenica: c.oraDomenica != null ? c.oraDomenica : ORA_DOMENICA, spente: c.spente || [], fuso: fuso_(), dispositivi: Object.keys(subs_()).map(k => subs_()[k].label || 'dispositivo') };
}
function notifCfgSet_(c) {
  const ora = Math.max(0, Math.min(23, parseInt(c.ora, 10))), oraDom = Math.max(0, Math.min(23, parseInt(c.oraDomenica, 10)));
  const spente = (c.spente || []).filter(x => CATEGORIE.indexOf(x) >= 0);
  PropertiesService.getScriptProperties().setProperty('NOTIF_CFG', JSON.stringify({ ora: isNaN(ora) ? ORA_MATTINA : ora, oraDomenica: isNaN(oraDom) ? ORA_DOMENICA : oraDom, spente: spente }));
  return notifCfg_();
}
function fuso_() { return PropertiesService.getScriptProperties().getProperty('NOTIF_TZ') || Session.getScriptTimeZone(); }

/* ---------- dispositivi iscritti ---------- */
function subs_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('PUSH_SUBS') || '{}'); } catch (e) { return {}; } }
function saveSubs_(s) { PropertiesService.getScriptProperties().setProperty('PUSH_SUBS', JSON.stringify(s)); }
function pushSub(id, sub, tz, label) {
  if (!sub || !/^https:\/\//.test(sub.endpoint || '')) throw new Error('Iscrizione non valida');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const s = subs_();
    s[id] = { endpoint: sub.endpoint, label: String(label || '').slice(0, 60), t: Date.now() };
    saveSubs_(s);
    if (tz) PropertiesService.getScriptProperties().setProperty('NOTIF_TZ', tz);
  } finally { lock.releaseLock(); }
  return Object.keys(subs_()).length;
}
function pushUnsub(id) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { const s = subs_(); delete s[id]; saveSubs_(s); } finally { lock.releaseLock(); }
  return 'ok';
}
function pushAll_() {
  const s = subs_(); let changed = false, sent = 0;
  Object.keys(s).forEach(id => {
    try {
      const code = pushTo_(s[id]);
      if (code === 404 || code === 410) { delete s[id]; changed = true; } else if (code < 300) sent++;
    } catch (e) {}
  });
  if (changed) saveSubs_(s);
  return sent;
}

/* ---------- registro delle notifiche (scheda "Notifiche") ---------- */
function notifSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(NOTIF_TAB);
  if (!sh) {
    sh = ss.insertSheet(NOTIF_TAB);
    sh.getRange(1, 1, 1, 7).setValues([['Creata', 'Titolo', 'Testo', 'Sezione', 'Chiave', 'ID', 'Azioni']]);
    sh.setFrozenRows(1);
  } else if (sh.getRange(1, 7).getDisplayValue() !== 'Azioni') sh.getRange(1, 7).setValue('Azioni');
  return sh;
}
function promemoriaSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(PROMEMORIA_TAB);
  if (!sh) {
    sh = ss.insertSheet(PROMEMORIA_TAB);
    sh.getRange(1, 1, 1, 5).setValues([['Data', 'Ora', 'Testo', 'Sezione', 'Inviato']]);
    sh.getRange(2, 1, 1, 5).setValues([['', '', 'Esempio: scrivi qui data (gg/mm/aaaa), ora (hh:mm) e testo. Sezione = dove apre il tocco (oggi, calendario, foto, reddit, numeri, repertorio...).', '', '']]);
    sh.setFrozenRows(1);
  }
  return sh;
}
/* Aggiunge le notifiche nuove (salta quelle con una chiave già usata). Ritorna quante ne ha aggiunte. */
function addNotifs_(items) {
  if (!items.length) return 0;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = notifSheet_(), n = sh.getLastRow();
    const keys = new Set(n > 1 ? sh.getRange(Math.max(2, n - 400), 5, Math.min(n - 1, 401), 1).getDisplayValues().map(r => r[0]) : []);
    const now = Date.now(), rows = [];
    items.forEach((it, i) => {
      if (it.key && keys.has(it.key)) return;
      keys.add(it.key);
      rows.push([new Date(now + i), it.title, it.body || '', it.view || 'oggi', it.key || '', String(now + i), it.actions && it.actions.length ? JSON.stringify(it.actions) : '']);
    });
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
    const tot = sh.getLastRow();
    if (tot > 600) sh.deleteRows(2, tot - 500);
    return rows.length;
  } finally { lock.releaseLock(); }
}
/* L'app chiede: cosa c'è di nuovo dopo "since"? */
function pushInbox(since) {
  const sh = notifSheet_(), n = sh.getLastRow();
  if (n < 2) return { now: Date.now(), items: [] };
  const from = Math.max(2, n - 60);
  const rows = sh.getRange(from, 1, n - from + 1, 7).getValues();
  const items = rows.map(r => { let actions = []; try { actions = r[6] ? JSON.parse(r[6]) : []; } catch (e) {} return { id: String(r[5]), t: Number(r[5]) || (r[0] instanceof Date ? r[0].getTime() : 0), title: String(r[1]), body: String(r[2]), view: String(r[3] || 'oggi'), actions: actions }; })
    .filter(x => x.t > Number(since || 0) && x.title).slice(-8);
  return { now: Date.now(), items: items };
}
function pushTest() {
  const added = addNotifs_([{ cat: 'test', title: 'Notifiche attive', body: 'Da ora Bassment Hub ti avvisa su uscite, caricamenti, post e scadenze.', view: 'oggi', key: 'test:' + Date.now() }]);
  return { added: added, sent: pushAll_() };
}

/* ---------- date nel fuso giusto (come numero di giorno) ---------- */
function dayNum_(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 864e5); }
function pday_(s) { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || '')); return m ? dayNum_(+m[3], +m[2], +m[1]) : null; }
function fmtDay_(n) {
  const d = new Date(n * 864e5), WD = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'], MO = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return WD[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MO[d.getUTCMonth()];
}
const nrm_ = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim();
const gv_ = (r, i) => (i >= 0 && r && r[i] != null ? String(r[i]).trim() : '');
const tru_ = v => String(v).toUpperCase() === 'TRUE';
function cols_(header, spec) {
  const h = (header || []).map(nrm_), out = {};
  Object.keys(spec).forEach(k => { const n = nrm_(spec[k]); let i = h.indexOf(n); if (i < 0) i = h.findIndex(c => c.startsWith(n)); out[k] = i; });
  return out;
}

/* ---------- il controllo orario ---------- */
function notificheOrarie() {
  const tz = fuso_();
  const parts = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd-HH-u').split('-').map(Number);
  const today = dayNum_(parts[0], parts[1], parts[2]), hour = parts[3], wd = parts[4]; // wd: 1 lun … 7 dom
  const cfg = notifCfg_(), off = cfg.spente;
  let items = [];
  if (hour === cfg.ora) items = items.concat(regoleMattino_(today, wd));
  if (wd === 7 && hour === cfg.oraDomenica) items.push({ cat: 'numeri', title: 'Numeri della settimana', body: 'È domenica sera: apri Claude dal PC per la raccolta delle statistiche.', view: 'numeri', key: 'stats:' + today });
  if (off.indexOf('promemoria') < 0) items = items.concat(regolePromemoria_(today, hour, cfg.ora));
  items = items.filter(it => off.indexOf(it.cat) < 0);
  if (addNotifs_(items)) pushAll_();
}

function colL_(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
/* Bottone d'azione: scrive "value" nella cella (riga del video), solo se la riga contiene ancora quel titolo. */
function azione_(id, title, tab, row, col, keyCol, expect, value, done) {
  if (!(col >= 0) || !(keyCol >= 0)) return null;
  const T = "'" + tab + "'!";
  return { id: id, title: title, done: done, set: { range: T + colL_(col) + row, keyRange: T + colL_(keyCol) + row, expect: expect, value: value } };
}
function caricaAzioni_(v) {
  return [!v.tt && azione_('tt', 'Fatto su TikTok', v.tab, v.row, v.c.tt, v.c.video, v.video, true, 'TikTok segnato'),
          !v.yt && azione_('yt', 'Fatto su YouTube', v.tab, v.row, v.c.yt, v.c.video, v.video, true, 'YouTube segnato')].filter(Boolean);
}

function regoleMattino_(today, wd) {
  const ss = ss_(), out = [];
  /* --- uscite e caricamenti --- */
  const vids = [], TABS = { s1: '1° Stagione', s2: '2° Stagione', s3: '3° Stagione' };
  ['s1', 's2', 's3'].forEach(k => {
    const rows = read_(ss, RANGES[k]);
    const c = cols_(rows[0], { data: 'Data di pubblicazione', video: 'Video', artista: 'Artista', stato: 'Stato', prog: 'Programmato', tt: 'TikTok pubblicato', yt: 'YouTube pubblicato' });
    rows.slice(1).forEach((r, i) => { const d = pday_(gv_(r, c.data)); if (d != null && gv_(r, c.video)) vids.push({ d: d, tab: TABS[k], row: i + 2, c: c, video: gv_(r, c.video), artista: gv_(r, c.artista), stato: nrm_(gv_(r, c.stato)), prog: tru_(gv_(r, c.prog)), tt: tru_(gv_(r, c.tt)), yt: tru_(gv_(r, c.yt)) }); });
  });
  vids.sort((a, b) => a.d - b.d);
  vids.filter(v => v.d === today).forEach(v => out.push({
    cat: 'uscite', title: 'Esce oggi: ' + v.video, body: v.artista + ' · Instagram' + (v.prog ? ', già programmato' : ' — non risulta programmato!'), view: 'oggi', key: 'uscita:' + today + ':' + v.video
  }));
  const daSegnare = vids.filter(v => v.d < today && v.d >= today - 7 && v.stato !== 'pubblicato');
  if (daSegnare.length) out.push({ cat: 'uscite', title: daSegnare.length === 1 ? 'Da segnare come pubblicato' : daSegnare.length + ' video da segnare come pubblicati', body: daSegnare.map(v => v.video).join(', '), view: 'calendario', key: 'segna:' + today,
    actions: daSegnare.length === 1 ? [azione_('pub', 'Segna pubblicato', daSegnare[0].tab, daSegnare[0].row, daSegnare[0].c.stato, daSegnare[0].c.video, daSegnare[0].video, 'Pubblicato', 'Segnato come pubblicato')].filter(Boolean) : [] });
  const pronti = vids.filter(v => ['montato', 'programmato', 'pubblicato'].indexOf(v.stato) >= 0);
  const caricaOggi = pronti.filter(v => v.d + 1 === today && (!v.tt || !v.yt));
  caricaOggi.forEach(v => out.push({ cat: 'uscite', title: 'Oggi su TikTok e YouTube: ' + v.video, body: 'Manca su ' + [!v.tt && 'TikTok', !v.yt && 'YouTube'].filter(Boolean).join(' e ') + '.', view: 'oggi', key: 'carica:' + today + ':' + v.video, actions: caricaAzioni_(v) }));
  const arretrati = pronti.filter(v => v.d + 1 < today && v.d + 1 >= today - 21 && (!v.tt || !v.yt));
  if (arretrati.length) out.push({ cat: 'uscite', title: arretrati.length === 1 ? 'Ancora da caricare: ' + arretrati[0].video : arretrati.length + ' video ancora da caricare', body: arretrati.map(v => v.video + ' (' + [!v.tt && 'TikTok', !v.yt && 'YouTube'].filter(Boolean).join(', ') + ')').join(' · '), view: 'oggi', key: 'arretrati:' + today, actions: arretrati.length === 1 ? caricaAzioni_(arretrati[0]) : [] });

  /* --- post foto, Reddit, video Suono --- */
  const fr = read_(ss, RANGES.foto), fc = cols_(fr[0], { data: 'Data', ora: 'Ora', tipo: 'Tipo', basso: 'Basso', stato: 'Stato' });
  fr.slice(1).forEach((r, i) => {
    const d = pday_(gv_(r, fc.data)); if (d == null) return;
    const st = nrm_(gv_(r, fc.stato) || 'Da scattare'), n = d - today;
    if (st === 'pubblicata' || st === 'pubblicato' || st === 'saltata' || st === 'saltato') return;
    const cosa = [gv_(r, fc.tipo), gv_(r, fc.basso)].filter(Boolean).join(' · ');
    if (n === 0 || n === 1) out.push({ cat: 'post', title: (n === 0 ? 'Oggi' : 'Domani') + ' post foto' + (gv_(r, fc.ora) ? ' alle ' + gv_(r, fc.ora) : ''), body: cosa + (st === 'da scattare' ? ' — foto ancora da scattare!' : st === 'programmata' ? ' — già programmata.' : ''), view: 'foto', key: 'foto:' + today + ':' + d,
      actions: [n === 0 && azione_('fpub', 'Pubblicata', 'Post foto', i + 2, fc.stato, fc.data, gv_(r, fc.data), 'Pubblicata', 'Post foto segnato come pubblicato'), st === 'da scattare' && azione_('fprog', 'Programmata', 'Post foto', i + 2, fc.stato, fc.data, gv_(r, fc.data), 'Programmata', 'Post foto segnato come programmato')].filter(Boolean) });
    else if (n > 1 && n <= 3 && st === 'da scattare') out.push({ cat: 'post', title: 'Foto da scattare', body: cosa + ' esce ' + fmtDay_(d) + '.', view: 'foto', key: 'scatta:' + today + ':' + d });
  });
  const rr = read_(ss, RANGES.rd), rc = cols_(rr[0], { data: 'Data', comm: 'Community', tipo: 'Tipo', post: 'Post', stato: 'Stato' });
  rr.slice(1).forEach((r, i) => {
    const d = pday_(gv_(r, rc.data)); if (d == null || !gv_(r, rc.post)) return;
    if (['pubblicato', 'rimosso', 'saltato'].indexOf(nrm_(gv_(r, rc.stato))) >= 0) return;
    const n = d - today;
    if (n === 0 || n === 1) out.push({ cat: 'post', title: (n === 0 ? 'Oggi' : 'Domani') + ' su Reddit: ' + gv_(r, rc.comm), body: gv_(r, rc.post), view: 'reddit', key: 'reddit:' + today + ':' + d + ':' + gv_(r, rc.post).slice(0, 30),
      actions: n === 0 ? [azione_('rpub', 'Pubblicato', 'Reddit', i + 2, rc.stato, rc.post, gv_(r, rc.post), 'Pubblicato', 'Post Reddit segnato come pubblicato')].filter(Boolean) : [] });
  });
  const sr = read_(ss, RANGES.su), sc = cols_(sr[0], { data: 'Data', idea: 'Idea', stato: 'Stato' });
  sr.slice(1).forEach(r => {
    const d = pday_(gv_(r, sc.data)); if (d == null || !gv_(r, sc.idea)) return;
    if (['pubblicato', 'scartato'].indexOf(nrm_(gv_(r, sc.stato))) >= 0) return;
    const n = d - today;
    if (n === 0 || n === 1) out.push({ cat: 'post', title: (n === 0 ? 'Oggi' : 'Domani') + ' video Suono', body: gv_(r, sc.idea), view: 'suono', key: 'suono:' + today + ':' + d });
  });

  /* --- scadenze --- */
  const or = read_(ss, RANGES.ord), oc = cols_(or[0], { entro: 'Registrare entro', brano: 'Brano', audio: 'Audio', video: 'Video' });
  const daReg = [];
  or.slice(1).forEach(r => {
    if (!/^\d+$/.test(gv_(r, 0))) return;
    const d = pday_(gv_(r, oc.entro)); if (d == null) return;
    if (tru_(gv_(r, oc.audio)) && tru_(gv_(r, oc.video))) return;
    if (d - today >= 0 && d - today <= 2) daReg.push(gv_(r, oc.brano) + ' (entro ' + fmtDay_(d) + ')');
  });
  if (daReg.length) out.push({ cat: 'scadenze', title: 'Da registrare a breve', body: daReg.join(' · '), view: 'registra', key: 'registra:' + today });
  if (wd === 1) {
    const ready = pronti.filter(v => v.d >= today);
    const last = ready.length ? ready[ready.length - 1].d : null;
    if (last == null || last - today <= 21) out.push({ cat: 'scadenze', title: last == null ? 'Nessun video montato in coda' : 'Video montati fino a ' + fmtDay_(last), body: last == null ? 'Il calendario non ha video pronti da qui in avanti.' : 'Restano ' + (last - today) + ' giorni di video pronti: pianifica la prossima sessione.', view: 'calendario', key: 'scorta:' + today });
  }
  const ob = read_(ss, RANGES.obi), m = /\bal (\d{1,2}\/\d{1,2}\/\d{4})/.exec(gv_(ob[0] || [], 0));
  if (m) {
    const end = pday_(m[1]), n = end - today;
    if (n === 7 || n === 1 || n === 0) out.push({ cat: 'scadenze', title: n === 0 ? 'Oggi si chiudono gli obiettivi' : 'Obiettivi: ' + (n === 1 ? 'domani' : 'tra 7 giorni') + ' il confronto', body: 'Traguardi fissati per ' + fmtDay_(end) + ': controlla i numeri.', view: 'numeri', key: 'obiettivi:' + today });
  }
  return out;
}

function regolePromemoria_(today, hour, oraDefault) {
  const ss = ss_(), sh = ss.getSheetByName(PROMEMORIA_TAB);
  if (!sh) return [];
  const rows = read_(ss, PROMO_RANGE), out = [];
  rows.slice(1).forEach((r, i) => {
    const d = pday_(gv_(r, 0)), txt = gv_(r, 2);
    if (d == null || !txt || tru_(gv_(r, 4)) || nrm_(gv_(r, 4)) === 'si') return;
    const hm = /^(\d{1,2})/.exec(gv_(r, 1)), h = hm ? +hm[1] : oraDefault;
    if (d < today || (d === today && hour >= h)) {
      if (d < today - 1) return;
      out.push({ cat: 'promemoria', title: 'Promemoria', body: txt, view: nrm_(gv_(r, 3)) || 'oggi', key: 'promemoria:' + (i + 2) + ':' + d });
      sh.getRange(i + 2, 5).setValue(true);
    }
  });
  return out;
}
