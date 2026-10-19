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
  const theirRef = key === 'lectio' ? t.lectiones?.[0]?.ref : own.reading?.ref;
  const a = chapterVerse(latinRef), b = chapterVerse(theirRef);
  return { lang: day.lang, t, own, same: !!(a && b && a === b) };
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
