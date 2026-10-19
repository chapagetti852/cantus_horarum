// Render GABC with Exsurge into a container, re-laying out on resize.
// Exsurge (MIT, Fr. Matthew Spencer) is loaded globally from vendor/exsurge.min.js.

const gabcCache = new Map();

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
export function renderChant(el, body, { annotation = null, dropCap = true } = {}) {
  // lyrics a little larger than the text, as in Breviarium Gregorianum (21 px against 18.7)
  const fontSize = (parseFloat(getComputedStyle(document.body).fontSize) || 18.67) * 1.12;
  const ctxt = makeContext(fontSize);
  // Exsurge wants a bare body; strip stray header lines and Gregorio-only macros.
  const cleaned = body
    .replace(/<v>\\greheightstar<\/v>/g, '*')
    .replace(/<alt>[\s\S]*?<\/alt>/g, '')
    .replace(/\(z0?\)|\(Z\)/g, '');
  let score;
  try {
    const mappings = exsurge.Gabc.createMappingsFromSource(ctxt, cleaned);
    score = new exsurge.ChantScore(ctxt, mappings, dropCap);
    if (annotation) score.annotation = new exsurge.Annotation(ctxt, annotation);
  } catch (e) {
    el.innerHTML = `<p class="missing">Notatio legi non potuit (${e.message}).</p>`;
    return () => {};
  }
  let lastWidth = -1;
  const layout = () => {
    const width = Math.floor(el.clientWidth) || Math.floor(document.body.clientWidth - 32);
    if (!width || width === lastWidth) return;
    lastWidth = width;
    ctxt.width = width;
    score.performLayoutAsync(ctxt, () => {
      score.layoutChantLines(ctxt, width, () => {
        const svg = score.createSvgNode(ctxt);
        svg.removeAttribute('viewBox');
        el.replaceChildren(svg);
      });
    });
  };
  layout();
  return layout;
}

/** Keep every rendered chant fitted to its container. */
export function watchResize(layouts) {
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => layouts.forEach((f) => f()), 120); });
}
