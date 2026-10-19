// Fetch and parse the Latin Liturgia Horarum texts from iBreviary's mobile site.
//
// The site keeps the chosen date and language in a PHP session: POST them to
// opzioni.php once, then GET breviario.php?s=<hour> with the cookie. Pages are
// cached as HTML under cache/ibreviary/la/<date>/ so every page is fetched once.
//
// Usage:  node scripts/texts/ibreviary.mjs 2026-06-28 [more dates...]
//         -> data/texts/days/<date>.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const BASE = 'https://www.ibreviary.com/m2/';
export const HOURS = {
  lectio: 'ufficio_delle_letture',
  laudes: 'lodi',
  media: 'ora_media',
  vesperae: 'vespri',
  completorium: 'compieta',
};
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class IBreviary {
  constructor({ cacheDir = 'cache/ibreviary/la', delayMs = 2500, log = console } = {}) {
    this.cacheDir = cacheDir; this.delayMs = delayMs; this.log = log;
    this.cookie = null; this.date = null; this.lastAt = 0;
  }

  async request(path, { method = 'GET', body = null } = {}) {
    const gap = this.lastAt + this.delayMs - Date.now();
    if (gap > 0) await sleep(gap);
    const headers = { 'user-agent': UA, accept: 'text/html,*/*;q=0.8', 'accept-language': 'la,en;q=0.8' };
    if (this.cookie) headers.cookie = this.cookie;
    if (body) headers['content-type'] = 'application/x-www-form-urlencoded';
    let res, lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        this.lastAt = Date.now();
        res = await fetch(BASE + path, { method, headers, body, redirect: 'follow', signal: AbortSignal.timeout(30000) });
        if (res.ok) break;
        lastErr = new Error(`HTTP ${res.status}`);
      } catch (e) { lastErr = e; }
      await sleep(3000 * (attempt + 1));
    }
    if (!res || !res.ok) throw lastErr ?? new Error('fetch failed');
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) { const m = /^PHPSESSID=[^;]+/.exec(c); if (m) this.cookie = m[0]; }
    return res.text();
  }

  /** Point the session at a date (ISO) in Latin. */
  async setDate(iso) {
    if (this.date === iso) return;
    const [y, m, d] = iso.split('-').map(Number);
    if (!this.cookie) await this.request('opzioni.php');
    await this.request('opzioni.php', { method: 'POST', body: `lang=la&giorno=${d}&mese=${m}&anno=${y}&ok=ok` });
    this.date = iso;
  }

  async page(iso, hour) {
    const dir = join(this.cacheDir, iso);
    const file = join(dir, `${hour}.html`);
    if (existsSync(file)) return readFileSync(file, 'utf8');
    await this.setDate(iso);
    const html = await this.request(`breviario.php?s=${HOURS[hour]}`);
    if (!/id="contenuto"/.test(html)) throw new Error(`${iso} ${hour}: unexpected page`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, html);
    this.log.log(`fetched ${iso} ${hour}`);
    return html;
  }
}

// ---------------------------------------------------------------- parsing

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', dagger: '†', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
export function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(parseInt(e[1] === 'x' ? e.slice(2) : e.slice(1), e[1] === 'x' ? 16 : 10));
    if (e in ENT) return ENT[e];
    // Latin-1 named entities (aacute, eacute, oacute, iacute, uacute, aelig, oelig, ...)
    const el = document_entities[e];
    return el ?? m;
  });
}
const document_entities = {
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', yacute: 'ý', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  aelig: 'æ', AElig: 'Æ', oelig: 'œ', OElig: 'Œ', agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù', acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü', ntilde: 'ñ', ccedil: 'ç', szlig: 'ß', middot: '·', sect: '§', para: '¶', deg: '°', ordm: 'º', ordf: 'ª', iquest: '¿', iexcl: '¡',
};

/**
 * Split the content div into lines. Each line is a list of runs
 * {text, rubric?, em?, section?}; <br> ends a line, <p> ends a line and marks a break.
 */
export function linesOf(html) {
  const start = html.indexOf('<div id="contenuto">');
  let body = start >= 0 ? html.slice(start) : html;
  const endMenu = body.indexOf('<div id="menu_bar"');
  if (endMenu > 0) body = body.slice(0, endMenu);
  body = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<a name="([^"]*)"><\/a>/gi, '\u0001anchor:$1\u0001');
  const lines = [];
  let cur = [];
  const state = { rubric: 0, em: 0, section: 0 };
  const flush = () => { lines.push(cur); cur = []; };
  const tokens = body.split(/(<[^>]+>)/);
  for (const tok of tokens) {
    if (!tok) continue;
    if (tok[0] === '<') {
      const t = tok.toLowerCase();
      if (/^<br\b/.test(t)) flush();
      else if (/^<\/?p\b/.test(t) || /^<\/?div\b/.test(t) || /^<\/?h\d\b/.test(t)) { if (cur.length) flush(); if (/^<p\b|^<\/p\b/.test(t)) lines.push([{ text: '', para: true }]); }
      else if (/^<span class="rubrica"/.test(t)) state.rubric++;
      else if (/^<span class="capolettera_piccolo"/.test(t) || /^<span class="sezione"/.test(t)) state.section++;
      else if (/^<\/span/.test(t)) { if (state.section) state.section--; else if (state.rubric) state.rubric--; }
      else if (/^<em\b|^<i\b/.test(t)) state.em++;
      else if (/^<\/em|^<\/i\b/.test(t)) state.em = Math.max(0, state.em - 1);
      continue;
    }
    for (const piece of tok.split('\u0001')) {
      if (!piece) continue;
      if (piece.startsWith('anchor:')) { cur.push({ anchor: piece.slice(7) }); continue; }
      const text = decode(piece).replace(/\s+/g, ' ');
      if (!text.trim() && !cur.length) continue;
      cur.push({ text, rubric: !!state.rubric || undefined, em: !!state.em || undefined, section: !!state.section || undefined });
    }
  }
  if (cur.length) flush();
  // merge adjacent runs with the same style, trim
  return lines.map((runs) => {
    const out = [];
    for (const r of runs) {
      if (r.anchor !== undefined) { out.push(r); continue; }
      const last = out[out.length - 1];
      if (last && last.anchor === undefined && !!last.rubric === !!r.rubric && !!last.em === !!r.em && !!last.section === !!r.section) last.text += r.text;
      else out.push({ ...r });
    }
    for (const r of out) if (r.text) r.text = r.text.replace(/\s+/g, ' ');
    return out.filter((r) => r.anchor !== undefined || r.text.trim());
  }).filter((l, i, arr) => l.length || (arr[i - 1] && arr[i - 1].length));
}

const plain = (line) => line.filter((r) => r.text).map((r) => r.text).join('').trim();
const isBlank = (line) => !line.some((r) => r.text && r.text.trim());
const sectionTitle = (line) => { const r = line.find((x) => x.section); return r ? r.text.trim() : null; };
const firstRubric = (line) => { const r = line.find((x) => x.text && x.text.trim()); return r && r.rubric ? r.text.trim() : null; };
const afterRubric = (line) => line.filter((r) => r.text && !r.rubric).map((r) => r.text).join('').trim();

/**
 * Turn the lines into sections of blocks. A block is one of
 *   {kind:'rubric', text}   {kind:'antiphon', n, text}   {kind:'versicle', v, r}
 *   {kind:'psalm', ref, title, sentence, strophes:[[line...]]}   {kind:'text', lines:[...]}
 *   {kind:'heading', text}
 * Psalm verse lines keep their † and * exactly as printed.
 */
let _ticks = 0;
function tick(where, i, lines) {
  if (++_ticks > 200000) throw new Error(`parser stuck in ${where} at line ${i}: ${JSON.stringify(lines[i]).slice(0, 300)}`);
}

export function parseHour(html) {
  _ticks = 0;
  let lines = linesOf(html);
  const end = lines.findIndex((l) => plain(l) === '******');
  if (end > 0) lines = lines.slice(0, end);
  const sections = [];
  let sec = null;
  let i = 0;
  const push = (b) => { if (!sec) { sec = { title: null, blocks: [] }; sections.push(sec); } sec.blocks.push(b); };
  let guardI = -1, guardN = 0;
  while (i < lines.length) {
    if (i === guardI) { if (++guardN > 3) throw new Error(`parser stuck at line ${i}: ${JSON.stringify(lines[i]).slice(0, 300)}`); } else { guardI = i; guardN = 0; }
    let line = lines[i];
    if (line.some((r) => r.anchor !== undefined)) {
      const a = line.find((r) => r.anchor !== undefined).anchor;
      if (/^ps\d+/.test(a)) { sec = { title: 'PSALMI INVITATORII', anchor: a, blocks: [] }; sections.push(sec); }
      line = lines[i] = line.filter((r) => r.anchor === undefined);
      if (!plain(line)) { i++; continue; }
    }
    const st = sectionTitle(line);
    if (st) { sec = { title: st, blocks: [] }; sections.push(sec); const rest = afterRubric(line.filter((r) => !r.section)); if (rest) push({ kind: 'text', lines: [rest] }); i++; continue; }
    if (isBlank(line)) { i++; continue; }
    const rub = firstRubric(line);
    if (rub !== null) {
      const rest = afterRubric(line);
      let m;
      if ((m = /^Ant\.?\s*(\d*)\.?$/.exec(rub)) && rest) { push({ kind: 'antiphon', n: m[1] ? Number(m[1]) : null, text: rest }); i++; continue; }
      if (/^℣\.?$/.test(rub) || /^℟\.?$/.test(rub) || /^\*$/.test(rub)) {
        // versicle / response pairs and responsory lines
        const last = sec?.blocks[sec.blocks.length - 1];
        const item = { kind: 'versicle', sign: rub.replace('.', ''), text: rest };
        if (last && last.kind === 'responsory') last.lines.push(item);
        else if (last && last.kind === 'versicle' && last.sign === '℣' && item.sign === '℟') { last.r = rest; }
        else if (item.sign === '℣') push({ kind: 'versicle', sign: '℣', text: rest, v: rest });
        else push(item);
        i++; continue;
      }
      if ((m = /^(Psalmus|Canticum|Ps\.?)\b(.*)$/i.exec(rub)) || /^[IVX]+$/.test(rub)) {
        // psalm heading: "Psalmus 23 (24) | title" possibly over two rubric lines, then an italic sentence
        const ref = /^[IVX]+$/.test(rub) ? null : rub;
        const psalm = { kind: 'psalm', ref: ref ? ref.replace(/\s+/g, ' ') : null, part: /^[IVX]+$/.test(rub) ? rub : null, title: null, sentence: null, strophes: [] };
        if (!ref && rest) psalm.title = rest;
        i++;
        // following rubric lines (title) and italic sentence
        while (i < lines.length && !isBlank(lines[i]) && (firstRubric(lines[i]) !== null) && !/^Ant/.test(firstRubric(lines[i]))) {
          tick('psalm-title', i, lines);
          const t = plain(lines[i]);
          if (/^[IVX]+$/.test(t)) psalm.part = t; else psalm.title = psalm.title ? psalm.title + ' ' + t : t;
          i++;
        }
        while (i < lines.length && isBlank(lines[i])) i++;
        if (i < lines.length && lines[i].some((r) => r.em)) { psalm.sentence = plain(lines[i]); i++; }
        // strophes until the next rubric (Ant., Gloria handled as text) or section
        let strophe = [];
        while (i < lines.length) {
          tick('strophes', i, lines);
          const l = lines[i];
          if (sectionTitle(l) || l.some((r) => r.anchor !== undefined)) break;
          if (firstRubric(l) !== null) break;
          if (isBlank(l)) { if (strophe.length) { psalm.strophes.push(strophe); strophe = []; } i++; continue; }
          strophe.push(plain(l));
          i++;
        }
        if (strophe.length) psalm.strophes.push(strophe);
        push(psalm);
        continue;
      }
      // plain rubric (possibly several lines joined by the site with <br> inside the span)
      const texts = line.filter((r) => r.rubric).map((r) => r.text.trim()).filter(Boolean);
      push({ kind: 'rubric', text: texts.join(' ') });
      if (rest) push({ kind: 'text', lines: [rest] });
      i++; continue;
    }
    // plain text lines: group until blank
    const group = [];
    while (i < lines.length && !isBlank(lines[i]) && firstRubric(lines[i]) === null && !sectionTitle(lines[i]) && !lines[i].some((r) => r.anchor !== undefined)) {
      tick('group', i, lines);
      const l = lines[i];
      group.push(l.some((r) => r.em) ? { em: true, text: plain(l) } : plain(l));
      i++;
    }
    if (group.length) push({ kind: 'text', lines: group });
  }
  return sections;
}

// ------------------------------------------------- Sunday solemnities and feasts
//
// iBreviary's Latin edition lets the Sunday per annum win over the fixed-date solemnities
// and feasts of the Lord that fall on it: 2025-06-29 (Peter and Paul), 2025-09-14 (Holy
// Cross), 2025-11-09 (Lateran) and 2026-11-01 (All Saints) all come back as the Sunday,
// with the Sunday's I Vespers on the Saturday. Such a Sunday takes its texts from a year in
// which the same date is a weekday (Compline stays the Sunday's, after II Vespers); the
// Saturday's Vespers become the celebration's I Vespers, from that year's eve when iBreviary
// gives them there, else built from its II Vespers (the same hymn, Magnificat and collect)
// with the I Vespers psalmody borrowed as I_VESPERS_PSALMODY says. The movable celebrations
// (Trinity, Christ the King, Holy Family …) iBreviary gets right and are left alone.

const calendars = {};
function celebration(iso) {
  const y = iso.slice(0, 4);
  if (!(y in calendars)) {
    try { calendars[y] = JSON.parse(readFileSync(new URL(`../../site/data/calendar/${y}.json`, import.meta.url), 'utf8')); } catch { calendars[y] = {}; }
  }
  return calendars[y][iso]?.[0] ?? null;
}
const weekday = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// iBreviary has no I Vespers of All Saints in any year: their psalms (Ps 112, Ps 147,
// Eph 1) are those of the I Vespers of the Assumption, which it does give.
const I_VESPERS_PSALMODY = { all_saints: { id: 'assumption_of_the_blessed_virgin_mary', md: '-08-15' } };

/** Dates (other years) where celebration `id` falls on `md` on a weekday; Tuesday–Friday first, so the eve is a weekday too. */
function weekdayDates(md, id, year) {
  const out = [];
  for (let k = 1; k <= 7; k++) {
    for (const y of [year + k, year - k]) {
      const d = `${y}${md}`;
      if (celebration(d)?.id === id && weekday(d) >= 1 && weekday(d) <= 5) out.push(d);
    }
  }
  return out.sort((a, b) => (weekday(a) === 1) - (weekday(b) === 1));
}

/** For a Sunday kept as a fixed-date solemnity or feast: { id, date } of the same celebration on a weekday. */
export function donorFor(iso) {
  const cel = celebration(iso);
  if (!cel || weekday(iso) !== 0 || /sunday/.test(cel.id) || !['SOLEMNITY', 'FEAST'].includes(cel.rank)) return null;
  if (cel.id === 'commemoration_of_all_the_faithful_departed') return null; // on a Sunday the office is the Sunday's
  const date = weekdayDates(iso.slice(4), cel.id, Number(iso.slice(0, 4)))[0];
  return date ? { id: cel.id, date } : null;
}

/** What a date's texts are made of, when not simply its own pages: compared by window.mjs to refetch stale days. */
export function properKey(iso) {
  const own = donorFor(iso);
  if (own) return `${own.id}@${own.date}`;
  const morrow = weekday(iso) === 6 && donorFor(addDays(iso, 1));
  return morrow ? `I Vesp. ${morrow.id}@${morrow.date}` : null;
}

const firstText = (secs, title) => JSON.stringify(secs.find((s) => s.title === title)?.blocks.find((b) => b.kind === 'text')?.lines[0] ?? null);

/** The I Vespers of the celebration kept on `date` (a weekday), from its eve when iBreviary gives them there:
 *  the eve's Vespers then share their hymn with the day's II Vespers, or the collect with its Lauds. */
async function firstVespersFromEve(ib, date) {
  const eve = parseHour(await ib.page(addDays(date, -1), 'vesperae'));
  const same = (a, b, title) => firstText(a, title) !== 'null' && firstText(a, title) === firstText(b, title);
  const ok = same(eve, parseHour(await ib.page(date, 'vesperae')), 'HYMNUS') || same(eve, parseHour(await ib.page(date, 'laudes')), 'ORATIO');
  return ok ? eve : null;
}

async function firstVespers(ib, donor, sources) {
  const eve = await firstVespersFromEve(ib, donor.date);
  if (eve) { sources.vesperae = `${addDays(donor.date, -1)} vesperae`; return eve; }
  const secs = parseHour(await ib.page(donor.date, 'vesperae'));
  sources.vesperae = `${donor.date} vesperae (II Vesp.)`;
  const borrow = I_VESPERS_PSALMODY[donor.id];
  if (borrow) {
    for (const d of weekdayDates(borrow.md, borrow.id, Number(donor.date.slice(0, 4)))) {
      const other = await firstVespersFromEve(ib, d);
      const ps = other?.find((s) => s.title === 'PSALMODIA');
      const at = secs.findIndex((s) => s.title === 'PSALMODIA');
      if (!ps || at < 0) continue;
      secs[at] = ps;
      sources.vesperae += `, psalmody ${addDays(d, -1)} vesperae`;
      break;
    }
  }
  return secs;
}

export async function buildDay(iso, { ib = new IBreviary(), outDir = 'data/texts/days' } = {}) {
  const day = { date: iso, hours: {} };
  const own = donorFor(iso);
  const morrow = !own && weekday(iso) === 6 ? donorFor(addDays(iso, 1)) : null;
  const sources = {};
  for (const hour of Object.keys(HOURS)) {
    if (own && hour !== 'completorium') {
      day.hours[hour] = parseHour(await ib.page(own.date, hour));
      sources[hour] = `${own.date} ${hour}`;
    } else if (morrow && hour === 'vesperae') {
      day.hours[hour] = await firstVespers(ib, morrow, sources);
    } else {
      day.hours[hour] = parseHour(await ib.page(iso, hour));
    }
  }
  if (own || morrow) day.proper = { key: properKey(iso), celebration: (own || morrow).id, sources };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${iso}.json`), JSON.stringify(day, null, 1));
  return day;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dates = process.argv.slice(2);
  const ib = new IBreviary();
  for (const d of dates) {
    const day = await buildDay(d, { ib });
    for (const [h, secs] of Object.entries(day.hours)) console.log(d, h, secs.map((s) => `${s.title ?? '?'}(${s.blocks.length})`).join(' '));
  }
}
