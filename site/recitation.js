// The collect, the short reading and the versicle of the little hours, sung on the common
// tones of the Antiphonale Monasticum 2005 (vol. I) and the Antiphonale Romanum II (2009):
//
// - collects: "De cantu orationum, tonus ferialis" (AM p. 536, AR II p. 759; GregoBase
//   20920), on do: the flexa falls to la after the last accent ("volun-tá-tem"), the
//   metrum takes the two syllables before the accent on si and la ("oc-cur-rén-tes"),
//   the punctum falls to fa after the accent ("cæ-lés-te"). It is the Liber Usualis'
//   "tonus simplex" with the final fall to fa. The conclusion has its own cadences (AR II
//   p. 760-761): "Fílium tú-um" falls to la on its last syllable, "Spíritus Sánc-ti" takes si
//   and la on its last two, "Deus," stays on do, and "sæculó-rum" ends on la, not fa (so
//   "Per Christum Dóminum nós-trum", "in sǽcula sæculó-rum"); Amen on do.
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
  // the full stop of the tone for the Chapter (Liber Usualis p. 123; jgabc's "Chapter"):
  // the last accent on la, sol after it, the end on sol-la ("Dóminus iustus nós-ter.")
  capitulum: "hr 'f er ef..",
  // the Liber Usualis' tones for the prayers (pp. 98-102): the flex drops the last syllable
  // a semitone ("per-cé-pi-mus", "Fí-li-um tú-um"); the full stop of the ancient simple tone
  // and of the second ferial tone a minor third ("et fác-tis")
  luFlex: "hr 'h hr g.",
  luFull: "hr 'h hr f.",
  // the Antiphonale Romanum II's conclusion of the collect: "Spíritus Sánc-ti," si-la
  sancti: "hr 'g fr f.",
};
// the bar after each kind of member
const BAR = { plain: ',', flexa: ';', metrum: ';', punctum: ':', interrogatio: ':', conclusio: '::', capitulum: ':', luFlex: ';', luFull: ':', sancti: '' };

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
    // `stop`: the end of a prayer's body on the reciting note, before its conclusion
    const bar = final ? '(::)' : m.stop ? '(:)' : m.bar !== undefined ? m.bar : kind === 'plain' ? (m.syl >= 6 ? '(,)' : '') : BAR[kind] ? `(${BAR[kind]})` : '';
    return `${point(m.text, kind, final || m.stop)} ${bar}`.trim();
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

/**
 * The conclusion on the Antiphonale Romanum II's cadences (pp. 760-761): "… Fílium tuum,"
 * to la on its last syllable, "… Spíritus Sancti," si-la without a bar, "Deus," on do with a
 * bar, and the end ("sæculórum.", "Dóminum nostrum.") to la on its last syllable.
 */
function arConclusion(text) {
  const parts = [];
  let rest = clean(text);
  const fil = /^(.*?Fílium tuum,)\s*(.*)$/.exec(rest);
  if (fil) { parts.push({ text: fil[1], kind: 'flexa' }); rest = fil[2]; }
  const sancti = /^(.*?Spíritus Sancti,)\s*(Deus,)\s*(.*)$/.exec(rest);
  if (sancti) {
    parts.push({ text: sancti[1], kind: 'sancti' }, { text: sancti[2], kind: 'plain', bar: '(,)' });
    rest = sancti[3];
  }
  parts.push({ text: rest, kind: 'flexa' });
  return parts.map((p) => ({ ...p, syl: syllables(p.text) }));
}

/** A collect (its conclusion included) as GABC with clef; `oremus` sets Orémus before it. */
export function collectGabc(text, { oremus = false, amen = true } = {}) {
  const m = CONCLUSION.exec(clean(text));
  const body = m ? clean(text).slice(0, m.index + m[0].length - m[1].length) : clean(text);
  const list = [...collectBody(body), ...(m ? arConclusion(m[1]) : [])];
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

/**
 * A collect on the Liber Usualis' tones for the prayers, as it assigns them in the Office
 * (p. 124): `festal` (p. 98: Sundays and feasts at Matins, Lauds and Vespers) has the metrum
 * first, at the colon, then the flex at the semicolon or the first comma after it, the body
 * ending on the reciting note, the conclusion with its flex at "Fílium tuum" and metrum at
 * "Spíritus Sancti, Deus"; `simple` (the ancient simple tone, p. 101, ad libitum for the
 * first ferial tone at the little hours, Compline and on ferias) has the flex in the first
 * part, the metrum at the principal division and the full stop a third down, Amen la-do;
 * `ferialB` (p. 99: after the antiphons of Our Lady) is recto tono with the full stop.
 */
export function luCollectGabc(text, { tone = 'festal', oremus = false, amen = true } = {}) {
  const t = clean(text);
  const m = CONCLUSION.exec(t);
  const body = m ? t.slice(0, m.index + m[0].length - m[1].length) : t;
  let list = collectBody(body);
  if (tone === 'festal' && list.length > 1) {
    // the metrum at the colon, else where collectBody put it; the flex after it
    for (const x of list) x.kind = undefined;
    let mi = list.findIndex((x, i) => x.punct === ':' && i < list.length - 1);
    if (mi < 0) mi = collectBody(body).findIndex((x) => x.kind === 'metrum');
    if (mi >= 0) {
      list[mi].kind = 'metrum';
      const after = list.slice(mi + 1, -1);
      const rest = (j) => list.slice(j + 1).reduce((a, x) => a + x.syl, 0);
      let fi = list.findIndex((x, i) => i > mi && i < list.length - 1 && x.punct === ';');
      if (fi < 0) fi = list.findIndex((x, i) => i > mi && i < list.length - 1 && x.syl >= 6 && rest(i) >= 6);
      if (fi >= 0 && after.length) list[fi].kind = 'luFlex';
    }
  } else if (tone === 'simple') {
    for (const x of list) if (x.kind === 'flexa') x.kind = 'luFlex';
  } else if (tone === 'ferialB') {
    for (const x of list) x.kind = undefined;
  }
  const end = tone === 'festal' ? 'plain' : 'luFull';
  if (list.length) list[list.length - 1].kind = list[list.length - 1].punct === '?' ? 'interrogatio' : end;
  if (m) {
    const conc = collectConclusion(m[1]).map((x) => ({ ...x, kind: x.kind === 'flexa' ? (tone === 'ferialB' ? undefined : 'luFlex') : x.kind === 'metrum' ? (tone === 'ferialB' ? undefined : 'metrum') : end }));
    list = [...list.map((x, i) => (i === list.length - 1 && x.kind === 'plain' ? { ...x, kind: 'plain', stop: true } : x)), ...conc];
  }
  const head = oremus ? `${point('Orémus.', 'plain', true)} (::) ` : '';
  const amenG = tone === 'festal' ? 'A(h.)men.(h.)' : 'A(f.)men.(h.)';
  return `(${CLEF}) ${head}${render(list)}${amen ? ` <sp>R/</sp> ${amenG} (::)` : ''}`;
}

/**
 * A short reading on the tone for the Chapter of the Liber Usualis (p. 123), sentence by
 * sentence: the metrum at the colon (else at the principal division), the flex before it
 * in a long sentence, the full stop at its end ("The flex is omitted if the sentence is very
 * short"); with several semicolons or colons, flex and metrum alternate, the metrum last;
 * a question takes the ordinary modulation.
 */
export function chapterGabc(text, { lesson = false } = {}) {
  const all = merge(members(text), 3);
  if (!all.length) return null;
  const sentences = [];
  let cur = [];
  for (const m of all) { cur.push(m); if (/[.!?]/.test(m.punct)) { sentences.push(cur); cur = []; } }
  if (cur.length) sentences.push(cur);
  const out = [];
  for (const list of sentences) {
    const last = list[list.length - 1];
    // the short lesson (Compline) ends its sentences as the lessons do (p. 123): a fifth down
    last.kind = last.punct === '?' ? 'interrogatio' : lesson ? 'punctum' : 'capitulum';
    if (list.length > 1) {
      const cums = []; let c = 0;
      for (const m of list) cums.push(c += m.syl);
      const total = c;
      // a long sentence with several strong divisions (; :) has flex and metrum alternately,
      // the metrum last ("In long sentences, the flex and the metrum may be repeated,
      // alternately", Liber Usualis p. 121)
      const strong = [];
      for (let i = 0; i < list.length - 1; i++) if (/[;:]/.test(list[i].punct)) strong.push(i);
      if (strong.length >= 2) {
        let kind = 'metrum', next = total;
        for (let k = strong.length - 1; k >= 0; k--) {
          const i = strong[k];
          if (next - cums[i] < 6 || cums[i] < 6) continue; // too close to the next division
          list[i].kind = kind;
          kind = kind === 'metrum' ? 'flexa' : 'metrum';
          next = cums[i];
        }
        out.push(...list);
        continue;
      }
      // the metrum: the last colon before the end, else the division nearest the middle
      let best = -1;
      for (let i = list.length - 2; i >= 0 && best < 0; i--) if (list[i].punct === ':') best = i;
      if (best < 0) {
        let score = Infinity;
        for (let i = 0; i < list.length - 1; i++) {
          const sc = Math.abs(cums[i] / total - 0.55) - (/[;:]/.test(list[i].punct) ? 0.12 : 0);
          if (sc < score) { score = sc; best = i; }
        }
      }
      if (total - cums[best] >= 4 || list[best].punct === ':') {
        list[best].kind = 'metrum';
        // the flex: the division nearest before the metrum that leaves a member on each side
        // ("confidénter, † et hoc est nomen quod vocábunt eum:")
        if (cums[best] >= 16) {
          for (let j = best - 1; j >= 0; j--) {
            if (cums[j] >= 6 && cums[best] - cums[j] >= 6) { list[j].kind = 'flexa'; break; }
          }
        }
      }
    }
    out.push(...list);
  }
  return `(${CLEF}) ${render(out)}`;
}

/** A versicle and its response (little hours) as GABC with clef. */
export function versicleGabc(v, r, { festive = false } = {}) {
  // on Sundays and feasts the Liber Usualis' first tone for versicles (p. 118): recto tono,
  // the last syllable with its neume si-do-si-la-sol, la-si-la, whatever its accent ("Dirigátur
  // Dómine orátio mé-a"), as Albert Bloomfield's gabc-chants (Vespers, after the LU) has it
  const one = (sign, t) => `<sp>${sign}/</sp> ${festive
    ? point(clean(t), 'plain', true).replace(/\([a-m]\.*\)\s*$/, "(g'_/hvGF'Efgf.)")
    : point(clean(t), 'flexa', true)} (::)`;
  return `(${CLEF}) ${one('V', v)}${r ? ' ' + one('R', r) : ''}`;
}
