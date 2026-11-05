// Pages of an hour for its PDF (site/pdf.js draws them): plain pages (A4, A5, Letter) or a
// booklet (A5 pages two to a landscape A4 sheet, half-Letter pages two to a Letter sheet, in
// saddle-stitch order: print both sides, flip on the short edge, fold).
//
// The hour is composed again into a column as wide as the page's text (scores laid out to
// that width, one SVG per system so a page can break between staves), cut into atoms
// (systems, paragraphs, verses, headings kept with what follows) and poured into pages.

export const FORMATS = {
  a4: { label: 'A4', page: [210, 297], margin: [17, 16], zoom: 0.8 },
  a5: { label: 'A5', page: [148, 210], margin: [12, 12], zoom: 0.68 },
  letter: { label: 'Letter', page: [215.9, 279.4], margin: [18, 16], zoom: 0.8 },
  'booklet-a4': { label: 'Booklet A4 (A5)', page: [148.5, 210], sheet: [297, 210], margin: [12, 11], zoom: 0.68 },
  'booklet-letter': { label: 'Booklet Letter', page: [139.7, 215.9], sheet: [279.4, 215.9], margin: [11, 11], zoom: 0.66 },
};
const PX = 96 / 25.4; // CSS px per mm
const FOLIO = 22; // px kept at the foot of each page for its number

/**
 * How much smaller than on screen the column is drawn on paper: the format's own zoom, times
 * the print size chosen in the settings (1 = 100 %). A larger size makes the column narrower
 * in CSS pixels, so text and scores are laid out at that width and come out larger.
 */
export const zoomOf = (fmt, scale = 1) => FORMATS[fmt].zoom * (scale || 1);

/** The column the hour is composed into, laid out off screen at the page's text width. */
export function printColumn(fmt, scale = 1) {
  const f = FORMATS[fmt];
  document.getElementById('print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'print-root';
  const col = document.createElement('div');
  col.className = 'office print-flow';
  col.style.width = `${Math.floor(((f.page[0] - 2 * f.margin[0]) * PX) / zoomOf(fmt, scale))}px`;
  root.append(col);
  document.body.append(root);
  return col;
}

const KEEP_WITH_NEXT = 'h1, h2, h3, .title-block, .psalm-head, .tr-head, summary';
const isHeading = (n) => n.matches?.(KEEP_WITH_NEXT) || (n.matches?.('p.rubric') && n.textContent.length < 80);

/** A node cut into atoms, each wrapped in shallow copies of the containers it sat in. */
function atomsOf(node, wrap = (x) => x) {
  if (node.nodeType === 3) return node.textContent.trim() ? [wrap(document.createTextNode(node.textContent))] : [];
  if (node.nodeType !== 1) return [];
  if (node.matches('.score-tools, script, style')) return [];
  // a score drawn one system per SVG, a block of paragraphs, a psalm, a list of verses, a folded translation
  const splittable = node.matches('.chant, .score, .block, .psalm, .lectiones, .preces, .hymn, ol, details, .tr, #print-source');
  if (node.matches('p') && node.textContent.length > 500) return splitParagraph(node).map(wrap);
  const units = splittable ? unitsOf(node) : [];
  if (!splittable || units.length === 0 || (units.length === 1 && units[0].run)) return [wrap(node.cloneNode(true))];
  const out = [];
  units.forEach((u, i) => {
    const shell = node.cloneNode(false);
    if (node.tagName === 'DETAILS') shell.open = true;
    if (node.tagName === 'OL') shell.start = (Number(node.getAttribute('start')) || 1) + units.slice(0, i).filter((x) => x.node?.tagName === 'LI').length;
    if (i > 0) shell.style.marginTop = '0';
    if (i < units.length - 1) shell.style.marginBottom = '0';
    const inShell = (x) => { const s = shell.cloneNode(false); if (s.tagName === 'DETAILS') s.open = true; s.append(x); return wrap(s); };
    if (u.run) {
      // one line of running text (a hymn verse between two <br>): its shell is a block, so the <br> itself is dropped
      const s = shell.cloneNode(false);
      s.append(...u.run.map((n) => n.cloneNode(true)));
      out.push(wrap(s));
    } else out.push(...atomsOf(u.node, inShell));
  });
  return out;
}

const INLINE = new Set(['I', 'B', 'EM', 'STRONG', 'SPAN', 'A', 'SMALL', 'SUP', 'SUB', 'U', 'RUBY']);
/**
 * A container's children as units: each block child on its own, and the inline content
 * between two <br> (text, italics, rubric spans) together as one line.
 */
function unitsOf(node) {
  const units = [];
  let run = [];
  const close = () => { if (run.some((n) => n.nodeType === 1 || n.textContent.trim())) units.push({ run }); run = []; };
  for (const k of node.childNodes) {
    if (k.nodeType === 3 || (k.nodeType === 1 && INLINE.has(k.tagName))) run.push(k);
    else if (k.nodeType === 1 && k.tagName === 'BR') close();
    else if (k.nodeType === 1) { close(); units.push({ node: k }); }
  }
  close();
  return units;
}
/** A long paragraph (a reading) in pieces of a few sentences, so it can run over a page. */
function splitParagraph(p) {
  const sentences = p.innerHTML.split(/(?<=[.;:!?»”’]\s)/);
  const out = [];
  let cur = '';
  for (const s of sentences) {
    cur += s;
    if (cur.replace(/<[^>]+>/g, '').length > 260) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out.map((html, i) => {
    const q = p.cloneNode(false);
    q.innerHTML = html;
    if (i > 0) { q.style.marginTop = '0'; q.style.textIndent = '0'; }
    if (i < out.length - 1) q.style.marginBottom = '0';
    return q;
  });
}

/** Pour the column's atoms into pages; returns arrays of nodes. */
export function paginate(col, fmt, scale = 1) {
  const f = FORMATS[fmt];
  const height = ((f.page[1] - 2 * f.margin[1]) * PX) / zoomOf(fmt, scale) - FOLIO;
  const atoms = [...col.childNodes].flatMap((n) => atomsOf(n));
  col.replaceChildren();
  const pages = [];
  let page = [];
  const fits = () => col.scrollHeight <= height;
  for (let i = 0; i < atoms.length; i++) {
    // a heading goes over with the atom that follows it
    const group = [atoms[i]];
    while (isHeading(group[group.length - 1]) && i + 1 < atoms.length) group.push(atoms[++i]);
    col.append(...group);
    if (!fits() && page.length) {
      group.forEach((n) => n.remove());
      pages.push(page);
      col.replaceChildren(...group);
      page = [...group];
    } else page.push(...group);
  }
  if (page.length) pages.push(page);
  col.replaceChildren();
  return pages;
}
