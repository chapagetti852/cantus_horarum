// Translations under the Latin (setting "Translatio"): English from iBreviary, Chinese from
// the Hong Kong Diocesan Liturgy Commission's daily office (scripts/texts/translations.mjs,
// served as data/tr/<lang>/<date>.json).
//
// The translated day is not always the same office as the Latin one: iBreviary's English
// follows the calendar of the United States, Hong Kong has its own. So each piece is laid
// under its Latin only when it is the same text: the psalms by their number (canticles by
// their place), everything proper to the day (hymn, reading, responsory, antiphon of the
// Gospel canticle, intercessions, collect) only when the short reading, or the first
// reading of the Office of Readings, has the same chapter and verse as the Latin.

const cache = new Map();
export async function loadTranslation(lang, date) {
  const key = `${lang}/${date}`;
  if (!cache.has(key)) cache.set(key, fetch(`data/tr/${key}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(key);
}

export const LANG_NAMES = { en: 'English', zh: '中文' };

/** "2 Th 3, 10b-13", "2 Thessalonians 3:10b-13", "得後3:10-13" -> "3:10". */
export function chapterVerse(ref) {
  const m = /(\d+)\s*[,:]\s*(\d+)/.exec(String(ref || ''));
  return m ? `${Number(m[1])}:${Number(m[2])}` : null;
}

/** "Tob 4, 14-15a. 16ab. 19" -> { ch: 4, from: 14, to: 19 } (the verses after the chapter). */
export function verseRange(ref) {
  const r = String(ref || '');
  const m = /(\d+)\s*[,:]\s*(\d+)/.exec(r);
  if (!m) return null;
  const vs = [Number(m[2]), ...[...r.slice(m.index + m[0].length).matchAll(/\d+/g)].map((x) => Number(x[0]))];
  return { ch: Number(m[1]), from: Math.min(...vs), to: Math.max(...vs) };
}
/**
 * The same reading: the same chapter and overlapping verses (each translation cuts the
 * verses its own way: Tob 4, 14-19 in Latin is 4:15-19 in English and 4:16-20 in Chinese).
 */
export function sameReading(a, b) {
  const x = verseRange(a), y = verseRange(b);
  return !!(x && y && x.ch === y.ch && x.from <= y.to && y.from <= x.to);
}

/**
 * A psalm's number in the Hebrew numbering, or "c" for a canticle: "Psalmus 112 (113)" -> 113,
 * "Psalmus 5, 2-10" -> 5, "Psalm 19B" -> 19, "聖詠 19(18):8-15" -> 19, "聖詠95(94)" -> 95.
 */
export function psalmNumber(ref, lang) {
  const r = String(ref || '');
  if (/Canticum|Canticle|聖歌|讚美曲|頌歌/.test(r)) return 'c';
  if (lang === 'la') {
    const m = /Psalmus\s+(\d+)(?:\s*\((\d+))?/.exec(r);
    return m ? Number(m[2] || m[1]) : null;
  }
  const m = /(?:Psalm|聖詠)\s*(\d+)/.exec(r);
  return m ? Number(m[1]) : null;
}

/** The translation of one hour, and whether its propers are those of the Latin office. */
export function hourTranslation(day, hour, latinRef) {
  if (!day) return null;
  const key = ['tertia', 'sexta', 'nona'].includes(hour) ? 'media' : hour;
  const t = day.hours?.[key];
  if (!t) return null;
  const own = key === 'media' ? t[hour] || {} : t;
  // the Office of Readings: either reading the same (Esther's additions are numbered three ways)
  const theirs = key === 'lectio' ? (t.lectiones || []).map((l) => [l.ref, l.title].filter(Boolean).join(' ')) : [own.reading?.ref];
  const ours = Array.isArray(latinRef) ? latinRef : [latinRef];
  return { lang: day.lang, t, own, same: ours.some((a) => theirs.some((b) => sameReading(a, b))) };
}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/**
 * A translation block: short pieces open, long ones (a psalm, a hymn, a reading of the
 * Office of Readings) folded under their summary.
 */
export function trNode(lang, lines, { head = null, fold = false } = {}) {
  if (!lines || !lines.length) return null;
  const html = linesHtml(lines);
  const div = document.createElement(fold ? 'details' : 'div');
  div.className = 'tr';
  div.lang = lang === 'zh' ? 'zh-Hant-HK' : lang;
  div.innerHTML = fold
    ? `<summary>${esc(LANG_NAMES[lang] || lang)}${head ? ` · ${esc(head)}` : ''}</summary>${html}`
    : `${head ? `<p class="tr-head">${esc(head)}</p>` : ''}${html}`;
  return div;
}
/** Lines to paragraphs: an empty line parts strophes; "— " and 領/答/眾 mark responses. */
function linesHtml(lines) {
  const paras = [[]];
  for (const l of lines) { if (l === '') paras.push([]); else paras[paras.length - 1].push(l); }
  return paras.filter((p) => p.length).map((p) => `<p>${p.map((l) => esc(l)
    .replace(/^— /, '<span class="r">—</span> ')
    .replace(/^(領|答|眾)[：:]/, '<span class="r">$1：</span>')
    .replace(/([※*†])\s*$/, '<span class="r">$1</span>')).join('<br>')}</p>`).join('');
}

// ------------------------------------------------------------------ verse by verse
// Breviarium Gregorianum lays each verse's translation under it. A translated psalm is read
// into verses by its own marks (* or ※ for the mediant, † ＋ + for the flex, an empty line
// between strophes); where it has as many verses as the Latin, each goes under its verse
// (the Hong Kong office keeps the Latin division), else where it has as many strophes, each
// strophe under the Latin's (the English Grail psalter divides otherwise), else it stands
// whole after the psalm.

const MEDIANT = /[*※]\s*$/;
const FLEX = /[†＋+]\s*$/;
const END = /[。！？；：」』.!?;:]\s*$/;

/** Translated lines -> strophes of verses, each verse its lines. */
export function trVerses(lines, lang) {
  const strophes = [[]];
  let cur = [], med = false;
  const close = () => { if (cur.length) strophes[strophes.length - 1].push(cur); cur = []; med = false; };
  for (const l of lines || []) {
    if (l === '') { close(); strophes.push([]); continue; }
    if (med && (MEDIANT.test(l) || FLEX.test(l))) close(); // a new verse begins with its own mark
    cur.push(l);
    if (MEDIANT.test(l)) { med = true; continue; }
    // the second half: one line in English; in Chinese up to the line that ends a sentence
    if (med && (lang !== 'zh' || END.test(l))) close();
  }
  close();
  // the doxology is one verse in the Hong Kong office ("願光榮歸於父…※ 起初如何…"), two in the Latin
  for (const st of strophes) {
    for (let i = 0; i < st.length; i++) {
      const v = st[i], m = v.findIndex((l) => MEDIANT.test(l));
      if (/^願光榮歸於父/.test(v[0]) && m >= 0 && m < v.length - 1) st.splice(i, 1, v.slice(0, m + 1).map((l) => l.replace(/\s*[*※]\s*$/, '')), v.slice(m + 1));
    }
  }
  return strophes.filter((s) => s.length);
}

/**
 * Pair translated verses with Latin ones, in order, by their place in the psalm (Gale and
 * Church's alignment of parallel texts): each step takes 1 or 2 Latin verses and 1 or 2
 * translated ones, at the cost of how far their shares of the whole psalm's length differ.
 * Returns, for each Latin verse, the translated verses that go under it (the second of two
 * Latin verses sung to one translated verse carries it), with the mean cost per step.
 */
export function pairVerses(latin, tr, size = (v) => v.length) {
  const L = latin.map(size), T = tr.map(size);
  const sl = L.reduce((a, b) => a + b, 0) || 1, st = T.reduce((a, b) => a + b, 0) || 1;
  const n = L.length, m = T.length;
  const cost = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
  const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  cost[0][0] = 0;
  const steps = [[1, 1, 0], [2, 1, 0.04], [1, 2, 0.04], [3, 1, 0.1], [1, 3, 0.1]];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (cost[i][j] === Infinity) continue;
      for (const [a, b, pen] of steps) {
        if (i + a > n || j + b > m) continue;
        let x = 0, y = 0;
        for (let k = 0; k < a; k++) x += L[i + k];
        for (let k = 0; k < b; k++) y += T[j + k];
        const c = cost[i][j] + Math.abs(x / sl - y / st) + pen;
        if (c < cost[i + a][j + b]) { cost[i + a][j + b] = c; back[i + a][j + b] = [a, b]; }
      }
    }
  }
  if (cost[n][m] === Infinity) return null;
  const out = latin.map(() => []);
  let i = n, j = m, k = 0;
  while (i > 0 || j > 0) {
    const [a, b] = back[i][j];
    out[i - 1].push(...tr.slice(j - b, j));
    i -= a; j -= b; k++;
  }
  return { under: out, cost: cost[n][m] / Math.max(k, 1) };
}

/**
 * How a translation sits under a Latin psalm whose verses are grouped in `latinStrophes`
 * ([[verse…]…]): { mode: 'verse', under: [[translated verse lines…] per Latin verse] } when
 * the verses can be paired, else { mode: 'block', lines } to stand whole after the psalm.
 */
export function alignPsalm(latinStrophes, lines, lang) {
  const latin = latinStrophes.flat();
  const tr = trVerses(lines, lang).flat();
  if (!latin.length || !tr.length) return { mode: 'block', lines };
  if (latin.length === tr.length) return { mode: 'verse', under: tr.map((v) => [v]) };
  const p = pairVerses(latin, tr, (v) => (Array.isArray(v) ? v.join('') : v).replace(/[\s*†※＋]/g, '').length);
  if (p && p.cost < 0.06) return { mode: 'verse', under: p.under };
  return { mode: 'block', lines };
}

/** One verse's lines as HTML: halves joined, marks in red. */
export function verseTrHtml(lines) {
  return lines.map((l) => esc(l).replace(/\s*([*※†＋])\s*$/, ' <span class="r">$1</span>').replace(/^— /, '<span class="r">—</span> '))
    .join(' ').replace(/\s+/g, ' ').trim();
}

/** A translation paragraph (Breviarium Gregorianum's "tr"): italic, under its Latin. */
export function trP(lang, html, cls = '') {
  const p = document.createElement('p');
  p.className = `tr${cls ? ' ' + cls : ''}`;
  p.lang = lang === 'zh' ? 'zh-Hant-HK' : lang;
  p.innerHTML = html;
  return p;
}

/**
 * Intercessions read into their introduction and their intentions [first half, second half]
 * (the second half after "—"; the Hong Kong office's 領/眾 marks and repeated responses left out).
 */
export function precesParts(lines) {
  const intro = [], pairs = [];
  for (let i = 0; i < (lines || []).length; i++) {
    const l = lines[i].replace(/^領[：:]\s*/, '');
    const next = lines[i + 1];
    if (next && /^—/.test(next)) { pairs.push([l, next.replace(/^—+\s*/, '')]); i++; continue; }
    if (!pairs.length) intro.push(lines[i]);
  }
  return { intro, pairs };
}

// ------------------------------------------------------------------ hymns
// A translated hymn is shown as the Latin one's only when data/hymns/match.json says it is
// its translation (the English office often keeps a hymn of its own calendar, the Chinese
// paraphrases freely); English the app supplies itself (data/hymns/en.json) stands in where
// the English office has none.

const plainWords = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/[’'`]/g, '').replace(/[^a-z\s-]/g, ' ').replace(/-/g, '').trim().split(/\s+/).filter(Boolean);
/** "Christe, qui, splendor et dies," -> "christe qui splendor": a Latin hymn's key. */
export const hymnKey = (incipit) => plainWords(incipit).slice(0, 3).join(' ');
const cjk = (s) => String(s || '').replace(/[^\p{Script=Han}]/gu, '');

/** Is `firstLine` (of the translated hymn in `lang`) the translation of the Latin hymn `key`? */
export function hymnCorresponds(table, key, lang, firstLine) {
  const known = table?.[key]?.[lang];
  if (!known?.length || !firstLine) return false;
  if (lang === 'zh') {
    const b = cjk(firstLine);
    return known.some((k) => { const a = cjk(k); const n = Math.min(6, a.length, b.length); return n > 1 && a.slice(0, n) === b.slice(0, n); });
  }
  const b = plainWords(firstLine).join(' ');
  return known.some((k) => b.startsWith(plainWords(k).join(' ')));
}
