// Render GABC with Exsurge into a container, re-laying out on resize.
// Exsurge (MIT, Fr. Matthew Spencer) is loaded globally from vendor/exsurge.min.js.
import { play, stop, notesOf } from './player.js';

const gabcCache = new Map();
// print (site/print.js): every system its own SVG, so a page can break between staves
let perLine = false;
export function setPerLine(v) { perLine = !!v; }

export async function loadGabc(id) {
  if (!gabcCache.has(id)) {
    gabcCache.set(id, fetch(`gabc/${id}.gabc`).then((r) => (r.ok ? r.text() : null)).catch(() => null));
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
  return ctxt;
}

/**
 * Draw GABC into `el`. `annotation` goes above the drop cap (e.g. "8g" or "Ant. 1").
 * Returns a function that re-lays the chant out for the current width.
 */
export function renderChant(el, body, { annotation = null, dropCap = true, scale = 1 } = {}) {
  // lyrics a little larger than the text, as in Breviarium Gregorianum (21 px against 18.7)
  const fontSize = (parseFloat(getComputedStyle(document.body).fontSize) || 18.67) * 1.12;
  const ctxt = makeContext(fontSize);
  // Exsurge wants a bare body; strip stray header lines and Gregorio-only macros.
  const cleaned = body
    .replace(/<v>\\greheightstar<\/v>/g, '*')
    .replace(/<alt>[\s\S]*?<\/alt>/g, '')
    .replace(/\(z0?\)|\(Z\)/g, '')
    // the books set the rest of the first word in capitals beside the initial (NOctem): here
    // the initial is the drop cap, and the rest reads as ordinary text
    .replace(/^(\s*(?:\([^)]*\)\s*)?)(\p{Lu})(\p{Lu}+)/u, (m, pre, ini, rest) => (dropCap ? pre + ini + rest.toLowerCase() : m));
  let score;
  try {
    const mappings = exsurge.Gabc.createMappingsFromSource(ctxt, cleaned);
    score = new exsurge.ChantScore(ctxt, mappings, dropCap);
    if (annotation) score.annotation = new exsurge.Annotation(ctxt, annotation);
  } catch (e) {
    el.innerHTML = `<p class="missing">Notatio legi non potuit (${e.message}).</p>`;
    return () => {};
  }
  el.gabc = cleaned; // for the player: a psalm is sung at its antiphon's pitch
  // a miniature (the settings' mode cards): laid out `scale` times wider, then shrunk to fit
  if (scale === 1) addPlayButton(el, cleaned);
  let lastWidth = -1;
  const lines = perLine;
  // returns a promise that the score is drawn (print waits for every score)
  const layout = () => new Promise((resolve) => {
    const width = Math.floor(el.clientWidth) || Math.floor(document.body.clientWidth - 32);
    if (!width || width === lastWidth) { resolve(); return; }
    lastWidth = width;
    const w = Math.round(width * scale);
    ctxt.width = w;
    score.performLayoutAsync(ctxt, () => {
      score.layoutChantLines(ctxt, w, () => {
        if (lines) {
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
  });
  if (!lines) layout();
  return layout;
}

/**
 * A ▶ over the score (as Breviarium Gregorianum has): sings it, ■ stops. The note being
 * sung turns red when the drawn notes match the read ones one for one.
 */
function addPlayButton(el, body) {
  if (!el.parentNode || el.previousElementSibling?.classList.contains('score-tools')) return;
  if (!notesOf(body).some((n) => !n.rest)) return;
  const tools = document.createElement('div');
  tools.className = 'score-tools';
  const btn = document.createElement('button');
  btn.className = 'play';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Cane');
  btn.textContent = '▶';
  tools.append(btn);
  el.before(tools);
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
