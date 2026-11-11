// Names where the books print "N.": the Pope and the bishop in the intercessions (declined as
// the sentence wants them), the saint of the day in an antiphon of a common. A filled name is
// marked with NAME_OPEN … NAME_CLOSE, which the page turns into red text (a span; <c> in a
// score), as an unfilled "N." is too.

export const NAME_OPEN = '', NAME_CLOSE = '';
const mark = (s) => `${NAME_OPEN}${s}${NAME_CLOSE}`;

// Latin forms by case; English
const LEO = { nom: 'Leo', acc: 'Leónem', gen: 'Leónis', dat: 'Leóni', abl: 'Leóne', en: 'Leo' };
const FRANCIS = { nom: 'Francíscus', acc: 'Francíscum', gen: 'Francísci', dat: 'Francísco', abl: 'Francísco', en: 'Francis' };
const STEPHEN = { nom: 'Stéphanus', acc: 'Stéphanum', gen: 'Stéphani', dat: 'Stéphano', abl: 'Stéphano', en: 'Stephen' };

/** The Pope on a date (ISO): none during the vacancy of 2025. */
export function popeOn(date) {
  if (date >= '2025-05-08') return LEO; // Leo XIV, elected 8 May 2025
  if (date < '2025-04-21') return FRANCIS;
  return null;
}
/** The diocesan bishop, known for the Diocese of Hong Kong only (Cardinal Stephen Chow, since 4 December 2021). */
export function bishopOn(date, { hk = false } = {}) {
  return hk && date >= '2021-12-04' ? STEPHEN : null;
}

// the case a name takes from the noun before it ("Papam nostrum N.", "pro Papa nostro N.")
const E = '(?!\\p{L})'; // the word ends (JavaScript's \\b does not know æ)
const CASE_OF = [
  ['Pap(?:am)', 'acc'], ['Pap(?:æ|ae)\\s+nostri', 'gen'], ['Pap(?:æ|ae)', 'dat'], ['Papa\\s+noster', 'nom'], ['Papa', 'abl'],
  ['Ep[ií]scopum', 'acc'], ['Ep[ií]scopi', 'gen'], ['Ep[ií]scopo', 'dat'], ['Ep[ií]scopus', 'nom'],
  ['ant[ií]stitem', 'acc'], ['ant[ií]stitis', 'gen'], ['ant[ií]stiti', 'dat'], ['ant[ií]stite', 'abl'],
].map(([re, kase]) => [new RegExp(`(?<!\\p{L})${re}${E}`, 'giu'), kase]);

/**
 * A line of intercessions with its "N." filled: in Latin by the noun before it (Pope or bishop)
 * and declined; in English by "Pope N.", "N., our Pope", "our bishop N.", "N., our bishop".
 * Names not known stay "N.", marked all the same.
 */
export function fillPreces(line, { date, lang = 'la', hk = false } = {}) {
  const pope = popeOn(date), bishop = bishopOn(date, { hk });
  if (!/\bN\./.test(line)) return line;
  if (lang === 'en') {
    return line.replace(/\bN\.(,?\s*our\s+(Pope|bishop))?/g, (m, after, who, at) => {
      const before = line.slice(Math.max(0, at - 24), at);
      const isPope = who ? /Pope/i.test(who) : /Pope\s*$/i.test(before);
      const isBishop = who ? /bishop/i.test(who) : /bishop\s*$/i.test(before);
      const p = isPope ? pope : isBishop ? bishop : null;
      return `${mark(p ? p.en : 'N.')}${after || ''}`;
    });
  }
  if (lang !== 'la') return line;
  return line.replace(/\bN\./g, (m, at) => {
    const before = line.slice(Math.max(0, at - 40), at);
    // the nearest governing noun before the N.
    let best = null;
    for (const [re, kase] of CASE_OF) {
      const g = new RegExp(re.source, 'giu'); let x;
      while ((x = g.exec(before))) if (!best || x.index > best.index || (x.index === best.index && x[0].length > best.len)) best = { index: x.index, len: x[0].length, kase, pope: /pap/i.test(x[0]) };
    }
    const who = best ? (best.pope ? pope : bishop) : null;
    return mark(who ? who[best.kase] : 'N.');
  });
}

/**
 * An antiphon's score with its "N." (beáte N.) given the name its text has (the OCO prints each
 * saint's: "beáte Leo"): the name is found in `text` between the words that stand before and
 * after the N. in the score; without it the N. stays, in red.
 */
export function fillScoreName(body, text) {
  const seg = /([^()]*)\(([^)]*)\)/g;
  const parts = [];
  let m;
  while ((m = seg.exec(body))) parts.push({ start: m.index, lyric: m[1], len: m[1].length });
  const isN = (s) => /^\s*(?:\{?<i>N\.?<\/i>\}?|N)\.?(?=[\s,.;:]|$)/.test(s);
  const k = parts.findIndex((p) => isN(p.lyric));
  if (k < 0) return body;
  const plain = (s) => s.replace(/<[^>]*>|[{}]/g, '');
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/j/g, 'i');
  const words = (list) => plain(list.map((p) => p.lyric).join('')).split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const prev = words(parts.slice(0, k)).pop()?.replace(/[^\p{L}]/gu, '');
  const next = words(parts.slice(k + 1))[0]?.replace(/[^\p{L}]/gu, '');
  let name = null;
  if (text && prev) {
    // the text folded letter by letter, each folded letter knowing where it stands in the text
    let t = ''; const at = [];
    [...text].forEach((c, i, all) => { const f = fold(c); t += f; for (const _ of f) at.push(all.slice(0, i).join('').length); });
    at.push(text.length);
    const a = t.indexOf(fold(prev));
    if (a >= 0) {
      const from = at[a + fold(prev).length];
      const b = next ? t.indexOf(fold(next), a + fold(prev).length) : -1;
      const raw = text.slice(from, b >= 0 ? at[b] : undefined).trim().replace(/[\s,.;:!?]+$/, '');
      if (raw && !/^N\.?$/.test(raw) && raw.split(/\s+/).length <= 3) name = raw;
    }
  }
  const p = parts[k];
  const tail = p.lyric.replace(/^\s*(?:\{?<i>N\.?<\/i>\}?|N)\.?/, ''); // its punctuation
  const lead = /^\s*/.exec(p.lyric)[0];
  const filled = `${lead}<c>${name || 'N.'}</c>${name ? tail.replace(/^\.(?=[,;:])/, '') : tail}`;
  return body.slice(0, p.start) + filled + body.slice(p.start + p.len);
}

/** Text with marked names as HTML (after escaping): red spans. */
export const namesHtml = (html) => html.replace(//g, '<span class="name">').replace(//g, '</span>');
/** The same in GABC: Exsurge's rubric colour. */
export const namesGabc = (gabc) => gabc.replace(//g, '<c>').replace(//g, '</c>');
