// Psalm-tone pointing: fit a Latin verse to a Gregorian psalm tone.
//
// The tone strings use the notation of jgabc's psalmtone.js (Benjamin Bloomfield,
// public domain): space-separated GABC note groups, one per syllable, where
//   'x   is sung on an accented syllable,
//   xr   is an "open" note that takes any number (0+) of syllables (the tenor, or the
//        unaccented syllables between two accents of a cadence),
//   x    any other group takes exactly one syllable (intonation, preparatory, final).
// The first open group of a mediant is the tenor and the groups before it the
// intonation. Formulas follow the Antiphonale Romanum II (2009), pp. 738-740
// (GregoBase 18352-18366), with the termination names of the Antiphonale Monasticum
// 2005 that the Ordo Cantus Officii uses; each termination was checked against the
// "E u o u a e" of the OCO antiphons on GregoBase (test/psalmtone.test.mjs).
// The pointing engine itself is a fresh, smaller implementation of the same rules.

export const TONES = {
  '1': { clef: 'c4', flex: 'g', mediant: "f gh hr 'ixi hr 'g hr h.",
    endings: { a: "hr g f 'g hr h.", a2: "hr g f 'g gr goh.", a3: "hr g f 'gh gr gh..",
      d: "hr g f gr 'gf d.", d2: "hr g f 'g gr gvFED.", d3: "hr g f 'gh gr gvFED.",
      f: "hr g f 'gh gr gf..", g: "hr g f 'gh gr g.", g2: "hr g f 'g gr ghg.", g3: "hr g f 'h gr g." } },
  '2': { clef: 'f3', flex: 'g', mediant: "f g hr 'i hr h.",
    endings: { d: "hr g 'ef fr f." } },
  '2*': { clef: 'c3', flex: 'h', mediant: "i hi ir h i 'j ir i.",
    endings: { a: "ir h i j 'h fr f.", c: "ir 'i hr h.", d: "ir h i j 'h ir i." } },
  '3': { clef: 'c4', flex: 'h', mediant: "g hi ir 'k jr 'ih j.",
    endings: { a: "ir 'j hr 'j jr ih..", a2: "ir 'j hr hi 'h gr goh.", b: "ir 'j hr 'j jr i.",
      g: "ir 'j hr hi 'h gr g.", g2: "ir 'j hr hi 'h gr goh." } },
  '4': { clef: 'c4', flex: 'g', mediant: "h gh hr g h 'i hr h.",
    endings: { a: "hr g h i 'g hr h.", e: "hr g h ih 'gf e.", g: "hr 'h gr g." } },
  '4*': { clef: 'c4', flex: 'f', mediant: "g fg gr f g 'h gr g.",
    endings: { e: "gr 'h fr 'g er e." } },
  '5': { clef: 'c3', flex: 'f', mediant: "d f hr 'i hr h.",
    endings: { a: "hr 'i gr 'h fr f." } },
  '6': { clef: 'c4', flex: 'g', mediant: "f gh hr g 'h fr f.",
    endings: { f: "hr f gh 'g fr f." } },
  '7': { clef: 'c3', flex: 'h', mediant: "hg hi ir 'k jr 'i jr j.",
    endings: { a: "ir 'j ir 'h hr gf..", b: "ir 'j ir 'h hr g.", c: "ir 'j ir 'h hr gh..",
      c2: "ir 'j ir 'h hr ih..", d: "ir 'j ir 'h hr goi." } },
  '8': { clef: 'c4', flex: 'h', mediant: "g h jr 'k jr j.",
    endings: { a: "jr i j 'h gr gh..", c: "jr h j 'k jr j.", g: "jr i j 'h gr g.", g2: "jr i j 'h gr ghg." } },
  'C': { clef: 'c3', flex: 'f', mediant: "hr g f 'h hr h.",
    endings: { c: "hr h.", c2: "hr f h 'i hr h." } },
  'D': { clef: 'c4', flex: 'f', mediant: "g fg gr f g 'h gr g.",
    endings: { g: "gr f g h 'f gr g.", f: "gr 'g fr f.", d: "gr f g h 'f dr d." } },
  'E': { clef: 'c4', flex: 'g', mediant: "hr 'g fr f.",
    endings: { e: "hr 'ixi gr 'ixi hr h." } },
  'per.': { clef: 'c4', flex: 'g', mediant: "ixhi hr g ixi h 'g fr f.",
    endings: { '': "gr d 'f fr ed.." } },
};

/**
 * Read an OCO mode label ("8g", "2*a", "1d2", "4*e", "Dg", "Cc2", "per.", "7at", "E/4*e")
 * into {tone, ending}. Returns null when the label names no psalm tone.
 */
export function parseMode(label) {
  if (!label) return null;
  const s = String(label).split('/')[0].trim();
  const m = /^(per\.|[1-8]\**|[CDE])(?:-\d)?([a-g]?\d?)t?$/.exec(s);
  if (!m) return null;
  let tone = m[1];
  if (/^\d\*\*/.test(tone)) tone = tone.slice(0, 2);
  if (!TONES[tone]) tone = tone.replace(/\*+$/, '');
  if (!TONES[tone]) return null;
  let ending = m[2] || '';
  if (tone === 'C' && ending === '2') ending = 'c2';
  const endings = TONES[tone].endings;
  if (!(ending in endings)) {
    ending = Object.keys(endings).find((k) => k[0] === ending[0]) ?? Object.keys(endings)[0];
  }
  return { tone, ending };
}

// ------------------------------------------------------------------ GABC helpers
const PITCH = 'abcdefghijklm';
/** Staff position of the C a clef puts on the stave (a = 0). */
function cPosition(clef) {
  const line = Number(clef.slice(-1));
  return clef[0] === 'f' ? 1 + 2 * line - 3 : 1 + 2 * line;
}
export function shiftGabc(notes, n) {
  if (!n) return notes;
  return notes.replace(/[a-mA-M]/g, (c) => {
    const lower = c.toLowerCase();
    const i = Math.max(0, Math.min(12, PITCH.indexOf(lower) + n));
    return c === lower ? PITCH[i] : PITCH[i].toUpperCase();
  });
}
const lastPitch = (notes) => (notes.match(/[a-mA-M]/g) || []).pop()?.toLowerCase();

const EUOUAE = /E\(([^)]*)\)\s*u\(([^)]*)\)\s*o\(([^)]*)\)\s*u\(([^)]*)\)\s*a\(([^)]*)\)\s*e\.?\(([^)]*)\)/;
const GLORIA_END = [{ text: 'et in sǽcula sæculórum. Amen.', part: 'termination' }];
/** Pitches of note groups relative to the last one: the shape of a termination. */
function shape(groups) {
  const ps = groups.map((g) => (g.replace(/([a-m])x\1/gi, '$1').match(/[a-m]/gi) || []).map((c) => PITCH.indexOf(c.toLowerCase())));
  const last = ps[ps.length - 1]?.[ps[ps.length - 1].length - 1] ?? 0;
  return ps.map((p) => p.map((x) => x - last).join(',')).join(' ');
}

/**
 * Where and how to sing the psalm tone after a given antiphon. With the antiphon's
 * score, its clef is used, and its "E u o u a e" (when written) fixes the pitch and,
 * if the OCO label is ambiguous or disagrees, the ending itself: the ending of the
 * labelled tone (or else of any tone) that sings "sæculórum. Amen" as written.
 * `identify: false` keeps the label's ending (for testing the table).
 */
export function toneContext(mode, antiphonGabc = null, { identify = true } = {}) {
  let pm = parseMode(mode);
  const body = antiphonGabc ? antiphonGabc.split(/^%%\s*$/m).pop() : null;
  const eu = body && EUOUAE.exec(body);
  if (eu && identify) {
    const want = shape(eu.slice(1));
    const order = Object.keys(TONES).sort((x, y) => (y === pm?.tone) - (x === pm?.tone));
    let found = null;
    for (const tone of order) {
      for (const ending of Object.keys(TONES[tone].endings)) {
        const got = pointVerse(GLORIA_END, { tone, ending, shift: 0 })[0].syllables.slice(-6).map((x) => x.notes);
        if (shape(got) === want) { found = { tone, ending }; break; }
      }
      if (found) break;
    }
    if (found) pm = found;
  }
  if (!pm) return null;
  const tone = TONES[pm.tone];
  let clef = tone.clef, shift = 0;
  if (body) {
    const clefs = [...body.slice(0, eu ? eu.index : undefined).matchAll(/\((?:[^)]*?)([cf]b?[1-4])\)/g)];
    if (clefs.length) clef = clefs[clefs.length - 1][1];
    if (eu) {
      const want = PITCH.indexOf(lastPitch(eu[6]));
      const have = PITCH.indexOf(lastPitch(tone.endings[pm.ending]));
      if (want >= 0 && have >= 0) shift = want - have;
    } else {
      shift = cPosition(clef.replace('b', '')) - cPosition(tone.clef);
    }
  }
  return { ...pm, clef, shift, name: `${pm.tone}${pm.ending}` };
}

function parseCadence(str, shift) {
  const groups = str.trim().split(/\s+/).map((g) => {
    const accent = g[0] === "'";
    if (accent) g = g.slice(1);
    const open = /r$/.test(g);
    if (open) g = g.slice(0, -1);
    return { notes: shiftGabc(g, shift), accent, open };
  });
  const t = groups.findIndex((g) => g.open);
  return { intonation: groups.slice(0, Math.max(t, 0)).map((g) => g.notes), tenor: groups[t]?.notes, groups: groups.slice(t + 1) };
}

// ------------------------------------------------------------------ syllables
const VOWEL = /[aeiouyáéíóúýæǽœëäöü]/i;
const ACCENTED = /[áéíóúýǽ]/i;
const PREFIX_I = /^(ad|ab|ob|sub|con|in|dis|per|trans)$/i;
const ONSETS = ['str', 'spr', 'scr', 'sc', 'st', 'sp', 'ct', 'gn', 'ps', 'qu', 'gu', 'ch', 'ph', 'th', 'rh',
  'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tr'];
const MONOSYLLABLES = /^(cui|huic|heu|seu|neu|ceu)$/i;
const NO_DIPHTHONG = /^(israel|ismael|michael|raphael|aer|aere|aerem|aeris)$/i;

/** Split one word (letters only) into syllables: returns [{text, accent}] with accent on the stressed one. */
export function syllabifyWord(word) {
  const low = word.toLowerCase();
  if (MONOSYLLABLES.test(low)) return [{ text: word, accent: false }];
  // find vowel nuclei
  const nuclei = [];
  for (let i = 0; i < low.length; i++) {
    const c = low[i];
    if (!VOWEL.test(c)) continue;
    const prev = low[i - 1], next = low[i + 1];
    if (c === 'u' && (prev === 'q' || (prev === 'g' && low[i - 2] === 'n')) && next && VOWEL.test(next)) continue;
    if (c === 'i' && next && VOWEL.test(next) && next !== 'i') {
      const last = nuclei[nuclei.length - 1];
      if (i === 0) continue; // iam, Iesus, iustítia
      if (last && last[1] === i && !/[ëäöü]/.test(prev)) continue; // eius, maior
      if (PREFIX_I.test(low.slice(0, i).normalize('NFD').replace(/\p{M}/gu, ''))) continue; // adiútor, ádiuvet, iniústus
    }
    const last = nuclei[nuclei.length - 1];
    const pair = last && last[1] === i ? low.slice(last[0], i + 1) : '';
    if (pair && /^(ae|áe|aé|oe|óe|oé|au|áu)$/.test(pair) && !NO_DIPHTHONG.test(low)) { last[1] = i + 1; continue; }
    nuclei.push([i, i + 1]);
  }
  if (nuclei.length <= 1) return [{ text: word, accent: false, mono: true }];
  // cut points between nuclei
  const cuts = [0];
  for (let k = 0; k < nuclei.length - 1; k++) {
    const a = nuclei[k][1], b = nuclei[k + 1][0];
    const cluster = low.slice(a, b);
    let onset = cluster.length <= 1 ? cluster.length : 1;
    if (cluster.length >= 2) {
      const o = ONSETS.find((x) => x.length <= cluster.length && cluster.endsWith(x) && !(x === 'gu' && cluster.length === 2 && cluster[0] !== 'n'));
      if (o) onset = o.length;
    }
    if (k === 0 && /^ex$/.test(low.slice(0, b))) onset = 0; // ex-áudi, ex-áltat
    cuts.push(b - onset);
  }
  cuts.push(word.length);
  const syls = [];
  for (let k = 0; k < nuclei.length; k++) syls.push({ text: word.slice(cuts[k], cuts[k + 1]), accent: false });
  let acc = syls.findIndex((s) => ACCENTED.test(s.text));
  if (acc < 0) acc = /^israel$/i.test(low) ? 0 : syls.length - 2; // unmarked: disyllables, and a few names
  syls[acc].accent = true;
  syls[acc].primary = true;
  // secondary accents, counting back by two from the main accent; with three syllables
  // before it the secondary moves to the first (glò-ri-fi-cá-bo)
  let n = acc;
  while (n >= 2) {
    const s = n === 3 ? 0 : n - 2;
    syls[s].accent = true;
    n = s;
  }
  return syls;
}

/**
 * Split a line of text into syllables carrying their spacing and punctuation:
 * [{text, accent, wordStart, wordEnd}]
 */
export function syllabify(line) {
  const out = [];
  for (const m of line.matchAll(/(\s*)(\S+)/g)) {
    const [, space, token] = m;
    const w = /^([^\p{L}]*)([\p{L}]+(?:[-'][\p{L}]+)*)([^\p{L}]*)$/u.exec(token);
    if (!w) {
      if (out.length) out[out.length - 1].text += space + token; // stray punctuation
      continue;
    }
    const parts = w[2].split('-').flatMap((p) => syllabifyWord(p));
    parts.forEach((s, i) => out.push({
      text: (i === 0 ? space + w[1] : '') + s.text + (i === parts.length - 1 ? w[3] : ''),
      accent: parts.length > 1 && s.accent,
      primary: parts.length > 1 && !!s.primary,
      wordStart: i === 0, wordEnd: i === parts.length - 1,
    }));
  }
  return out;
}

// ------------------------------------------------------------------ pointing
/**
 * Assign the notes of a cadence to the syllables of a half-verse.
 * Each syllable gets {notes, role}, role ∈ intonation | tenor | prep | accent | fill | final.
 */
export function pointHalf(syls, cadence, { intone = false } = {}) {
  const N = syls.length;
  const out = syls.map((s) => ({ ...s, notes: cadence.tenor, role: 'tenor' }));
  if (!N) return out;
  const G = cadence.groups;
  const accentIdx = G.map((g, i) => (g.accent ? i : -1)).filter((i) => i >= 0);
  const set = (i, notes, role) => { if (i >= 0 && i < N) { out[i].notes = notes; out[i].role = role; } };

  // groups after the last accent (or the whole cadence when it has none)
  const lastG = accentIdx.length ? accentIdx[accentIdx.length - 1] : -1;
  const after = G.slice(lastG + 1);
  let accSyl;
  if (lastG >= 0) {
    accSyl = -1;
    for (let i = N - 1; i >= 0; i--) if (syls[i].accent && i < N - 1) { accSyl = i; break; }
    if (accSyl < 0) accSyl = Math.max(0, N - 2);
  } else accSyl = N - 1 - after.filter((g) => !g.open).length;
  const fixed = after.filter((g) => !g.open);
  const open = after.find((g) => g.open);
  let i = N - 1, f = fixed.length - 1;
  while (f >= 0 && i > accSyl) { set(i, fixed[f].notes, 'final'); i--; f--; }
  if (f >= 0) { // fewer syllables than notes: gather the rest onto the first one
    const j = Math.min(N - 1, accSyl + 1);
    const extra = fixed.slice(0, f + 1).map((g) => g.notes).join('');
    if (j > accSyl) out[j].notes = extra + out[j].notes;
  }
  for (; i > accSyl; i--) set(i, (open || fixed[0]).notes, 'fill');
  if (lastG < 0) { i = accSyl; }
  else set(accSyl, G[lastG].notes, 'accent');

  // earlier accents, right to left
  let nextSyl = accSyl;
  for (let a = accentIdx.length - 2; a >= 0; a--) {
    const gap = G.slice(accentIdx[a] + 1, accentIdx[a + 1]);
    const o = gap.findIndex((g) => g.open);
    const head = o < 0 ? [] : gap.slice(0, o), tail = o < 0 ? gap : gap.slice(o + 1);
    const gapOpen = o < 0 ? null : gap[o];
    const limit = nextSyl - 1 - tail.length - head.length;
    let s = -1;
    for (let k = limit; k >= Math.max(0, limit - (gapOpen ? 2 : 0)); k--) if (syls[k]?.accent) { s = k; break; }
    if (s < 0) s = Math.max(0, limit - (gapOpen ? 1 : 0));
    tail.forEach((g, k) => set(nextSyl - tail.length + k, g.notes, 'prep'));
    head.forEach((g, k) => set(s + 1 + k, g.notes, 'fill'));
    for (let k = s + 1 + head.length; k < nextSyl - tail.length; k++) set(k, gapOpen.notes, 'fill');
    set(s, G[accentIdx[a]].notes, 'accent');
    nextSyl = s;
  }

  // preparatory syllables before the first accent
  const firstG = accentIdx.length ? accentIdx[0] : G.length;
  const preps = G.slice(0, firstG).filter((g) => !g.open);
  const room = Math.min(preps.length, nextSyl);
  preps.slice(preps.length - room).forEach((g, k) => set(nextSyl - room + k, g.notes, 'prep'));
  const tenorEnd = nextSyl - room; // syllables [0, tenorEnd) stay on the tenor
  if (intone && cadence.intonation.length && cadence.intonation.length <= tenorEnd) {
    cadence.intonation.forEach((n, k) => set(k, n, 'intonation'));
  }
  return out;
}

function flexCadence(tenor, flex) {
  return { intonation: [], tenor, groups: [{ notes: tenor, accent: true }, { notes: flex, open: true }, { notes: flex }] };
}

/**
 * Group the printed lines of a strophe into verses. A verse is
 * [{text, part}] with part 'flex' (up to †), 'mediant' (up to *) or 'termination'.
 * Long halves run over several lines; a new verse starts at the first capitalised
 * line after the second half has begun (or at the line that carries the next sign).
 */
export function versesOf(lines) {
  const verses = [];
  let i = 0;
  const marked = (l) => /[*†]\s*$/.test(l);
  while (i < lines.length) {
    const verse = [];
    // first half: up to and including the * line, with a possible † line before it
    let j = i;
    while (j < lines.length && !/\*\s*$/.test(lines[j])) j++;
    if (j >= lines.length) { // no mediant: the remainder is one verse without halves
      lines.slice(i).forEach((t) => verse.push({ text: t, part: 'termination' }));
      verses.push(verse);
      break;
    }
    let part = lines.slice(i, j + 1).some((l) => /†\s*$/.test(l)) ? 'flex' : 'mediant';
    for (let k = i; k <= j; k++) {
      verse.push({ text: lines[k], part });
      if (/†\s*$/.test(lines[k])) part = 'mediant';
    }
    // second half: following lines up to the next verse
    const k = j + 1;
    let next = lines.length;
    for (let m = k; m < lines.length; m++) if (marked(lines[m])) { next = m; break; }
    let end = next;
    if (next < lines.length) {
      for (let m = k + 1; m < next; m++) if (/^[^\p{L}]*\p{Lu}/u.test(lines[m])) { end = m; break; }
    }
    for (let m = k; m < end; m++) verse.push({ text: lines[m], part: 'termination' });
    verses.push(verse);
    i = Math.max(end, j + 1);
  }
  return verses;
}

const stripSigns = (t) => t.replace(/\s*[*†]\s*$/, '');

/**
 * Point a verse to a tone. Returns lines: [{part, syllables:[{text, notes, role}], sign}]
 * `intone`: sing the intonation on this verse (first verse of a psalm; every verse of a
 * Gospel canticle).
 */
export function pointVerse(verse, ctx, { intone = false } = {}) {
  const tone = TONES[ctx.tone];
  const med = parseCadence(tone.mediant, ctx.shift);
  const term = parseCadence(tone.endings[ctx.ending], ctx.shift);
  const flex = flexCadence(med.tenor, shiftGabc(tone.flex, ctx.shift));
  const lines = verse.map((l) => ({ part: l.part, sign: /†\s*$/.test(l.text) ? '†' : /\*\s*$/.test(l.text) ? '*' : '', syllables: syllabify(stripSigns(l.text)) }));
  let first = true;
  for (const part of ['flex', 'mediant', 'termination']) {
    const ls = lines.filter((l) => l.part === part);
    if (!ls.length) continue;
    const all = ls.flatMap((l) => l.syllables);
    const pointed = pointHalf(all, part === 'flex' ? flex : part === 'mediant' ? med : term, { intone: intone && first && part !== 'termination' });
    let n = 0;
    for (const l of ls) { l.syllables = pointed.slice(n, n + l.syllables.length); n += l.syllables.length; }
    if (part !== 'termination') first = false;
  }
  return lines;
}

const gabcText = (t) => t.replace(/[{}<>|()[\]]/g, '');
/** One pointed verse as a GABC body (with clef). */
export function verseGabc(pointed, ctx) {
  let g = `(${ctx.clef}) `;
  for (const l of pointed) {
    for (const s of l.syllables) g += `${s.wordStart && !/^\s/.test(s.text) && g.length > 5 ? ' ' : ''}${gabcText(s.text)}(${s.notes})`;
    if (l.sign === '†') g += ' †(,)';
    if (l.sign === '*') g += ' *(:)';
    g += ' ';
  }
  return g.trim() + ' (::)';
}

const escHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
/** One pointed line as HTML: accents of the cadences bold, preparatory syllables italic. */
export function lineHtml(line) {
  let h = '';
  for (const s of line.syllables) {
    const t = escHtml(s.text);
    const lead = /^\s+/.exec(t)?.[0] || '';
    const body = t.slice(lead.length);
    if (s.role === 'accent') h += `${lead}<span class="acc">${body}</span>`;
    else if (s.role === 'prep' && line.part !== 'flex') h += `${lead}<span class="prep">${body}</span>`;
    else h += t;
  }
  if (line.sign === '†') h += ' <span class="flex">†</span>';
  if (line.sign === '*') h += ' <span class="star">*</span>';
  return h.trim();
}
