// Where the scores come from: the abbreviations shown at the top right of each score, and
// spelt out in the help. The build (scripts/build.mjs) labels every GABC file it ships with
// `cantus-source: <abbr> <page>`, choosing among a chant's books in the order below (the
// books of the reformed office first). `gregobase` lists GregoBase's ids for the book.

export const BOOKS = [
  { abbr: 'OCO', title: 'Ordo Cantus Officii, editio cum cantu (antiphonale.net, v.6, 2026): its own notation; the number is its page' },
  { abbr: 'LH', title: 'Liber Hymnarius (Solesmes, 1983)', gregobase: [15] },
  { abbr: 'AM I', title: 'Antiphonale Monasticum I: De Tempore (Solesmes, 2005)', gregobase: [17] },
  { abbr: 'AM II', title: 'Antiphonale Monasticum II: Psalterium (Solesmes, 2006)', gregobase: [18] },
  { abbr: 'AM III', title: 'Antiphonale Monasticum III: De Sanctis (Solesmes, 2007)', gregobase: [19] },
  { abbr: 'AR II', title: 'Antiphonale Romanum II: Ad Vesperas in dominicis et festis (Solesmes, 2009)', gregobase: [6] },
  { abbr: 'AR I', title: 'Antiphonale Romanum I: Ad Laudes et ad Horas minores (Solesmes, 2020)', gregobase: [53] },
  { abbr: 'A&R I', title: 'Antiphonæ et Responsoria, Tomus I (Melos Antiqua, 2016)', gregobase: [61], header: 'Tomus I' },
  { abbr: 'A&R II', title: 'Antiphonæ et Responsoria, Tomus II (Melos Antiqua, 2017)', gregobase: [62], header: 'Tomus II' },
  { abbr: 'A&R III', title: 'Antiphonæ et Responsoria, Tomus III (Melos Antiqua, 2018)', gregobase: [63], header: 'Tomus III' },
  { abbr: 'A&R IV', title: 'Antiphonæ et Responsoria, Tomus IV (Melos Antiqua, 2019)', gregobase: [64], header: 'Tomus IV' },
  { abbr: 'A&R V', title: 'Antiphonæ et Responsoria, Tomus V (Melos Antiqua, 2021)', gregobase: [67], header: 'Tomus V' },
  { abbr: 'PM', title: 'Psalterium Monasticum (Solesmes, 1981)', gregobase: [24] },
  { abbr: 'NR', title: 'Nocturnale Romanum (Hartker, 2002)', gregobase: [23] },
  { abbr: 'HG I', title: 'Les Heures Grégoriennes I (Communauté Saint-Martin, 2008)', gregobase: [27] },
  { abbr: 'HG II', title: 'Les Heures Grégoriennes II (Communauté Saint-Martin, 2008)', gregobase: [28] },
  { abbr: 'HG III', title: 'Les Heures Grégoriennes III (Communauté Saint-Martin, 2008)', gregobase: [29] },
  { abbr: 'GS', title: 'Graduale Simplex (Vatican, 1975)', gregobase: [8] },
  { abbr: 'GR', title: 'Graduale Romanum (Solesmes, 1974; 1961; Vatican, 1908)', gregobase: [4, 2, 1] },
  { abbr: 'GM', title: 'The Gregorian Missal (Solesmes, 1990)', gregobase: [16] },
  { abbr: 'LC', title: 'Liber Cantualis (Solesmes, 1983)', gregobase: [66] },
  { abbr: 'AMon', title: 'Antiphonale Monasticum (Solesmes, 1934; Antiphonale Monasticum Solesmense, 1935)', gregobase: [7, 38] },
  { abbr: 'LA', title: 'Liber Antiphonarius (Solesmes, 1960)', gregobase: [48] },
  { abbr: 'LU', title: 'Liber Usualis (Solesmes, 1961)', gregobase: [3] },
  { abbr: 'AR 1912', title: 'Antiphonale Romanum (Vatican, 1912)', gregobase: [9] },
  { abbr: 'CS', title: 'Cantus Selecti (Solesmes, 1957)', gregobase: [10] },
  { abbr: 'CM', title: 'Cantus Mariales (Solesmes, 1906)', gregobase: [47] },
  { abbr: 'LR', title: 'Liber Responsorialis (Solesmes, 1895)', gregobase: [56] },
  { abbr: 'CC', title: 'Chants of the Church (Solesmes, 1956)', gregobase: [5] },
  { abbr: 'OP', title: 'Dominican books: Antiphonarium (Gillet, 1933), Matutinum (1936), Graduale (Suarez, 1950), Antiphonarium (Jandel, 1862)', gregobase: [11, 12, 14, 35] },
  { abbr: 'Cist', title: 'Hymnarium Cisterciense (Westmalle, 1909)', gregobase: [31] },
  { abbr: 'PG', title: 'The Plainchant Gradual (Wantage, 1962–65)', gregobase: [51, 50] },
  { abbr: 'Hartker', title: 'Hartker Antiphoner, St. Gallen, Cod. Sang. 390–391 (c. 1000)', gregobase: [59, 60] },
  { abbr: 'PC', title: 'Psalterium currens, as cited by a transcription on GregoBase (from antiphonale.net)' },
  { abbr: 'CAO', title: 'Corpus Antiphonalium Officii (Hesbert): a transcription on GregoBase (from antiphonale.net) that cites only the antiphon\'s number there' },
  { abbr: 'Calithes', title: 'calithes.it, as cited by a transcription on GregoBase (from antiphonale.net)' },
  { abbr: 'Gallica', title: 'A manuscript on Gallica (Bibliothèque nationale de France), as cited by a transcription on GregoBase' },
  { abbr: 'GB', title: 'GregoBase, without a book: the number is the chant\'s GregoBase id' },
];

/** The book an abbreviation stands for ("AM I 215" -> the Antiphonale Monasticum I). */
export function bookOf(label) {
  return [...BOOKS].sort((a, b) => b.abbr.length - a.abbr.length).find((b) => label === b.abbr || label.startsWith(`${b.abbr} `)) || null;
}

/** GregoBase's page of a chant in GregoBase's own notation for it: "[126]" -> "126". */
const cleanPage = (p) => String(p || '').replace(/^\[|\]$/g, '').trim();

/**
 * The label of a GregoBase chant: its first book in BOOKS' order, with the page; failing
 * that, the book named in the GABC header (antiphonale.net's transcriptions); else GB <id>.
 * `chant` is a record of data/gregobase/chants.json, `header` the GABC file's headers.
 */
export function gregobaseLabel(chant, header = {}) {
  const sources = chant?.sources || [];
  for (const b of BOOKS) {
    const hit = b.gregobase && sources.find(([sid]) => b.gregobase.includes(sid));
    if (hit) return `${b.abbr}${cleanPage(hit[1]) ? ` ${cleanPage(hit[1])}` : ''}`;
  }
  const book = header.book || '';
  let m;
  if ((m = /Antiphon\w*\s*&\s*Responsori\w*\s*\/\s*Tomus\s+([IVX]+),?\s*p\.?\s*(\d+)/i.exec(book))) return `A&R ${m[1]} ${m[2]}`;
  if ((m = /Psalterium currens,?\s*p\.?\s*(\d+)/i.exec(book))) return `PC ${m[1]}`;
  if ((m = /Psalterium monasticum,?\s*p\.?\s*(\d+)/i.exec(book))) return `PM ${m[1]}`;
  if ((m = /^\s*CAO\s*(\d+)/i.exec(book))) return `CAO ${m[1]}`;
  if (/calithes/i.test(book)) return 'Calithes';
  if (/gallica/i.test(book)) return 'Gallica';
  return chant ? `GB ${chant.id}` : '';
}
