// Psalm tones: the tone table, which tone and ending an antiphon calls for, and the
// pointing of verses to it.
//
// The pointing is jgabc's own engine (Benjamin Bloomfield's psalm-tone tool,
// https://bbloomf.github.io/jgabc/psalmtone.html, public domain), vendored in
// site/vendor/jgabc and called exactly as that page calls it: its Latin syllables (Hypher
// patterns), accents, flex, mediant, termination, intonation on the first verse (every
// verse of a Gospel canticle), bold accented and italic preparatory syllables for verses
// in text. In the browser it is global; Node tests hand it over with setEngine().
//
// The tone strings use jgabc's notation: space-separated GABC note groups, one per
// syllable, where 'x is sung on an accented syllable, xr is an open note taking any
// number of syllables (the tenor, or those between two accents), and the groups before
// the tenor are the intonation; an open group just before an accent is the hollow note
// of the 2005 books. Formulas follow the Antiphonale Romanum II (2009), pp. 738-740
// (GregoBase 18352-18366), with the termination names of the Antiphonale Monasticum
// 2005 that the Ordo Cantus Officii uses; each termination is checked against the
// "E u o u a e" of the OCO antiphons (test/psalmtone.test.mjs).

export const TONES = {
  '1': { clef: 'c4', flex: 'g', mediant: "f gh hr 'ixi hr 'g hr h.",
    endings: { a: "hr g f 'g hr h.", a2: "hr g f 'g gr goh.", a3: "hr g f 'gh gr gh..",
      d: "hr g f gr 'gf d.", d2: "hr g f 'g gr gvFED.", d3: "hr g f 'gh gr gvFED.",
      f: "hr g f 'gh gr gf..", g: "hr g f 'gh gr g.", g2: "hr g f 'g gr ghg.", g3: "hr g f 'h gr g." } },
  '2': { clef: 'f3', flex: 'g', mediant: "f g hr 'i hr h.",
    endings: { d: "hr g er 'ef f." } },
  '2*': { clef: 'c3', flex: 'h', mediant: "i hi ir h i 'j ir i.",
    endings: { a: "ir h i j 'h fr f.", c: "ir 'i hr h.", d: "ir h i j 'h ir i." } },
  '3': { clef: 'c4', flex: 'h', mediant: "g hi ir 'k jr 'ih j.",
    endings: { a: "ir 'j hr 'j jr ih..", a2: "ir 'j hr hi 'h gr goh.", b: "ir 'j hr 'j jr i.",
      g: "ir 'j hr hi 'h gr g.", g2: "ir 'j hr hi 'h gr goh." } },
  '4': { clef: 'c4', flex: 'g', mediant: "h gh hr g h 'i hr h.",
    endings: { a: "hr g h i 'g hr h.", e: "hr g h ih gr 'gf e.", g: "hr 'h gr g." } },
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
/** Pitches of note groups relative to the last one: the shape of a termination. */
function shape(groups) {
  const ps = groups.map((g) => (g.replace(/([a-m])x\1/gi, '$1').match(/[a-m]/gi) || []).map((c) => PITCH.indexOf(c.toLowerCase())));
  const last = ps[ps.length - 1]?.[ps[ps.length - 1].length - 1] ?? 0;
  return ps.map((p) => p.map((x) => x - last).join(',')).join(' ');
}

/** The note groups the ending sings on "et in sǽcula sæculórum. Amen" (its last six: the E u o u a e). */
export function gloriaEnd(ctx) {
  const g = halfGabc('et in sǽcula sæculórum. Amen.', ctx, 'termination');
  return [...g.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]).filter((n) => /[a-m]/i.test(n)).slice(-6);
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
        if (shape(gloriaEnd({ tone, ending, shift: 0, clef: TONES[tone].clef })) === want) { found = { tone, ending }; break; }
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

// ------------------------------------------------------------------ jgabc's engine
let engine = null;
/** Node: hand over a context in which jgabc's scripts have run (see test/jgabc.mjs). */
export function setEngine(e) { engine = e; }
function jg() {
  const e = engine || globalThis;
  if (typeof e.applyPsalmTone !== 'function') throw new Error('jgabc engine not loaded (site/vendor/jgabc)');
  return e;
}
const cadenceCache = new Map();
/** jgabc's parsed tones for a context: mediant (with and without intonation) and termination. */
function cadences(ctx) {
  const key = `${ctx.tone}|${ctx.ending}|${ctx.shift}|${ctx.clef}`;
  if (!cadenceCache.has(key)) {
    const E = jg();
    const t = TONES[ctx.tone];
    const clef = ctx.clef || t.clef;
    const med = E.getGabcTones(shiftGabc(t.mediant, ctx.shift), undefined, false, clef);
    const ter = E.getGabcTones(shiftGabc(t.endings[ctx.ending], ctx.shift), undefined, false, clef);
    cadenceCache.set(key, { med, medPlain: E.removeIntonation(E.$.extend(true, {}, med)), ter, clef });
  }
  return cadenceCache.get(key);
}

function halfGabc(text, ctx, part, { intone = false, first = false, result } = {}) {
  const E = jg();
  const c = cadences(ctx);
  const mediant = part === 'mediant';
  return E.applyPsalmTone({
    text: text.trim(), gabc: mediant ? (intone ? c.med : c.medPlain) : c.ter, clef: c.clef,
    useOpenNotes: false, useBoldItalic: true, firstPrefix: true, onlyVowel: false,
    format: E.bi_formats.gabc, verseNumber: '', prefix: mediant, suffix: !mediant,
    italicizeIntonation: false, result: result || { shortened: false },
    favor: mediant ? (first ? 'intonation' : '') : 'termination',
  });
}

/** A verse ("… † … * …") as GABC, without clef. */
export function verseGabc(verse, ctx, { intone = false, first = false, result } = {}) {
  const line = jg().splitLine(verse);
  const m = halfGabc(line[0], ctx, 'mediant', { intone, first, result });
  return line.length === 1 ? `${m} (::)` : `${m} *(:) ${halfGabc(line[1], ctx, 'termination')} (::)`;
}

/**
 * A whole psalm (verses "… † … * …") as one GABC score: the intonation on the first verse
 * (kept for the next one when the first is too short to take it), on every verse of a
 * Gospel canticle.
 */
export function psalmGabc(verses, ctx, { canticle = false, firstIntoned = false } = {}) {
  let intone = !firstIntoned; // a later run of the same psalm: the intonation was sung
  const out = verses.map((v) => {
    const result = { shortened: false };
    const g = verseGabc(v, ctx, { intone: intone || canticle, first: intone, result });
    if (!result.shortened) intone = false;
    return g;
  });
  return `(${cadences(ctx).clef}) ${out.join(' ')}`;
}

/** A verse as text, the cadences' accented syllables bold and the preparatory ones italic. */
export function verseHtml(verse, ctx, i = 0) {
  const E = jg();
  const c = cadences(ctx);
  const line = E.splitLine(verse);
  const half = (t, tones, mediant) => E.addBoldItalic(t, tones.accents, tones.preparatory, tones.afterLastAccent, 'html', false, '', mediant, !mediant, i)
    .replace(/<span style='float:left[^>]*>.*?<\/span>/, '').replace(/<br\/?>\s*$/, '');
  const h = half(line[0], c.med, true) + (line.length > 1 ? ' <span class="star">*</span> ' + half(line[1], c.ter, false) : '');
  return h.replace(/†/g, '<span class="flex">†</span>');
}

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
