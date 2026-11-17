// A hymn sung in full on the melody of its first strophe. GregoBase gives many hymns of the
// Liber Hymnarius with their first strophe only; the day's text (iBreviary's, line by line)
// is set to that melody strophe by strophe: one note group a syllable, the bars where the
// first strophe has them, an elision ("sancto amóre", "illum ad") sung on one note where a
// line has a syllable too many, and the Amen on the books' formula after the last strophe.
// Strophes that cannot be fitted are given back as text.
import { latinSyllables } from './psalmtone.js';

const PITCH = 'abcdefghijklm';
const isBar = (notes) => /^\s*(?:[,;:`]+[0-9]*|::|;[0-9]+|,[0-9]+)\s*$/.test(notes);
const hasLetters = (s) => /\p{L}/u.test(s.replace(/<[^>]*>/g, ''));

/** The first strophe's melody: its clef, a note group per syllable, the bar after each syllable, its lines. */
export function tuneOf(body) {
  const first = body.split(/\(::\)/)[0];
  const clef = /\(([cf]b?[1-4])\)/.exec(first)?.[1];
  if (!clef) return null;
  const syl = []; const bars = {};
  const seg = /([^()]*)\(([^)]*)\)/g;
  let m;
  while ((m = seg.exec(first))) {
    const [, lyric, notes] = m;
    if (/^[cf]b?[1-4]$/.test(notes)) continue;
    if (!hasLetters(lyric) || /^\s*\d+\.?\s*$/.test(lyric)) {
      if (isBar(notes) && syl.length) bars[syl.length - 1] = notes.trim();
      else if (syl.length && /[a-m]/i.test(notes) && !lyric.trim()) syl[syl.length - 1].notes += notes; // a neume with no syllable of its own
      continue;
    }
    syl.push({ notes, lyric: lyric.replace(/<[^>]*>|[{}]/g, '').replace(/^\s*\d+\.\s*/, '') });
  }
  if (syl.length < 8) return null;
  // the lines: the bars inside the strophe (a line ends where a bar stands)
  const ends = Object.keys(bars).map(Number).sort((a, b) => a - b);
  const lines = [];
  let from = 0;
  for (const e of [...ends.filter((e) => e < syl.length - 1), syl.length - 1]) { lines.push(e - from + 1); from = e + 1; }
  const lastNotes = syl[syl.length - 1].notes.match(/[a-m]/gi) || [];
  const final = (lastNotes[lastNotes.length - 1] || 'f').toLowerCase();
  return { clef, syl, bars, lines, final };
}

/** "Amen." on the Liber Hymnarius' formula: the final with the note above, then the note below and the final. */
function amen(final) {
  const i = PITCH.indexOf(final);
  if (i < 1 || i > PITCH.length - 2) return '';
  const [lo, up] = [PITCH[i - 1], PITCH[i + 1]];
  return ` A(${final}${up}${final})men.(${lo}${final}..)`;
}

const VOWEL = /^[aeiouyáéíóúýæœǽ]/i;
const fold = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe');
/** Elision points of a run of syllables: k where syllable k ends a word in a vowel or -m and k+1 begins one with a vowel or h. */
function elisions(syls) {
  const out = [];
  for (let k = 0; k < syls.length - 1; k++) {
    const a = fold(syls[k].text.replace(/[^\p{L}]+$/u, '')), b = fold(syls[k + 1].text.replace(/^[^\p{L}]+/u, ''));
    if (syls[k + 1].wordStart && /([aeiouy]|[aeiou]m|ae|oe)$/.test(a) && (/^[aeiouy]/.test(b) || /^h[aeiouy]/.test(b))) out.push(k);
  }
  return out;
}
const textSyllables = (line) => latinSyllables(line).map((s, k) => ({
  text: `${(s.prepunctuation || '')}${s.all.trim()}${s.punctuation || ''}`,
  wordStart: k === 0 || /^\s/.test(s.all) || !!s.prepunctuation,
})).filter((s) => s.text);

/**
 * A line of text on a stretch of the tune ([{ notes, lyric, bar }]): as many syllables as note
 * groups; a syllable too many is an elision of the text, sung on one note group ("sancto~amóre");
 * one too few, an elision the first strophe sang in two (its two note groups go to one syllable).
 */
function fitLine(text, tune) {
  const syls = textSyllables(text);
  const d = syls.length - tune.length;
  if (d > 0) {
    const cand = elisions(syls);
    if (cand.length < d) return null;
    const merge = new Set(cand.slice(0, d));
    const out = [];
    // the vowel not sung marked as the Liber Hymnarius marks it: "nostr<e>a</e> ætérna"
    const elide = (t) => t.replace(/([aeiouyæœáéíóúýǽ]+m?)([^\p{L}]*)$/iu, '<e>$1</e>$2');
    syls.forEach((x, k) => { if (merge.has(k - 1)) out[out.length - 1].text = `${elide(out[out.length - 1].text)}~${x.text}`; else out.push({ ...x }); });
    return out.map((x, k) => ({ ...x, notes: tune[k].notes, bar: tune[k].bar }));
  }
  if (d < 0) {
    const tuneSyls = tune.map((t, k) => ({ text: t.lyric.trim(), wordStart: k === 0 || /^\s/.test(t.lyric) }));
    const cand = elisions(tuneSyls);
    if (cand.length < -d) return null;
    const merge = new Set(cand.slice(0, -d));
    const groups = [];
    tune.forEach((t, k) => { if (merge.has(k - 1)) { const g = groups[groups.length - 1]; g.notes += t.notes; g.bar = t.bar; } else groups.push({ ...t }); });
    return syls.map((x, k) => ({ ...x, notes: groups[k].notes, bar: groups[k].bar }));
  }
  return syls.map((x, k) => ({ ...x, notes: tune[k].notes, bar: tune[k].bar }));
}

/** One strophe (its lines) on the tune, numbered `n`, with the Amen if it ends with one; null if it does not fit. */
export function fitStrophe(tune, lines, n = null) {
  lines = lines.map((l) => l.trim()).filter(Boolean);
  let withAmen = false;
  const last = lines.length - 1;
  if (/\s*Amen\.?$/.test(lines[last])) { lines[last] = lines[last].replace(/\s*Amen\.?$/, ''); withAmen = true; if (!lines[last]) lines.pop(); }
  const notes = tune.syl.map((x, k) => ({ ...x, bar: tune.bars[k] }));
  // line by line when the text has the tune's lines, else (or failing that) the strophe as one
  let fitted = null;
  if (lines.length === tune.lines.length) {
    fitted = [];
    let from = 0;
    for (let k = 0; k < lines.length && fitted; k++) {
      const f = fitLine(lines[k], notes.slice(from, from + tune.lines[k]));
      if (f) fitted.push(...f); else fitted = null;
      from += tune.lines[k];
    }
  }
  fitted ||= fitLine(lines.join(' '), notes);
  if (!fitted) return null;
  let g = '';
  fitted.forEach((s, k) => {
    g += `${s.wordStart && k ? ' ' : ''}${k === 0 && n ? `${n}. ` : ''}${s.text}(${s.notes})`;
    if (s.bar && k < fitted.length - 1) g += ` (${s.bar})`;
  });
  if (withAmen) g += amen(tune.final);
  return `${g} (::)`;
}

/**
 * The day's hymn text (iBreviary's blocks) as strophes [[line…]…]: its last line, which
 * iBreviary prints apart ("in sempitérna sǽcula. Amen."), put back on the last strophe.
 */
export function joinStrophes(strophes) {
  const out = [];
  for (const st of strophes) {
    if (out.length && st.length <= 2 && st.length < out[out.length - 1].length && /Amen\.?\s*$/.test(st[st.length - 1])) out[out.length - 1] = [...out[out.length - 1], ...st];
    else out.push([...st]);
  }
  return out;
}

/**
 * The whole hymn as one score: `body` (GABC, first strophe at least) with `strophes`
 * (the day's text, [[line, …], …]) set from the second on, or from the first when the
 * score's own first strophe is not the text's (a feminine form: "famulam"). Returns
 * { gabc, rest } where `rest` are the strophes that could not be set (as text), or null.
 */
export function fullHymn(body, strophes) {
  const tune = tuneOf(body);
  if (!tune || !strophes?.length) return null;
  strophes = joinStrophes(strophes);
  const head = body.split(/\(::\)/)[0];
  const out = [`(${tune.clef}) ${head.replace(/^\s*\([cf]b?[1-4]\)\s*/, '').trim()} (::)`];
  const rest = [];
  strophes.slice(1).forEach((st, k) => {
    const g = fitStrophe(tune, st, k + 2);
    if (g && !rest.length) out.push(g); else rest.push(st);
  });
  return { gabc: out.join('\n'), rest };
}

/** The score's strophes as text, when there is no text beside it: [[line…]…] (lines cut at its bars). */
export function strophesOf(body) {
  return body.split(/\(::\)/).map((st) => {
    const lines = [''];
    const seg = /([^()]*)\(([^)]*)\)/g; let m;
    while ((m = seg.exec(st))) {
      const [, lyric, notes] = m;
      if (/^[cf]b?[1-4]$/.test(notes)) continue;
      if (hasLetters(lyric)) lines[lines.length - 1] += lyric.replace(/<[^>]*>/g, '').replace(/\{|\}/g, '').replace(/^\s*\d+\.\s*/, '');
      if (isBar(notes) && lines[lines.length - 1].trim()) lines.push('');
    }
    return lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }).filter((l) => l.length);
}

/** The first two words of a hymn, folded, to tell whether a score and a text are the same hymn. */
export const incipitKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/j/g, 'i').replace(/<[^>]*>|\([^)]*\)|[{}]/g, '').replace(/[^a-z ]+/g, ' ').trim().split(/\s+/).slice(0, 2).join(' ');
