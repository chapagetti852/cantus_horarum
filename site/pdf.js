// The hour as a PDF file, made in the browser with jsPDF and svg2pdf.js (vendor/pdf/, MIT).
//
// Printing through the browser's dialog depends on the browser keeping the page size the
// page asks for; iOS Safari doesn't (it prints on the paper chosen in its dialog, with its
// own margins), so pages spilled over, booklets landed in a corner of the sheet. A PDF keeps
// its own page size, and prints, shares and saves the same everywhere.
//
// print.js composes the hour into a column and cuts it into pages; each page is laid out
// again here, without CSS zoom, and copied onto a PDF page: the scores as vector drawings
// (Exsurge's SVG through svg2pdf, prepared as bbloomf/jgabc's chant-pdf.js prepares it),
// the text word by word where the browser put it, in EB Garamond (fonts/pdf/, OFL).
import { FORMATS, paginate, zoomOf } from './print.js';

const PT = 72 / 25.4; // PDF points per mm
const FONT_FILES = [
  ['EBGaramond-Regular.ttf', 'EB Garamond', 'normal'],
  ['EBGaramond-Italic.ttf', 'EB Garamond', 'italic'],
  ['EBGaramond-Bold.ttf', 'EB Garamond', 'bold'],
  ['EBGaramond-BoldItalic.ttf', 'EB Garamond', 'bolditalic'],
  ['EBGaramond-SemiBold.ttf', 'EB Garamond SemiBold', 'normal'],
  ['EBGaramond-SemiBoldItalic.ttf', 'EB Garamond SemiBold', 'italic'],
];
// EB Garamond's ascender and descender (hhea = typo, units per em 1000): a word's box is
// their sum high, and its baseline their difference below its middle
const ASCENT = 1.007, DESCENT = 0.298;
const SMALL_CAPS = 0.7; // jsPDF has no small caps: smaller capitals

let libs = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(s);
  });
}
/** jsPDF, svg2pdf and the fonts (as base64), downloaded the first time a PDF is made. */
function loadLibs() {
  libs ??= (async () => {
    await loadScript('vendor/pdf/jspdf.umd.min.js');
    await loadScript('vendor/pdf/svg2pdf.umd.min.js');
    const fonts = await Promise.all(FONT_FILES.map(async ([file]) => {
      const r = await fetch(`fonts/pdf/${file}`);
      if (!r.ok) throw new Error(`Could not load ${file}`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }));
    return { jsPDF: window.jspdf.jsPDF, fonts };
  })();
  libs.catch(() => { libs = null; }); // try again next time
  return libs;
}

// ------------------------------------------------------------------ text

/** jsPDF font for a computed style. */
function fontOf(cs) {
  const w = parseInt(cs.fontWeight, 10) || 400;
  const italic = cs.fontStyle === 'italic' || cs.fontStyle.startsWith('oblique');
  if (w >= 650) return ['EB Garamond', italic ? 'bolditalic' : 'bold'];
  if (w >= 550) return ['EB Garamond SemiBold', italic ? 'italic' : 'normal'];
  return ['EB Garamond', italic ? 'italic' : 'normal'];
}
function rgbOf(color) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(color);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : [0, 0, 0, 1];
}
/** What jsPDF can draw: composed, without combining accents (it has no mark positioning). */
const pdfText = (s) => s.normalize('NFC').replace(/[̀-ͯ­​-‍﻿]/g, '');

/**
 * Every visible piece of text under `root` (not in SVG): [{ text, x, y (baseline), size,
 * font, color, charSpace, smallCaps }] in CSS px from the root's top left.
 */
function textRuns(root, origin) {
  const runs = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('svg, .score-tools, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue;
    if (!text.trim()) continue;
    const cs = getComputedStyle(node.parentElement);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const size = parseFloat(cs.fontSize);
    const style = {
      size,
      font: fontOf(cs),
      color: rgbOf(cs.color),
      charSpace: parseFloat(cs.letterSpacing) || 0,
      smallCaps: cs.fontVariantCaps === 'small-caps' || cs.fontVariant.includes('small-caps'),
      upper: cs.textTransform === 'uppercase',
    };
    const push = (s, rect) => {
      let t = style.upper ? s.toUpperCase() : s;
      t = pdfText(t);
      if (!t.trim() || !rect.width) return;
      runs.push({ ...style, text: t, x: rect.left - origin.left, y: rect.top - origin.top + rect.height / 2 + ((ASCENT - DESCENT) / 2) * size });
    };
    // each word where the browser put it (which keeps justified lines and spacing exact)
    for (const m of text.matchAll(/\S+/g)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      if (rects.length <= 1) { if (rects[0]) push(m[0], rects[0]); continue; }
      // a word broken over two lines (hyphenated): its letters grouped by line
      let start = 0, top = null, rect0 = null;
      for (let i = 0; i <= m[0].length; i++) {
        let r = null;
        if (i < m[0].length) {
          range.setStart(node, m.index + i);
          range.setEnd(node, m.index + i + 1);
          r = range.getClientRects()[0];
          if (!r || !r.width) continue;
        }
        if (i === m[0].length || (top !== null && Math.abs(r.top - top) > 2)) {
          if (rect0) push(m[0].slice(start, i) + (i < m[0].length && text[m.index + i - 1] === '­' ? '-' : ''), rect0);
          start = i; rect0 = r; top = r?.top ?? null;
        } else if (top === null) { top = r.top; rect0 = r; start = i; }
      }
    }
  }
  range.detach?.();
  return runs;
}

/** Visible top and bottom borders (rules under headings, above the colophon): [{x1, x2, y, w, color}] */
function rules(root, origin) {
  const out = [];
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('svg')) continue;
    const cs = getComputedStyle(el);
    for (const side of ['Top', 'Bottom']) {
      const w = parseFloat(cs[`border${side}Width`]);
      if (!w || cs[`border${side}Style`] === 'none' || cs[`border${side}Style`] === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const y = (side === 'Top' ? r.top + w / 2 : r.bottom - w / 2) - origin.top;
      out.push({ x1: r.left - origin.left, x2: r.right - origin.left, y, w, color: rgbOf(cs[`border${side}Color`]) });
    }
  }
  return out;
}

// ------------------------------------------------------------------ scores

/** var(--rubric, #a4221c) -> the variable's value on the page (light theme), else the fallback */
function resolveVars(value) {
  const root = getComputedStyle(document.documentElement);
  let prev;
  do {
    prev = value;
    value = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (m, name, fallback) => root.getPropertyValue(name).trim() || (fallback || '').trim() || '#000');
  } while (value !== prev && value.includes('var('));
  return value.replace(/currentColor/gi, 'rgb(17, 17, 17)');
}
// Exsurge squeezes a hyphen into a tight gap with textLength on a tspan, which svg2pdf
// ignores: such a tspan becomes a text of its own, scaled across to its length.
function fitTextLengths(svg) {
  for (const tspan of svg.querySelectorAll('tspan[textLength][lengthAdjust=spacingAndGlyphs]')) {
    const text = tspan.closest('text');
    if (!text || !tspan.textContent) continue;
    const start = tspan.getStartPositionOfChar(0);
    const natural = tspan.cloneNode(true);
    natural.removeAttribute('textLength');
    natural.removeAttribute('lengthAdjust');
    text.append(natural);
    const width = natural.getComputedTextLength();
    natural.remove();
    if (!width) continue;
    const fitted = text.cloneNode(false);
    for (const a of ['x', 'y', 'dx', 'dy', 'textLength', 'lengthAdjust', 'text-anchor']) fitted.removeAttribute(a);
    fitted.setAttribute('style', `${text.getAttribute('style') || ''};${tspan.getAttribute('style') || ''}`);
    fitted.setAttribute('transform', `${text.getAttribute('transform') || ''} translate(${start.x} ${start.y}) scale(${parseFloat(tspan.getAttribute('textLength')) / width} 1)`);
    fitted.textContent = tspan.textContent;
    text.after(fitted);
    tspan.remove();
  }
}
// svg2pdf places each tspan after the one before by measuring it in the PDF's font; the
// browser's x for each piece is exact, so each piece starts where the browser started it.
function placeText(svg) {
  for (const text of svg.querySelectorAll('text')) {
    if (text.getNumberOfChars()) { text.setAttribute('x', text.getStartPositionOfChar(0).x); text.removeAttribute('dx'); }
    text.setAttribute('text-anchor', 'start');
    for (const tspan of text.querySelectorAll('tspan')) {
      tspan.removeAttribute('text-anchor');
      if (tspan.childElementCount || !tspan.getNumberOfChars()) continue;
      tspan.setAttribute('x', tspan.getStartPositionOfChar(0).x);
      tspan.removeAttribute('dx');
    }
  }
}
// The <style> rules copied onto the elements they match (svg2pdf's CSS support is partial).
function inlineStyleSheets(svg) {
  const els = [svg, ...svg.querySelectorAll('*')];
  const from = els.map(() => ({}));
  for (const style of svg.querySelectorAll('style')) {
    for (const rule of style.sheet ? style.sheet.cssRules : []) {
      if (!rule.selectorText) continue;
      els.forEach((el, i) => {
        if (!el.matches(rule.selectorText)) return;
        for (let j = 0; j < rule.style.length; j++) from[i][rule.style[j]] = rule.style.getPropertyValue(rule.style[j]);
      });
    }
    style.remove();
  }
  els.forEach((el, i) => {
    for (const [k, v] of Object.entries(from[i])) if (!el.style.getPropertyValue(k)) el.style.setProperty(k, v);
  });
}
/**
 * A score's SVG made drawable by svg2pdf: colours resolved, text placed where the browser
 * put it, small caps as smaller capitals, every font EB Garamond. Works on a clone in the
 * document (the browser has to measure it); returns the clone.
 */
function prepareSvg(svg) {
  const w = parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width;
  const h = parseFloat(svg.getAttribute('height')) || svg.getBoundingClientRect().height;
  const clone = svg.cloneNode(true);
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;color:#111';
  host.append(clone);
  document.body.append(host);
  try {
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    for (const style of clone.querySelectorAll('style')) style.textContent = resolveVars(style.textContent);
    for (const el of clone.querySelectorAll('[fill], [stroke], [style], [color]')) {
      for (const a of ['fill', 'stroke', 'style', 'color']) {
        const v = el.getAttribute(a);
        if (v && (v.includes('var(') || /currentColor/i.test(v))) el.setAttribute(a, resolveVars(v));
      }
    }
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentNode.nodeName !== 'style') n.nodeValue = pdfText(n.nodeValue);
    }
    fitTextLengths(clone);
    for (const el of clone.querySelectorAll('text, tspan')) {
      const cs = getComputedStyle(el);
      if (/%|em/.test(el.style.fontSize) || /%|em/.test(el.getAttribute('font-size') || '')) el.style.fontSize = cs.fontSize;
      if (el.tagName === 'tspan' && el.childElementCount === 0 && (cs.fontVariantCaps === 'small-caps' || cs.fontVariant.includes('small-caps'))) {
        const size = parseFloat(cs.fontSize);
        let first = true;
        el.textContent.split(/(\p{Ll}+)/u).forEach((run, i) => {
          if (!run) return;
          const piece = el.cloneNode(false);
          if (!first) for (const a of ['x', 'y', 'dx', 'dy']) piece.removeAttribute(a);
          first = false;
          piece.textContent = i % 2 ? run.toUpperCase() : run;
          piece.style.fontVariant = 'normal';
          piece.style.fontSize = `${i % 2 ? size * SMALL_CAPS : size}px`;
          el.before(piece);
        });
        el.remove();
      }
    }
    placeText(clone);
    inlineStyleSheets(clone);
    // one font family, as registered with jsPDF; weight 600 has its own face
    for (const el of clone.querySelectorAll('text, tspan')) {
      const cs = getComputedStyle(el);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      el.style.fontFamily = weight >= 550 && weight < 650 ? 'EB Garamond SemiBold' : 'EB Garamond';
      if (weight >= 550 && weight < 650) el.style.fontWeight = 'normal';
      if (el.getAttribute('font-family')) el.removeAttribute('font-family');
    }
  } finally {
    host.remove();
  }
  return { svg: clone, width: w, height: h };
}

// ------------------------------------------------------------------ pages

/**
 * The page's nodes laid out at the column's width, without zoom; returns what to draw on
 * the PDF page, in CSS px from the top left of the text block.
 */
function measurePage(nodes, colWidth, stage) {
  const flow = document.createElement('div');
  flow.className = 'office print-flow';
  flow.lang = 'la';
  flow.style.width = colWidth;
  flow.append(...nodes);
  // list numbers are ::marker, which can't be measured: real text in their place
  for (const ol of flow.querySelectorAll('ol')) {
    let n = Number(ol.getAttribute('start')) || 1;
    for (const li of ol.children) {
      if (li.tagName !== 'LI') continue;
      const value = li.getAttribute('value') ? Number(li.getAttribute('value')) : n;
      n = value + 1;
      if (getComputedStyle(li).listStyleType === 'none') continue;
      li.style.listStyleType = 'none';
      li.style.position = 'relative';
      const mark = document.createElement('span');
      mark.textContent = `${value}.`;
      mark.style.cssText = 'position:absolute;right:100%;margin-right:0.35em;top:0;white-space:nowrap;font-style:normal;font-weight:400;color:inherit';
      li.prepend(mark);
    }
  }
  stage.replaceChildren(flow);
  const origin = flow.getBoundingClientRect();
  const scores = [...flow.querySelectorAll('svg')].filter((s) => !s.parentElement.closest('svg')).map((svg) => {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const p = prepareSvg(svg);
    return { ...p, x: r.left - origin.left, y: r.top - origin.top, drawnWidth: r.width, drawnHeight: r.height };
  }).filter(Boolean);
  return { texts: textRuns(flow, origin), rules: rules(flow, origin), scores };
}

function drawText(doc, run, k, ox, oy) {
  const [r, g, b] = run.color;
  doc.setTextColor(r, g, b);
  doc.setFont(run.font[0], run.font[1]);
  const pieces = run.smallCaps ? run.text.split(/(\p{Ll}+)/u) : [run.text];
  let x = ox + run.x * k;
  pieces.forEach((piece, i) => {
    if (!piece) return;
    const size = (i % 2 ? run.size * SMALL_CAPS : run.size) * k;
    const t = i % 2 ? piece.toUpperCase() : piece;
    doc.setFontSize(size);
    doc.text(t, x, oy + run.y * k, { charSpace: run.charSpace * k, baseline: 'alphabetic' });
    x += doc.getTextWidth(t) + run.charSpace * k * t.length;
  });
}

/**
 * Make the PDF of the composed column `col` (see printColumn) in format `fmt`.
 * Resolves to { blob, pages }.
 */
export async function makePdfFile(col, fmt, { title = '', scale = 1, onProgress = () => {} } = {}) {
  const f = FORMATS[fmt];
  const { jsPDF, fonts } = await loadLibs();
  const colWidth = col.style.width;
  const pages = paginate(col, fmt, scale);
  const stage = col.parentNode;
  col.remove();

  const sheet = f.sheet || f.page;
  const doc = new jsPDF({ unit: 'pt', format: [sheet[0] * PT, sheet[1] * PT], orientation: sheet[0] > sheet[1] ? 'landscape' : 'portrait', compress: true });
  FONT_FILES.forEach(([file, family, style], i) => { doc.addFileToVFS(file, fonts[i]); doc.addFont(file, family, style); });
  doc.setProperties({ title, creator: 'Cantus Horarum' });

  // CSS px of the column -> PDF points: the print layout's zoom (and size), then 96 px to 72 pt
  const k = zoomOf(fmt, scale) * 72 / 96;
  // the order of pages on the sheets: plain pages one by one; a booklet two to a sheet, in
  // saddle-stitch order (print both sides, flip on the short edge, fold)
  let slots;
  if (f.sheet) {
    const n = Math.ceil(pages.length / 4) * 4;
    slots = [];
    for (let s = 0; s < n / 4; s++) slots.push([n - 1 - 2 * s, 2 * s], [2 * s + 1, n - 2 - 2 * s]);
  } else slots = pages.map((_, i) => [i]);

  for (let s = 0; s < slots.length; s++) {
    if (s > 0) doc.addPage([sheet[0] * PT, sheet[1] * PT], sheet[0] > sheet[1] ? 'landscape' : 'portrait');
    for (let half = 0; half < slots[s].length; half++) {
      const i = slots[s][half];
      if (!pages[i]) continue;
      onProgress(i + 1, pages.length);
      await new Promise((r) => setTimeout(r)); // let the page breathe
      const ox = (half * f.page[0] + f.margin[0]) * PT;
      const oy = f.margin[1] * PT;
      const m = measurePage(pages[i], colWidth, stage);
      for (const rule of m.rules) {
        doc.setDrawColor(...rule.color.slice(0, 3));
        doc.setLineWidth(rule.w * k);
        doc.line(ox + rule.x1 * k, oy + rule.y * k, ox + rule.x2 * k, oy + rule.y * k);
      }
      for (const sc of m.scores) {
        doc.setFont('times', 'normal'); // svg2pdf sets the font only when it differs from its default
        await doc.svg(sc.svg, { x: ox + sc.x * k, y: oy + sc.y * k, width: sc.drawnWidth * k, height: sc.drawnHeight * k });
      }
      for (const run of m.texts) drawText(doc, run, k, ox, oy);
      // the page number at the foot
      doc.setFont('EB Garamond', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(85, 85, 85);
      doc.text(String(i + 1), (half * f.page[0] + f.page[0] / 2) * PT, (f.page[1] - 6) * PT, { align: 'center' });
    }
  }
  stage.remove();
  return { blob: doc.output('blob'), pages: pages.length };
}
