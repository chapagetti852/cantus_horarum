// The responsories of the Office of Readings that GregoBase has a score of
// (data/oco/responsoria-prolixa.json, scripts/oco/match_responsoria_prolixa.py): found by the
// first words of the response and of the verse, in a spelling that levels the books' habits.

/**
 * Words in a levelled spelling (as `fuzzy` in the script): no accents, æ œ ae oe as e, i for
 * j and y, f for ph, no h, u for v, doubled letters single, -tio as -cio, numquam as nunquam,
 * cotidie as quotidie; without the Alleluias the seasons add.
 */
export function fuzzyWords(s) {
  const t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/æ|œ|ae|oe/g, 'e').replace(/j|y/g, 'i').replace(/ph/g, 'f').replace(/h/g, '').replace(/v/g, 'u')
    .replace(/[^a-z ]+/g, ' ').replace(/(.)\1+/g, '$1')
    .replace(/ti(?=[aeou])/g, 'ci').replace(/mqu/g, 'nqu').replace(/quoti/g, 'coti');
  return t.split(' ').filter((w) => w && w !== 'aleluia');
}

/** Two words the same, or one a variant of the other ("venit" / "veniet", "discedemus" / "discedimus"). */
function alike(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  // edit distance of one or two letters
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] <= (Math.min(a.length, b.length) >= 8 ? 2 : 1);
}
/** How many of the first `n` words of `text` are those of `words`, place by place. */
const agree = (text, words, n) => { const t = text.split(' '); let k = 0; for (let i = 0; i < Math.min(n, words.length, t.length); i++) if (alike(t[i], words[i])) k++; return k; };

const R_WORDS = 5, V_WORDS = 4;
/**
 * The GregoBase id of the responsory of the Liturgia Horarum with response `r` and verse `v`,
 * from `list` ([[id, response, verse], ...] in order of preference): the one whose response
 * and verse begin with the same words, one word of each allowed to differ (the books read
 * "Devastavit vineam tuam" where the Liturgia Horarum has "Exterminavit", "convertere" for
 * "respice"); the closest, the first of the list among equals. Null when there is none: the
 * same response with another verse is another piece.
 */
export function findResponsory(list, r, v) {
  const R = fuzzyWords(r).slice(0, R_WORDS), V = fuzzyWords(v).slice(0, V_WORDS);
  if (R.length < 4 || V.length < 3) return null;
  let best = null, bestScore = 0;
  for (const [id, a, b] of list || []) {
    const nr = Math.min(R.length, a.split(' ').length), nv = Math.min(V.length, b.split(' ').length);
    if (nr < 4 || nv < 3) continue;
    const sr = agree(a, R, nr), sv = agree(b, V, nv);
    if (sr < nr - 1 || sv < nv - 1 || sr + sv < nr + nv - 1 - (nr + nv >= 9 ? 1 : 0)) continue;
    // among those that fit, the one with most words exactly the same
    const exact = (text, words, n) => text.split(' ').slice(0, n).filter((w, i) => w === words[i]).length;
    const score = sr / nr + sv / nv + (exact(a, R, nr) + exact(b, V, nv)) / 100;
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return best;
}
