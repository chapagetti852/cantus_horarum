// PDF of an hour, through the browser's print dialog ("Save as PDF"): plain pages (A4, A5,
// Letter) or a booklet (A5 pages two to a landscape A4 sheet, half-Letter pages two to a
// Letter sheet, in saddle-stitch order: print both sides, flip on the short edge, fold).
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

/** The column the hour is composed into, laid out off screen at the page's text width. */
export function printColumn(fmt) {
  const f = FORMATS[fmt];
  document.getElementById('print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'print-root';
  const col = document.createElement('div');
  col.className = 'office print-flow';
  col.style.width = `${Math.floor(((f.page[0] - 2 * f.margin[0]) * PX) / f.zoom)}px`;
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
  const kids = [...node.childNodes].filter((k) => k.nodeType === 1 || k.textContent.trim());
  // a score drawn one system per SVG, a block of paragraphs, a psalm, a list of verses, a folded translation
  const splittable = node.matches('.chant, .score, .block, .psalm, .lectiones, .preces, .hymn, ol, details, .tr, #print-source')
    && kids.length > 0 && !(kids.length === 1 && kids[0].nodeType === 3);
  if (node.matches('p') && node.textContent.length > 500) return splitParagraph(node).map(wrap);
  if (!splittable) return [wrap(node.cloneNode(true))];
  const out = [];
  kids.forEach((k, i) => {
    const shell = node.cloneNode(false);
    if (node.tagName === 'DETAILS') shell.open = true;
    if (node.tagName === 'OL') shell.start = (Number(node.getAttribute('start')) || 1) + kids.slice(0, i).filter((x) => x.tagName === 'LI').length;
    if (i > 0) shell.style.marginTop = '0';
    if (i < kids.length - 1) shell.style.marginBottom = '0';
    out.push(...atomsOf(k, (x) => { const s = shell.cloneNode(false); if (s.tagName === 'DETAILS') s.open = true; s.append(x); return wrap(s); }));
  });
  return out;
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
function paginate(col, fmt) {
  const f = FORMATS[fmt];
  const height = ((f.page[1] - 2 * f.margin[1]) * PX) / f.zoom - FOLIO;
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

function pageNode(fmt, nodes, number, colWidth) {
  const f = FORMATS[fmt];
  const sec = document.createElement('div');
  sec.className = 'print-page';
  sec.style.width = `${f.page[0]}mm`;
  sec.style.height = `${f.page[1]}mm`;
  sec.style.padding = `${f.margin[1]}mm ${f.margin[0]}mm`;
  const flow = document.createElement('div');
  flow.className = 'office print-flow';
  flow.style.width = colWidth;
  flow.style.zoom = f.zoom;
  flow.append(...nodes);
  sec.append(flow);
  if (number && nodes.length) {
    const folio = document.createElement('div');
    folio.className = 'folio';
    folio.textContent = number;
    sec.append(folio);
  }
  return sec;
}

/**
 * Lay the composed column out in pages (or booklet sheets), open the print dialog, and
 * clean up afterwards (`done` is called once the dialog closes).
 */
export function printPages(col, fmt, done = () => {}) {
  const f = FORMATS[fmt];
  const root = col.parentNode;
  const width = col.style.width;
  const pages = paginate(col, fmt);
  col.remove();
  let sheets;
  if (f.sheet) {
    // saddle stitch: pad to a multiple of four, then outer pages first on each sheet
    const n = Math.ceil(pages.length / 4) * 4;
    const ps = Array.from({ length: n }, (_, i) => pageNode(fmt, pages[i] || [], pages[i] ? i + 1 : 0, width));
    sheets = [];
    for (let s = 0; s < n / 4; s++) {
      sheets.push([ps[n - 1 - 2 * s], ps[2 * s]], [ps[2 * s + 1], ps[n - 2 - 2 * s]]);
    }
    sheets = sheets.map(([l, r]) => {
      const sh = document.createElement('div');
      sh.className = 'print-sheet';
      sh.style.width = `${f.sheet[0]}mm`;
      sh.style.height = `${f.sheet[1]}mm`;
      sh.append(l, r);
      return sh;
    });
  } else {
    sheets = pages.map((p, i) => pageNode(fmt, p, i + 1, width));
  }
  root.replaceChildren(...sheets);
  const size = f.sheet || f.page;
  const style = document.createElement('style');
  style.id = 'print-page-style';
  style.textContent = `@page { size: ${size[0]}mm ${size[1]}mm; margin: 0; }`;
  document.head.append(style);
  document.documentElement.classList.add('printing');
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    document.documentElement.classList.remove('printing');
    style.remove();
    root.remove();
    done();
  };
  window.addEventListener('afterprint', cleanup);
  // let the browser lay the pages out before the dialog takes its picture of them
  requestAnimationFrame(() => setTimeout(() => window.print(), 50));
  return { pages: pages.length, sheets: sheets.length };
}
