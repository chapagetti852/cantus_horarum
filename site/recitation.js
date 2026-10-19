// The collect, the short reading and the versicle of the little hours, sung on the common
// tones of the Antiphonale Monasticum 2005 (vol. I) and the Antiphonale Romanum II (2009):
//
// - collects: "De cantu orationum, tonus ferialis" (AM p. 536, AR II p. 759; GregoBase
//   20920), on do: the flexa falls to la after the last accent ("volun-tá-tem"), the
//   metrum takes the two syllables before the accent on si and la ("oc-cur-rén-tes"),
//   the punctum falls to fa after the accent ("cæ-lés-te"). It is the Liber Usualis'
//   "tonus simplex" with the final fall to fa. The conclusion is sung likewise:
//   "Fílium tuum" flexa, "Spíritus Sancti, Deus" metrum, "sæculórum" punctum.
// - readings: "De cantu lectionum, tonus ferialis" (AM p. 529, AR II p. 756; GregoBase
//   20919), on do: flexa at a colon or semicolon, punctum (to fa) at a full stop, the
//   question falling to la with si before and after ("sen-sum Dó-mi-ni?"), and the
//   conclusion of the reading rising to re, with mi on its last accent but one and do
//   on its last ("et ma-nus é-ius sa-ná-bunt").
// - versicles at the little hours: "De cantu versus ad Horas minores" (AM p. 532;
//   GregoBase 20918), on do, falling to la after the last accent ("tar-dá-re").
//
// Each member is pointed by jgabc's own engine (the one that points the psalms), with the
// cadence written as a psalm-tone formula: 'x on the accent, xr an open note for any number
// of syllables, the notes before the accent its preparatory syllables.

const CLEF = 'c3';
const F = {
  plain: 'hr h.',
  flexa: "hr 'h fr f.",
  metrum: "hr g f 'h hr h.",
  punctum: "hr 'h dr d.",
  interrogatio: "hr g g 'f gr gh.",
  conclusio: "ir 'j ir 'h hr h.",
};
// the bar after each kind of member
const BAR = { plain: ',', flexa: ';', metrum: ';', punctum: ':', interrogatio: ':', conclusio: '::' };

const jg = () => {
  if (typeof globalThis.applyPsalmTone !== 'function') throw new Error('jgabc engine not loaded');
  return globalThis;
};
let engine = null;
/** Node: hand over a context in which jgabc's scripts have run (see test/jgabc.mjs). */
export function setRecitationEngine(e) { engine = e; }
const E = () => engine || jg();

const tones = new Map();
function point(text, kind, final) {
  const e = E();
  if (!tones.has(kind)) tones.set(kind, e.getGabcTones(F[kind], undefined, false, CLEF));
  const g = e.applyPsalmTone({
    text, gabc: tones.get(kind), clef: CLEF, useOpenNotes: false, useBoldItalic: false,
    firstPrefix: true, onlyVowel: false, format: e.bi_formats.gabc, verseNumber: '', prefix: false, suffix: true,
    italicizeIntonation: false, result: { shortened: false }, favor: 'termination',
  });
  return final ? g : g.replace(/\.\)\s*$/, ')'); // the mora only at the end
}

// Latin vowels (with the accented ones and the ligatures); qu, gu before a vowel and the
// diphthongs ae, au, oe count once: enough to weigh members against each other
const syllables = (s) => (s.toLowerCase().replace(/qu|gu(?=[aeiouáéíóú])/g, 'q').match(/ae|au|oe|[aeiouyáéíóúýæœǽ]/g) || []).length;

/** Text to members ending at a punctuation mark: [{ text, punct, syl }]. */
function members(text) {
  const out = [];
  for (const m of clean(text).matchAll(/[^,;:.!?]+[,;:.!?]*/g)) {
    const t = m[0].trim();
    if (!t) continue;
    const punct = (/([,;:.!?])[^,;:.!?]*$/.exec(t) || [])[1] || '';
    out.push({ text: t, punct, syl: syllables(t) });
  }
  return out;
}
/** Characters GABC cannot carry in its lyrics. */
const clean = (s) => s.replace(/[()[\]{}]/g, '').replace(/[«»“”‘’"]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Join short members to a neighbour, so cadences have room: one that opens a clause ("ut,",
 * "qui,") goes with what follows, one that closes it ("Deus,", "quǽsumus,") with what precedes.
 */
const OPENS = /^(ut|et|sed|ac|atque|qui|quæ|quod|quia|nam|ita|sic|ergo|igitur|vero|enim|autem|tamen|unde|cum)\b/i;
function merge(list, min = 4) {
  const out = [];
  let carry = null;
  for (const m0 of list) {
    const m = carry ? { ...m0, text: `${carry.text} ${m0.text}`, syl: carry.syl + m0.syl } : { ...m0 };
    carry = null;
    const last = out[out.length - 1];
    if (m.syl < min && OPENS.test(m.text) && m !== list[list.length - 1]) { carry = m; continue; }
    if (last && m.syl < min) { last.text += ' ' + m.text; last.syl += m.syl; last.punct = m.punct; } else out.push(m);
  }
  if (carry) out.push(carry);
  return out;
}

function render(list) {
  return list.map((m, i) => {
    const final = i === list.length - 1;
    const kind = m.kind || 'plain';
    const bar = final ? '(::)' : kind === 'plain' ? (m.syl >= 6 ? '(,)' : '') : `(${BAR[kind]})`;
    return `${point(m.text, kind, final)} ${bar}`.trim();
  }).join(' ');
}

// where a collect's conclusion begins
const CONCLUSION = /(?:^|[,;:.]\s+)((?:Per (?:Dóminum|Christum|eúndem)|Qui (?:vivis|vivit|tecum|cum Patre|cum Deo|regnas|regnat))\b[\s\S]*)$/;

/** The body of a collect: metrum at the principal division, flexa in a long first part, punctum at the end. */
function collectBody(text) {
  const list = merge(members(text));
  if (!list.length) return [];
  const last = list[list.length - 1];
  last.kind = last.punct === '?' ? 'interrogatio' : 'punctum';
  if (list.length > 1) {
    const total = list.reduce((a, m) => a + m.syl, 0);
    let cum = 0, best = -1, bestScore = Infinity;
    const cums = list.map((m) => (cum += m.syl));
    for (let i = 0; i < list.length - 1; i++) {
      const strong = /[;:.!?]/.test(list[i].punct) ? 0.12 : 0;
      const score = Math.abs(cums[i] / total - 0.55) - strong;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    list[best].kind = 'metrum';
    if (cums[best] >= 20 && best >= 1) {
      let f = -1, fScore = Infinity;
      for (let j = 0; j < best; j++) {
        if (cums[j] < 6) continue;
        const s = Math.abs(cums[j] - cums[best] / 2);
        if (s < fScore) { fScore = s; f = j; }
      }
      if (f >= 0) list[f].kind = 'flexa';
    }
  }
  return list;
}

/** The conclusion: "… Fílium tuum," flexa, "… Deus," metrum, "per ómnia sǽcula sæculórum." punctum. */
function collectConclusion(text) {
  const t = clean(text);
  const parts = [];
  let rest = t;
  const fil = /^(.*?Fílium tuum,)\s*(.*)$/.exec(rest);
  if (fil) { parts.push({ text: fil[1], kind: 'flexa' }); rest = fil[2]; }
  const deus = /^(.*?\bDeus,)\s*(per [\s\S]*)$/.exec(rest);
  if (deus) { parts.push({ text: deus[1], kind: 'metrum' }); rest = deus[2]; }
  parts.push({ text: rest, kind: 'punctum' });
  return parts.map((p) => ({ ...p, syl: syllables(p.text) }));
}

/** A collect (its conclusion included) as GABC with clef; `oremus` sets Orémus before it. */
export function collectGabc(text, { oremus = false, amen = true } = {}) {
  const m = CONCLUSION.exec(clean(text));
  const body = m ? clean(text).slice(0, m.index + m[0].length - m[1].length) : clean(text);
  const list = [...collectBody(body), ...(m ? collectConclusion(m[1]) : [])];
  const head = oremus ? `${point('Orémus.', 'flexa', true)} (::) ` : '';
  return `(${CLEF}) ${head}${render(list)}${amen ? ' <sp>R/</sp> A(h)men.(h.) (::)' : ''}`;
}

/** A short reading as GABC with clef. */
export function readingGabc(text) {
  const list = merge(members(text), 3);
  if (!list.length) return null;
  for (const m of list) m.kind = m.punct === '?' ? 'interrogatio' : /[;:]/.test(m.punct) ? 'flexa' : /[.!]/.test(m.punct) ? 'punctum' : undefined;
  const last = list[list.length - 1];
  if (last.punct !== '?') {
    // the conclusion rises to re for its last words (about seven syllables): the rest of the
    // member stays on do
    const words = last.text.split(' ');
    let k = words.length, syl = 0;
    while (k > 0 && (syl < 7 || words.length - k < 2)) syl += syllables(words[--k]);
    if (k > 0 && syllables(words.slice(0, k).join(' ')) >= 3) {
      list.splice(list.length - 1, 1, { text: words.slice(0, k).join(' '), kind: undefined, syl: 0, join: true }, { text: words.slice(k).join(' '), kind: 'conclusio', syl });
    } else last.kind = 'conclusio';
  }
  return `(${CLEF}) ${render(list.map((m) => (m.join ? { ...m, syl: 0 } : m)))}`;
}

/** A versicle and its response (little hours) as GABC with clef. */
export function versicleGabc(v, r) {
  const one = (sign, t) => `<sp>${sign}/</sp> ${point(clean(t), 'flexa', true)} (::)`;
  return `(${CLEF}) ${one('V', v)}${r ? ' ' + one('R', r) : ''}`;
}
