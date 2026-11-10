// Render GABC with Exsurge into a container, re-laying out on resize.
// Exsurge (MIT, Fr. Matthew Spencer) is loaded globally from vendor/exsurge.min.js.
import { play, stop, notesOf } from './player.js';
import { bookOf } from './sources.js';

const gabcCache = new Map();
// print (site/print.js): every system its own SVG, so a page can break between staves
let perLine = false;
export function setPerLine(v) { perLine = !!v; }

// scores sung in place of others by a setting ({ 8671: 1310 }: the Vatican Pange lingua)
let aliases = {};
export function setGabcAliases(map) { aliases = map || {}; }
/** The lyrics of an older edition spelt as the Liber Hymnarius spells them (æ, œ, i for j). */
const modernSpelling = (src) => src.replace(/^\*\s*(?=\d+\.)/gm, '').split(/(\([^)]*\)|^[\w-]+:.*$)/m).map((t, i) => (i % 2 ? t
  : t.replace(/ae/g, 'æ').replace(/Ae/g, 'Æ').replace(/oe/g, 'œ').replace(/j/g, 'i').replace(/J/g, 'I'))).join('');
export async function loadGabc(id0) {
  const id = aliases[id0] || id0;
  if (!gabcCache.has(id)) {
    gabcCache.set(id, fetch(`gabc/${id}.gabc`).then((r) => (r.ok ? r.text() : null)).then((t) => (t && id !== id0 ? modernSpelling(t) : t)).catch(() => null));
  }
  return gabcCache.get(id);
}

/** Split a GABC file into {header, body}; the body may be preceded by several header blocks. */
export function splitGabc(src) {
  const parts = src.split(/^%%\s*$/m);
  const body = parts[parts.length - 1].trim();
  const header = {};
  for (const p of parts.slice(0, -1)) {
    for (const line of p.split('\n')) {
      const m = /^([\w-]+)\s*:\s*(.*?);?\s*$/.exec(line);
      if (m) header[m[1]] = m[2];
    }
  }
  return { header, body };
}

function makeContext(fontSizePx) {
  const ctxt = new exsurge.ChantContext(exsurge.TextMeasuringStrategy.Canvas);
  ctxt.setGlyphScaling(1 / 16);
  ctxt.textColor = 'currentColor';
  ctxt.staffLineColor = ctxt.neumeLineColor = ctxt.dividerLineColor = 'currentColor';
  ctxt.negativeFillColor = 'var(--exsurge-negative-fill, #fff)';
  ctxt.setFont("'EB Garamond', 'Crimson Text', serif", fontSizePx);
  ctxt.textStyles.dropCap.size = fontSizePx * 3.1;
  ctxt.textStyles.annotation.size = fontSizePx * 0.72;
  ctxt.textStyles.annotation.color = 'var(--rubric, #a4221c)';
  ctxt.minLyricWordSpacing *= 0.75;
  ctxt.spaceBetweenSystems = 0;
  ctxt.setRubricColor('var(--rubric, #a4221c)');
  ctxt.specialCharProperties['font-weight'] = '400';
  // ℟ and ℣ ("R.", "V." in red italics): in the text's own font and measured as drawn. Exsurge
  // names its own symbol font, which is not shipped, and classes them "rubric", which the
  // page's style then set smaller and italic after the layout had measured them upright: the
  // syllable after them stood off its word ("℟. Dó mine").
  ctxt.specialCharProperties['font-family'] = "'EB Garamond', 'Crimson Text', serif";
  ctxt.specialCharProperties['font-style'] = 'italic';
  ctxt.specialCharProperties.class = 'versicle-sign';
  return ctxt;
}

/**
 * Draw GABC into `el`. `annotation` goes above the drop cap (e.g. "8g" or "Ant. 1").
 * Returns a function that re-lays the chant out for the current width.
 */
/**
 * `source` ({ label, href }) is where the notation comes from ("AM I 215", site/sources.js),
 * shown small at the top right of the score, beside its ▶.
 */
/**
 * A hyphen wherever the syllables of a word stand apart. Exsurge decides on hyphens before it
 * justifies a line: the space it then adds within a word was left bare ("Dó mine", "sǽ cula").
 * After the layout: between two syllables of a word on one line, a hyphen when the gap has
 * room for one (narrowed in a gap a little smaller); a smaller gap is closed, the next
 * syllable drawn up to the one before; none when they touch.
 */
function connectSyllables(score, ctxt) {
  const hyphen = ctxt.hyphenWidth;
  if (!hyphen) return;
  for (const line of score.lines || []) {
    const els = score.notations.slice(line.notationsStartIndex, line.notationsStartIndex + line.numNotationsOnLine).filter((n) => n.lyrics?.length);
    let drift = 0; // how far the syllables of the word have been drawn together
    for (let i = 0; i < els.length - 1; i++) {
      const a = els[i].lyrics[0], b = els[i + 1].lyrics[0];
      if (!a || !b || !a.allowsConnector?.() || a.preventConnector || !(a.widthWithoutConnector > 0)) { drift = 0; continue; }
      const gap = b.getLeft() - (a.getLeft() + a.widthWithoutConnector);
      if (gap >= hyphen * 0.95) { a.setNeedsConnector(true); a.setConnectorWidth(0); a.connectorSpan.textLength = undefined; }
      else if (gap >= hyphen * 0.5 || (gap > 0.3 && drift + gap > hyphen * 0.7)) a.setNeedsConnector(true, Math.max(gap, hyphen * 0.4));
      // a gap too small for a hyphen: the next syllable drawn up to this one (a hair off its note)
      else if (gap > 0.3 && !a.needsConnector) { b.bounds.x -= gap; drift += gap; }
    }
  }
}

export function renderChant(el, body, { annotation = null, dropCap = true, scale = 1, maxLines = 0, source = null } = {}) {
  // lyrics a little larger than the text, as in Breviarium Gregorianum (21 px against 18.7)
  const fontSize = (parseFloat(getComputedStyle(document.body).fontSize) || 18.67) * 1.12;
  const ctxt = makeContext(fontSize);
  // Exsurge wants a bare body; strip stray header lines and Gregorio-only macros.
  const cleaned = body
    .replace(/<v>\\greheightstar<\/v>/g, '*')
    .replace(/<alt>[\s\S]*?<\/alt>/g, '')
    .replace(/\(z0?\)|\(Z\)/g, '')
    // accented ligatures as single characters (Exsurge sets <sp>'ae</sp> as a span of its own)
    .replace(/<sp>'(?:ae|æ)<\/sp>/g, 'ǽ').replace(/<sp>'(?:oe|œ)<\/sp>/g, 'œ́').replace(/<sp>ae<\/sp>/g, 'æ').replace(/<sp>oe<\/sp>/g, 'œ')
    .replace(/<sp>'(?:AE|Æ)<\/sp>/g, 'Ǽ').replace(/<sp>AE<\/sp>/g, 'Æ').replace(/<sp>OE<\/sp>/g, 'Œ')
    // slips of the transcriptions that break a word in two: a line break between a syllable
    // and its notes ("adiutó\n(hi)rium"), a space within "Dó(…) mi(…)no"
    .replace(/([^\s()<>;])[ \t]*\n\s*\((?!:)/g, '$1(')
    .replace(/(D[óo]\([^)]*\)) (mi\([^)]*\)n[eio])/g, '$1$2')
    // Exsurge prints ℟ and ℣ with their own full stop: the books' "<sp>R/</sp>." would give two
    .replace(/(<sp>[RVA]\/<\/sp>)(<\/c>)?\./g, '$1$2')
    // the asterisk and the cross of the responsories, which Exsurge does not draw from <sp>
    .replace(/<sp>\*<\/sp>/g, '*').replace(/<sp>\+<\/sp>/g, '†')
    // the books set the rest of the first word in capitals beside the initial (NOctem): here
    // the initial is the drop cap, and the rest reads as ordinary text
    .replace(/^(\s*(?:\([^)]*\)\s*)?)(\p{Lu})(\p{Lu}+)/u, (m, pre, ini, rest) => (dropCap ? pre + ini + rest.toLowerCase() : m));
  let score;
  try {
    const mappings = exsurge.Gabc.createMappingsFromSource(ctxt, cleaned);
    score = new exsurge.ChantScore(ctxt, mappings, dropCap);
    if (annotation) score.annotation = new exsurge.Annotation(ctxt, annotation);
  } catch (e) {
    el.innerHTML = `<p class="missing">The score could not be read (${e.message}).</p>`;
    return () => {};
  }
  el.gabc = cleaned; // for the player: a psalm is sung at its antiphon's pitch
  // a miniature (the settings' mode cards): laid out `scale` times wider, then shrunk to fit,
  // `maxLines` keeping only its first systems
  if (scale === 1) addPlayButton(el, cleaned, source);
  let lastWidth = -1;
  const lines = perLine;
  // Exsurge cuts a score into one SVG per system assuming its default gap between systems
  // (1.5 staff intervals) and shifts each later system up by that much: with our gap of 0
  // every system after the first was drawn higher and higher, its top cut off.
  if (lines || maxLines) ctxt.spaceBetweenSystems = 1.5;
  // returns a promise that the score is drawn (print waits for every score)
  // the faces the lyrics need, loaded before they are measured: the font comes in pieces by
  // unicode range, and a score measured before the piece with ǽ or œ́ had arrived left gaps
  const lyricsText = cleaned.replace(/\([^)]*\)|<[^>]+>/g, '');
  const fontsReady = () => (document.fonts?.load
    ? Promise.all(['', 'italic ', 'bold '].map((st) => document.fonts.load(`${st}${Math.round(fontSize)}px 'EB Garamond'`, lyricsText))).catch(() => {})
    : Promise.resolve());
  const layout = () => fontsReady().then(() => new Promise((resolve) => {
    const width = Math.floor(el.clientWidth) || Math.floor(document.body.clientWidth - 32);
    if (!width || width === lastWidth) { resolve(); return; }
    lastWidth = width;
    const w = Math.round(width * scale);
    ctxt.width = w;
    score.performLayoutAsync(ctxt, () => {
      score.layoutChantLines(ctxt, w, () => {
        connectSyllables(score, ctxt);
        if (maxLines) { // a miniature showing only its first systems
          el.replaceChildren(...score.createSvgNodeForEachLine(ctxt).slice(0, maxLines).map((svg) => {
            svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.width = '100%'; svg.style.display = 'block'; return svg;
          }));
        } else if (lines) {
          el.replaceChildren(...score.createSvgNodeForEachLine(ctxt).map((svg) => { svg.removeAttribute('viewBox'); return svg; }));
        } else {
          const svg = score.createSvgNode(ctxt);
          if (scale === 1) svg.removeAttribute('viewBox');
          else { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.width = '100%'; }
          el.replaceChildren(svg);
        }
        resolve();
      });
    });
  }));
  if (!lines) layout();
  return layout;
}

/**
 * A ▶ over the score (as Breviarium Gregorianum has): sings it, ■ stops. The note being
 * sung turns red when the drawn notes match the read ones one for one.
 */
function addPlayButton(el, body, source = null) {
  if (!el.parentNode || el.previousElementSibling?.classList.contains('score-tools')) return;
  const playable = notesOf(body).some((n) => !n.rest);
  if (!playable && !source?.label) return;
  const tools = document.createElement('div');
  tools.className = 'score-tools';
  if (source?.label) {
    const src = document.createElement(source.href ? 'a' : 'span');
    src.className = 'score-src';
    src.textContent = source.label;
    const book = bookOf(source.label);
    if (book) src.title = book.title;
    if (source.href) { src.href = source.href; src.target = '_blank'; src.rel = 'noopener'; }
    tools.append(src);
  }
  el.before(tools);
  if (!playable) return;
  const btn = document.createElement('button');
  btn.className = 'play';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Play');
  btn.textContent = '▶';
  tools.append(btn);
  btn.onclick = () => {
    if (btn.classList.contains('playing')) { stop(); return; }
    const settings = JSON.parse(localStorage.getItem('settings') || '{}');
    const drawn = [...el.querySelectorAll('svg use.note, svg use[class~="note"]')];
    const count = notesOf(body).filter((n) => !n.rest).length;
    let lit = null;
    btn.classList.add('playing');
    btn.textContent = '■';
    play(body, {
      voice: settings.voice,
      key: keyOf(el),
      onNote: (i) => {
        if (lit) lit.style.fill = '';
        lit = drawn.length === count && i >= 0 ? drawn[i] : null;
        if (lit) lit.style.fill = 'var(--rubric)';
      },
      onEnd: () => { btn.classList.remove('playing'); btn.textContent = '▶'; },
    });
  };
}

/**
 * The score whose pitch a score is sung at: the first notated score of its key group
 * (an antiphon and its psalm or canticle, marked with data-key by app.js).
 */
function keyOf(el) {
  const k = el.closest('[data-key]')?.dataset.key;
  if (!k) return null;
  for (const g of document.querySelectorAll(`[data-key="${k}"]`)) {
    const sc = [...g.querySelectorAll('.score')].find((x) => x.gabc);
    if (sc) return sc.gabc;
  }
  return null;
}

/** Keep every rendered chant fitted to its container. */
export function watchResize(layouts) {
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => layouts.forEach((f) => f()), 120); });
}
