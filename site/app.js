// Cantus Horarum — compose and display one hour of the Liturgia Horarum in chant.
import { loadGabc, renderChant, splitGabc, watchResize, setPerLine } from './chant.js';
import { FORMATS, printColumn, printPages } from './print.js';
import { toneContext, versesOf, psalmGabc, verseGabc, verseHtml, startAtCross } from './psalmtone.js';
import { resolveHour, indexOco, celebrationFor, isSanctoral } from './resolve.js';
import { collectGabc, readingGabc, versicleGabc } from './recitation.js';
import { loadTranslation, hourTranslation, trNode, psalmNumber, chapterVerse, alignPsalm, verseTrHtml, trP, precesParts, hymnKey, hymnCorresponds } from './translate.js';

const HOURS = ['lectio', 'laudes', 'tertia', 'sexta', 'nona', 'vesperae', 'completorium'];
const HOUR_NAMES = { lectio: 'Officium lectionis', laudes: 'Laudes matutinæ', tertia: 'Tertia', sexta: 'Sexta', nona: 'Nona', vesperae: 'Vesperæ', completorium: 'Completorium' };
const DAY_NAMES = ['Dominica', 'Feria II', 'Feria III', 'Feria IV', 'Feria V', 'Feria VI', 'Sabbato'];
const ROMAN = ['I', 'II', 'III', 'IV'];
const TEXT_HOUR = { lectio: 'lectio', laudes: 'laudes', tertia: 'media', sexta: 'media', nona: 'media', vesperae: 'vesperae', completorium: 'completorium' };
const DEUS_IN_ADIUTORIUM = { ferial: 4121, festive: 18178, solemn: 7864 };
const DOMINE_LABIA = { ferial: 18107, festive: 18108 };
const PATER_NOSTER = { ferial: 4321, festive: 15303 }; // Antiphonale Monasticum 2005, pp. 533-534
// Conclusions: Antiphonale Monasticum 2005 p. 546 (little hours), Antiphonale Romanum II pp. 761-765
const BENEDICAMUS_HORAE = { ferial: 17847, festive: 17848 };
// Dominus vobiscum … Benedicat vos: AR II p. 761; at solemnities the solemn tone (GR 1974 p. 817 B)
const DOMINUS_VOBISCUM = { simple: 4322, solemn: 7463 };
// Benedicamus Domino at Lauds and Vespers, by rank and hour: Antiphonale Monasticum 2005
// pp. 541-546 (its "in Festis ad Laudes" is not on GregoBase: feasts sing the Vespers one at
// both hours), and the Antiphonale Romanum II's for the feasts and octave of Christmas (p. 764)
const BENEDICAMUS = {
  major: { vesperae1: 20680, laudes: 20681, vesperae: 20682 },
  solemnity: { laudes: 20683, vesperae: 19868 },
  christmas: 16665,
  feast: 19187,
  sunday: 19188,
  ferial: { laudes: 20715, vesperae: 19189 },
};
// the "sollemnitates maiores": the Lord's great days (the octave of Easter sings Easter's)
const MAIOR = /^(nativity_of_the_lord|epiphany_of_the_lord|easter_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)|ascension_of_the_lord|pentecost_sunday)$/;
// Responsories of the Office of Readings that GregoBase has from the Liber Hymnarius (1983) and
// the Antiphonale Monasticum 2005: the first words of the response and of the verse
// (lower case, unaccented) that iBreviary's text must begin with
const RESPONSORIA = [
  [16139, 'hodie nobis caelorum', 'gloria in'], [16360, 'hodie nobis de', 'hodie illuxit'],
  [16205, 'comedetis carnes et', 'non moyses'], [16108, 'ecce apparebit dominus', ''],
  [16135, 'nihil inquinatum in', 'est enim'], [19647, 'hodie in iordane', 'caeli aperti'],
  [20401, 'iudaea et ierusalem', 'constantes estote'], [20438, 'illuminare illuminare ierusalem', 'et ambulabunt'],
  [20687, 'duo seraphim clamabant', 'tres sunt'],
];
const plainWords = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/j/g, 'i').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
function responsoryScore(r, v) {
  const R = plainWords(r), V = plainWords(v);
  return RESPONSORIA.find(([, a, b]) => R.startsWith(a) && (!b || V.startsWith(b)))?.[0] || null;
}
// Psalm 94 (95) in the Liber Hymnarius (1983) tones, by the mode of the invitatory antiphon
const INVITATORY_TONES = { '2': 8218, '3': 10397, '4': 15508, '4*': 7669, '4**': 16356, '5': 10248, '6': 9664, '6*': 10035, '6**': 15059, '7': 9834, D: 9707, E: 9642 };

const state = {
  date: null, hour: null,
  calendar: {}, oco: null, ocoIndex: null, slots: [], psalterium: null, days: {},
  settings: JSON.parse(localStorage.getItem('settings') || '{}'),
};
const layouts = [];
const $ = (s) => document.querySelector(s);

// ------------------------------------------------------------------ utilities
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
async function json(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }

/** The texts of a date's hour: its own iBreviary texts when fetched, else the psalter's. */
async function textsFor(day, date, hour) {
  if (!(date in state.days)) state.days[date] = await json(`data/days/${date}.json`).catch(() => null);
  const own = state.days[date];
  return own?.hours[TEXT_HOUR[hour]] || state.psalterium[`${day.psalter}-${day.dow}`]?.hours[TEXT_HOUR[hour]];
}
const hasOwnTexts = (date) => !!state.days[date];

async function calendarFor(date) {
  const y = date.slice(0, 4);
  if (!state.calendar[y]) state.calendar[y] = await json(`data/calendar/${y}.json`).catch(() => ({}));
  return state.calendar[y][date] || [];
}

// ------------------------------------------------------------------ resolution
/** Which psalter week / day / hour label the OCO uses for this date and hour. */
function psalterSlot(day, date, hour) {
  let week = day.psalter, dow = day.dow, label;
  switch (hour) {
    case 'lectio': label = 'Off. lect.'; break;
    case 'laudes': label = 'Laudes'; break;
    case 'tertia': case 'sexta': case 'nona': label = 'Hor. med.'; break;
    case 'vesperae':
      if (dow === 6) { // Saturday evening: I Vespers of the following Sunday
        week = week % 4 + 1; dow = 0; label = 'I Vesp.';
      } else label = dow === 0 ? 'II Vesp.' : 'Vesp.';
      break;
    case 'completorium': label = 'Compl.'; break;
  }
  return { week, dow, label, dayName: DAY_NAMES[dow], chapter: `HEBDOMADA ${ROMAN[week - 1]}` };
}

function ocoPsalter(slot) {
  return state.oco.filter((e) => e.part === 'PSALTERIUM' && e.chapter === slot.chapter && e.day === slot.dayName && e.hour === slot.label)
    .map((e) => followReference(e) || e);
}
/** "Ut in hebd. I." points to the same place of the same day in another psalter week. */
function followReference(e) {
  const m = e.kind === 'reference' && /hebd\.\s*([IV]+)/i.exec(e.title || '');
  if (!m) return null;
  return state.oco.find((x) => x.part === 'PSALTERIUM' && x.chapter === `HEBDOMADA ${m[1]}` && x.day === e.day
    && x.hour === e.hour && x.position === e.position && x.kind !== 'reference') || null;
}
/** On a memorial in Ordinary Time, from the short reading on: the weekday unless the common is chosen. */
const memoriaDeFeria = (cel) => cel?.rank === 'MEMORIAL' && isSanctoral(cel) && cel.seasons?.includes('ORDINARY_TIME') && state.settings.memoria !== 'commune';
function ocoCompline(day, hour) {
  // Compline follows a one-week cycle; Sunday has one form after I Vespers (used on
  // Saturday evening) and one after II Vespers. The hymn, the responsory and the Nunc
  // dimittis antiphon are printed once, under the Sunday form.
  const pool = state.oco.filter((e) => e.part === 'PSALTERIUM' && e.chapter === 'AD COMPLETORIUM');
  const sunday = pool.filter((e) => e.day === 'In Dominica et sollemnitatibus');
  const hymn = sunday.filter((e) => e.kind === 'hymn');
  const nunc = sunday.filter((e) => e.position === 'Nunc' && e.kind !== 'reference');
  let own;
  if (day.dow === 6) own = sunday.filter((e) => e.hour === 'Post I Vesp.' && e.kind !== 'hymn');
  else if (day.dow === 0) own = sunday.filter((e) => e.hour === 'Post II Vesp.' && e.kind !== 'hymn');
  else own = pool.filter((e) => e.day === DAY_NAMES[day.dow]);
  own = own.filter((e) => !(e.position === 'Nunc' && e.kind === 'reference'));
  // so is the responsory In manus tuas (with its Eastertide form)
  const rb = own.some((e) => /^In manus tuas/.test(e.text || '')) ? [] : sunday.filter((e) => /^In manus tuas/.test(e.text || ''));
  return [...hymn, ...own.filter((e) => e.position !== 'Nunc'), ...rb, ...nunc];
}

function byPosition(entries, pos) {
  return entries.find((e) => (e.position || '').split(' ')[0] === pos && e.kind !== 'hymn' && e.kind !== 'reference')
    || entries.find((e) => (e.position || '').split(' ')[0] === pos);
}

/**
 * The chants proper to a date and hour (season, feast, saint), by place:
 * {H, 1, 2, 3, B, M, R, I, Nunc}. Vespers before a Sunday or solemnity are its I Vespers.
 */
async function propersFor(day, date, hour) {
  const tomorrow = (await calendarFor(addDays(date, 1)))[0];
  const { cel, hour: h, first } = celebrationFor(day, tomorrow, hour);
  const meta = { _cel: cel, _first: first, _big: cel.rank === 'SOLEMNITY' || cel.rank === 'FEAST' };
  try {
    return { ...resolveHour(state.slots, state.ocoIndex, cel, first ? addDays(date, 1) : date, h, { memoriaCommune: state.settings.memoria === 'commune' }).out, ...meta };
  } catch (e) { console.error(e); return meta; }
}
const RANK_NAMES = { SOLEMNITY: 'Sollemnitas', FEAST: 'Festum', MEMORIAL: 'Memoria', OPTIONAL_MEMORIAL: 'Memoria ad libitum', SUNDAY: 'Dominica', WEEKDAY: 'Feria' };
const SEASON_NAMES = { ADVENT: 'Adventus', CHRISTMAS_TIME: 'Nativitatis', LENT: 'Quadragesimæ', HOLY_WEEK: 'Hebdomadæ sanctæ', PASCHAL_TRIDUUM: 'Tridui paschalis', EASTER_TIME: 'Paschæ', ORDINARY_TIME: 'per annum' };
const HOUR_HEADINGS = { lectio: 'Ad Officium lectionis', laudes: 'Ad Laudes matutinas', tertia: 'Ad Tertiam', sexta: 'Ad Sextam', nona: 'Ad Nonam', vesperae: 'Ad Vesperas', vesperae1: 'Ad I Vesperas', completorium: 'Ad Completorium' };
const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
/**
 * The head of an hour, as Breviarium Gregorianum sets it: the rank in red, the
 * celebration, the season's day ("Tempora"), then the hour.
 */
function hourTitle(hour, slot, propers) {
  const cel = propers._cel || {};
  const node = el('<header class="title-block"></header>');
  const season = (cel.seasons || []).map((x) => SEASON_NAMES[x]).find(Boolean);
  const tempora = cel.week != null && season ? `${DAY_NAMES[cel.dow]} hebdomadæ ${ROMAN_NUM(cel.week)} ${season === 'per annum' ? 'per annum' : season}` : '';
  node.innerHTML = `<p class="rank">${esc(RANK_NAMES[cel.rank] || '')}</p>
    <h1>${esc(capitalize(cel.name || ''))}</h1>
    <p class="tempora">${esc([isSanctoral(cel) && tempora && `Tempora: ${tempora}`, `hebd. ${ROMAN[slot.week - 1]} psalterii`].filter(Boolean).join(' · '))}</p>`;
  const frag = document.createDocumentFragment();
  frag.append(node, el(`<h2 class="hour">${HOUR_HEADINGS[propers._first ? 'vesperae1' : hour]}</h2>`));
  return frag;
}
const ROMAN_NUM = (n) => { const r = [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]]; let s = ''; for (const [k, v] of r) while (n >= v) { s += k; n -= v; } return s || '0'; };
const PLACE = { R: 'R br.' };
/** The psalter's entries with the proper ones put in their places. */
function withPropers(entries, propers) {
  const places = Object.keys(propers).filter((k) => k !== 'I' && k[0] !== '_');
  // on feasts the psalter's cross-references ("ut in hebd. I") do not apply
  if (propers._big) entries = entries.filter((e) => e.kind !== 'reference');
  const replaced = (e) => (e.kind === 'hymn' && propers.H) || places.some((k) => k !== 'H' && (e.position || '').split(' ')[0] === (PLACE[k] || k).split(' ')[0]);
  const own = places.map((k) => ({ ...propers[k], position: k === 'H' ? 'H' : PLACE[k] || k }));
  return [...own.filter((e) => e.kind === 'hymn').map(withScore), ...entries.filter((e) => !replaced(e)), ...own.filter((e) => e.kind !== 'hymn')];
}

/** Group a PSALMODIA section into [{antiphon, psalms:[...], repeat}] */
function psalmGroups(section) {
  const groups = [];
  let cur = null;
  for (const b of section?.blocks || []) {
    // an antiphon opens a group, or repeats the open one after its psalm (Compline's are not numbered)
    if (b.kind === 'antiphon' && (b.n || !cur || (cur.items.length && cur.repeat !== undefined) || !cur.items.length)) {
      cur = { n: b.n || groups.length + 1, antiphon: b.text, items: [] }; groups.push(cur);
    } else if (b.kind === 'antiphon' && cur) { cur.repeat = b.text; }
    else if (cur) cur.items.push(b);
  }
  return groups;
}
const section = (hourTexts, title) => hourTexts?.find((s) => s.title === title);

// ------------------------------------------------------------------ rendering
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

function markLine(line) {
  // colour the flex and mediant signs; keep the text otherwise as iBreviary prints it
  return esc(line).replace(/†/g, '<span class="flex">†</span>').replace(/\*/g, '<span class="star">*</span>');
}
function renderPsalmBlock(b) {
  const out = [];
  if (b.ref || b.title) out.push(`<div class="psalm-head">${b.ref ? `<span class="ref">${esc(b.ref)}</span>` : ''}${b.part ? `<span class="ref">${esc(b.part)}</span>` : ''}${b.title ? `<span class="title">${esc(b.title)}</span>` : ''}</div>`);
  if (b.sentence) out.push(`<p class="sentence">${esc(b.sentence)}</p>`);
  for (const s of b.strophes) out.push(`<div class="strophe">${s.map((l) => `<div class="line">${markLine(l)}</div>`).join('')}</div>`);
  return out.join('');
}
function renderTextBlock(b) {
  if (b.kind === 'text') return `<div class="text">${b.lines.map((l) => typeof l === 'string' ? `<p>${esc(l)}</p>` : `<p><i>${esc(l.text)}</i></p>`).join('')}</div>`;
  if (b.kind === 'rubric') return `<p class="rubric">${esc(b.text)}</p>`;
  if (b.kind === 'versicle') return `<p class="versicle"><span class="r">${esc(b.sign)}.</span> ${esc(b.text)}${b.r ? `<br><span class="r">℟.</span> ${esc(b.r)}` : ''}</p>`;
  if (b.kind === 'antiphon') return `<p class="ant-text"><span class="r">Ant.</span> ${esc(b.text)}</p>`;
  if (b.kind === 'psalm') return renderPsalmBlock(b);
  return '';
}
function renderBlocks(blocks) { return (blocks || []).map(renderTextBlock).join(''); }

/** Tone for the psalms after an antiphon: the OCO mode, checked against the score's E u o u a e. */
async function toneFor(entry) {
  const src = entry?.gabc ? await loadGabc(entry.gabc) : null;
  return toneContext(entry?.mode, src);
}

/**
 * A psalm (or canticle) pointed to its tone: by default the whole psalm as one score;
 * with the "text" option the first verse in notes with the intonation and the rest as
 * text, cadence accents in bold and preparatory syllables in italic. Gospel canticles
 * take the intonation on every verse.
 */
function pointedPsalmNode(b, ctx, { canticle = false, solemn = false, segments = null, tr = null, fromCross = false } = {}) {
  const node = el('<div class="psalm"></div>');
  const head = renderPsalmBlock({ ...b, strophes: [] });
  node.insertAdjacentHTML('beforeend', head);
  const h = node.querySelector('.psalm-head');
  const toneLabel = `<span class="tone">Tonus ${esc(ctx.tone)}${ctx.ending ? ' ' + esc(ctx.ending) : ''}</span>`;
  // Gospel canticles: the antiphon above already shows the mode
  if (!canticle) { if (h) h.insertAdjacentHTML('beforeend', toneLabel); else node.insertAdjacentHTML('afterbegin', `<div class="psalm-head">${toneLabel}</div>`); }
  // the verses as jgabc takes them (the build groups them, from the Nova Vulgata where it can),
  // in runs, with whatever stands between them (a refrain, a rubric) kept in its place
  segments ||= [{ strophes: versesOfBlock(b) }];
  // its translation, verse by verse where the verses pair (site/translate.js), else after it;
  // paired with the whole psalm, the translations keeping the verses the antiphon quotes
  const lang = state.tr?.lang;
  const al = tr?.lines?.length ? alignPsalm(segments.filter((x) => !x.html).flatMap((x) => x.strophes), tr.lines, lang) : null;
  // after an antiphon ending in † the psalm begins at the verse marked † (startAtCross);
  // elsewhere that mark is dropped
  const cut = fromCross ? startAtCross(segments) : null;
  const skip = cut?.skip || 0;
  segments = (cut?.segments || segments).map((x) => (x.html ? x
    : { strophes: x.strophes.map((st) => st.map((v) => v.replace(/^\s*†\s*/, '').replace(/\*\s*†\s*/, '* '))) }));
  const under = (i) => (al?.mode === 'verse' ? (al.under[i - 1 + skip] || []).map(verseTrHtml).join(' ') : '');
  let n = 0;
  let first = true;
  for (const seg of segments) {
    if (seg.html) { node.insertAdjacentHTML('beforeend', seg.html); continue; }
    const verses = seg.strophes.flat();
    if (!verses.length) continue;
    if (state.settings.psalms !== 'text') {
      // Plenus: the run as one score, verses numbered
      const body = psalmGabc(verses, ctx, { canticle, solemn, firstIntoned: !first }).replace(/^\([^)]*\)\s*/, '');
      const from = n + 1;
      const numbered = body.split(/(?<=\(::\))\s*/).filter(Boolean).map((v) => `${++n}. ${v}`).join(' ');
      const sc = el('<div class="score psalm-score"></div>');
      node.append(sc);
      layouts.push(renderChant(sc, `(${ctx.clef}) ${numbered}`, { dropCap: false }));
      // as Breviarium Gregorianum: the run's translation in one paragraph, its verses numbered
      if (al?.mode === 'verse') {
        const html = [];
        for (let i = from; i <= n; i++) if (under(i)) html.push(`<b>${i}.</b> ${under(i)}`);
        if (html.length) node.append(trP(lang, html.join(' ')));
      }
    } else {
      // Compactus: the psalm's first verse in notes with the intonation, the others numbered,
      // cadence accents bold and preparatory syllables italic (as jgabc and Breviarium Gregorianum)
      let k = 0;
      if (first) {
        const sc = el('<div class="score verse-score"></div>');
        node.append(sc);
        layouts.push(renderChant(sc, `(${ctx.clef}) ${++n}. ${verseGabc(verses[0], ctx, { intone: true, first: true, solemn })}`, { dropCap: false }));
        if (under(n)) node.append(trP(lang, under(n)));
        k = 1;
      }
      const ol = el(`<ol class="verses" start="${n + 1}"></ol>`);
      let i = 0;
      seg.strophes.forEach((st) => st.forEach((v, j) => {
        if (i++ < k) return;
        const li = el(`<li${j === 0 ? ' class="strophe-start"' : ''}></li>`);
        li.innerHTML = canticle ? verseHtml(v, ctx, 0) : verseHtml(v, ctx, n);
        ol.append(li);
        n++;
        if (under(n)) li.append(trP(lang, under(n)));
      }));
      if (ol.children.length) node.append(ol);
    }
    first = false;
  }
  if (al?.mode === 'block') { const t = trNode(lang, al.lines); if (t) node.append(t); }
  return node;
}
/** A block's verses: grouped by the build, else from its printed lines. */
function versesOfBlock(b) {
  if (b.verses) return b.verses;
  const strophes = b.strophes || [b.lines.filter((l) => typeof l === 'string')];
  return strophes.map((st) => versesOf(st).map((v) => v.map((l) => l.text.trim()).join(' ').replace(/\s*\*\s*/, ' * ').replace(/\s*†\s*/, ' † ')));
}
const hasVerses = (b) => (b.kind === 'psalm' && b.strophes?.length) || (b.kind === 'text' && b.lines?.some((l) => typeof l === 'string' && /\*\s*$/.test(l)));

/** Blocks of a psalmody group or canticle, pointed when the tone is known. */
function psalmodyNode(blocks, ctx, opts = {}) {
  const node = el('<div class="block"></div>');
  blocks = (blocks || []).filter((b) => !isNavigation(b));
  if (!ctx) { node.insertAdjacentHTML('beforeend', renderBlocks(blocks)); return node; }
  // a psalm: its heading block, then (iBreviary gives some psalms in pieces: Ps 109, the
  // canticle of Ap 19 with its alleluias) every block of verses up to the next heading,
  // with refrains, rubrics and versicles between them kept in place
  let psalm = null;
  // `trFor(head)`: the translation of each psalm, asked in order (appendPsalmody)
  // `fromCross`: the antiphon ends in †, its first psalm begins at the verse marked † (pointedPsalmNode)
  const { trFor, fromCross, ...rest } = opts;
  let cross = fromCross;
  const flush = () => {
    if (psalm) node.append(pointedPsalmNode(psalm.head, ctx, { ...rest, segments: psalm.segs, tr: trFor?.(psalm.head), fromCross: cross }));
    if (psalm) cross = false;
    psalm = null;
  };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const headed = b.kind === 'psalm' && (b.ref || b.title || b.part);
    if (headed && psalm && !psalm.segs.length && b.kind === 'psalm' && !b.ref && psalm.head.ref) {
      // a psalm's heading, then its first part with the verses (Ps 26 I): one psalm
      psalm.head = { ...psalm.head, part: b.part, sentence: b.sentence || psalm.head.sentence };
      if (hasVerses(b)) psalm.segs.push({ strophes: versesOfBlock(b) });
      continue;
    }
    if (headed || (!psalm && hasVerses(b))) {
      flush();
      psalm = { head: b.kind === 'psalm' ? b : { kind: 'psalm', strophes: [] }, segs: [] };
      if (hasVerses(b)) psalm.segs.push({ strophes: versesOfBlock(b) });
    } else if (psalm && hasVerses(b)) {
      psalm.segs.push({ strophes: versesOfBlock(b) });
    } else if (psalm && blocks.slice(i + 1).some(hasVerses) && !blocks.slice(i + 1, blocks.slice(i + 1).findIndex(hasVerses) + i + 1).some((x) => x.kind === 'psalm' && (x.ref || x.title))) {
      psalm.segs.push({ html: renderTextBlock(b) }); // between two runs of the same psalm
    } else {
      flush();
      node.insertAdjacentHTML('beforeend', renderTextBlock(b));
    }
  }
  flush();
  return node;
}
/** iBreviary's links to other parts of the book ("Commune Pastorum", "Psalmodia …"). */
const isNavigation = (b) => b.kind === 'text' && b.lines.length === 1 && typeof b.lines[0] === 'string'
  && /^(Commune|Proprium|Psalmodia|Psalterium|Ordinarium)\b/.test(b.lines[0]) && b.lines[0].length < 60;

/** Canticle verses in iBreviary come as consecutive text blocks; join them into one psalm. */
function canticleBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    const isVerses = b.kind === 'text' && b.lines.some((l) => typeof l === 'string' && /\*\s*$/.test(l));
    const last = out[out.length - 1];
    if (isVerses && last?.kind === 'psalm' && last.canticle) {
      last.strophes.push(b.lines.filter((l) => typeof l === 'string'));
      if (last.verses && b.verses) last.verses.push(...b.verses); else delete last.verses;
    } else if (isVerses) out.push({ kind: 'psalm', canticle: true, strophes: [b.lines.filter((l) => typeof l === 'string')], verses: b.verses && [...b.verses] });
    else out.push(b);
  }
  return out;
}

/**
 * A score, without label (the annotation above the initial gives the mode). Without a
 * score, `fallbackText` is shown after `fallbackLabel`.
 */
async function chantNode(gabcId, { annotation = null, fallbackText = null, fallbackLabel = 'Ant.', transform = null } = {}) {
  const wrap = el('<div class="chant"><div class="score"></div></div>');
  const score = wrap.querySelector('.score');
  const src = gabcId ? await loadGabc(gabcId) : null;
  if (!src) {
    score.innerHTML = fallbackText ? `<p class="ant-text">${fallbackLabel ? `<span class="r">${esc(fallbackLabel)}</span> ` : ''}${esc(fallbackText)}</p>` : '<p class="missing">Notatio deest.</p>';
    return wrap;
  }
  const { header, body: raw } = splitGabc(src);
  const ann = annotation ?? header.annotation ?? (header.mode ? `${header.mode}${header['mode-modifier'] || ''}` : null);
  const body = transform ? transform(withoutEuouae(raw)) : withoutEuouae(raw);
  layouts.push(renderChant(score, body, { annotation: ann }));
  wrap.dataset.notated = '1';
  return wrap;
}
/** An antiphon's "E u o u a e" is left out: the psalm's first verse is notated anyway. */
const withoutEuouae = (body) => body.replace(/\s*(?:<[^>]+>)*E(?:<\/[^>]+>)*\([^)]*\)\s*u\([^)]*\)\s*o\([^)]*\)\s*u\([^)]*\)\s*a\([^)]*\)\s*e\.?\([^)]*\)\s*(\(::\))?/g, '');

/** Mark an antiphon and its psalm or canticle as one key group: the player sings them at one pitch. */
let keySeq = 0;
function keyed(...nodes) {
  const k = String(++keySeq);
  for (const n of nodes) n.dataset.key = k;
  return nodes;
}

/** An antiphon: its score, or its text when there is none. */
const antiphonNode = (ant, fallbackText) => chantNode(ant?.gabc, { fallbackText: (ant?.text || fallbackText)?.replace(/\s*†\s*$/, '') });

function hymnTextNode(hourTexts) {
  const h = section(hourTexts, 'HYMNUS');
  return h ? hymnBlocksNode(h.blocks) : null;
}
function hymnBlocksNode(blocks) {
  const node = el('<div class="hymn"></div>');
  for (const b of blocks) {
    if (b.kind === 'rubric' && /^Vel/.test(b.text)) break; // an alternative hymn follows
    if (b.kind !== 'text' || /^Psalmodia/.test(b.lines[0])) continue; // iBreviary's navigation links
    node.insertAdjacentHTML('beforeend', b.lines.map((l) => typeof l === 'string' ? esc(l) : `<i>${esc(l.text)}</i>`).join('<br>') + '<p></p>');
  }
  return node.childElementCount ? node : null;
}
/** The blocks of a HYMNUS section after the rubric matching `start`, up to the next rubric (or "Vel:"). */
function hymnPart(hourTexts, start) {
  const blocks = section(hourTexts, 'HYMNUS')?.blocks || [];
  const i = blocks.findIndex((b) => b.kind === 'rubric' && start.test(b.text));
  if (i < 0) return [];
  const j = blocks.findIndex((b, k) => k > i && b.kind === 'rubric');
  return blocks.slice(i + 1, j < 0 ? undefined : j);
}

/** An OCO hymn with a score: entries without one borrow the score of the same hymn elsewhere. */
function withScore(h) {
  if (!h || h.gabc) return h;
  const incipit = h.title.split(' (')[0];
  const same = (e) => e.kind === 'hymn' && e.gabc && e.title.startsWith(incipit);
  // the psalter's own setting first (seasons may sing the same text to another melody)
  const found = state.oco.find((e) => e.part === h.part && same(e)) || state.oco.find(same);
  return { ...h, gabc: found?.gabc };
}

const isFestive = (day) => day.rank === 'SUNDAY' || day.rank === 'SOLEMNITY' || day.rank === 'FEAST';
/**
 * The Deus in adiutorium scores carry both endings: "… sæculórum. Amen. Allelúia." and,
 * after "In Quadr.", the Lenten "… sæculórum. Amen." Keep the one of the season.
 */
function openingForSeason(body, cel) {
  const lent = cel.seasons?.some((x) => x === 'LENT' || x === 'HOLY_WEEK');
  const m = /<i>In Quadr\.<\/i>\s*†\(\)\s*([\s\S]*?)\(::\)\s*$/.exec(body);
  let main = m ? body.slice(0, m.index) : body;
  main = main.replace(/\(::z-\)\s*$/, '(::)');
  if (lent && m) main = main.replace(/†\s*sæ[\s\S]*$/, `${m[1].trim()} (::)`);
  return main.replace(/†\s*/, '');
}
/** Deus, in adiutorium: solemn tone at Lauds and Vespers of solemnities, festive on Sundays and feasts, else ferial. */
function openingTone(cel, hour) {
  if (cel.rank === 'SOLEMNITY' && (hour === 'laudes' || hour === 'vesperae')) return DEUS_IN_ADIUTORIUM.solemn;
  return isFestive(cel) ? DEUS_IN_ADIUTORIUM.festive : DEUS_IN_ADIUTORIUM.ferial;
}

/** The opening of an hour: Deus, in adiutorium, or the invitatory when it is said before this hour. */
async function appendOpening(main, day, hour, propers = {}) {
  const cel = propers._cel || day; // I Vespers belong to the morrow's celebration
  if (state.settings.invitatory === hour && await appendInvitatory(main, cel, propers.I)) return;
  main.append(await chantNode(openingTone(cel, hour), { annotation: '', transform: (b) => openingForSeason(b, cel) }));
}

/** The invitatory antiphon of the day: the psalter's follows a one-week cycle (printed under week I). */
function invitatoryAntiphon(day) {
  const dayName = DAY_NAMES[day.dow];
  return state.oco.find((e) => e.kind === 'invitatorium' && e.part === 'PSALTERIUM' && e.chapter === 'HEBDOMADA I' && e.day === dayName);
}

/**
 * Domine, labia mea aperies; the antiphon; Psalm 94 (95) strophe by strophe in the tone
 * that matches the antiphon's mode, the antiphon repeated after each strophe.
 */
async function appendInvitatory(main, day, proper = null) {
  const ant = proper || invitatoryAntiphon(day);
  if (!ant) return false;
  main.append(el('<h2 class="section">Invitatorium</h2>'));
  main.append(await chantNode(isFestive(day) ? DOMINE_LABIA.festive : DOMINE_LABIA.ferial, { annotation: '' }));
  const antText = (ant.text || ant.title).replace(/([.!?])\s.*$/, '$1'); // the OCO text runs on into "Veníte, …"
  const [first] = keyed(await chantNode(ant.gabc, { fallbackText: antText }));
  const antiphon = async () => { const n = await chantNode(ant.gabc, { fallbackText: antText }); n.dataset.key = first.dataset.key; return n; };
  main.append(first);
  const toneId = INVITATORY_TONES[ant.mode];
  const src = toneId ? await loadGabc(toneId) : null;
  if (!src) { main.append(el('<p class="rubric">Psalmus 94 (95): notatio deest.</p>')); return true; }
  const { body } = splitGabc(src);
  const clef = /^\s*(\([cf]b?[1-4]\))/.exec(body)?.[1] || '(c4)';
  const strophes = body.replace(/^\s*\([cf]b?[1-4]\)/, '').split(/\(::Z?\)/).map((x) => x.trim()).filter((x) => /[a-z]\(/i.test(x));
  main.append(el(`<div class="psalm-head"><span class="ref">Psalmus 94 (95)</span><span class="tone">Tonus ${esc(ant.mode)}</span></div>`));
  for (const st of strophes) {
    const sc = el('<div class="score verse-score"></div>');
    sc.dataset.key = first.dataset.key;
    main.append(sc);
    layouts.push(renderChant(sc, `${clef} ${st} (::)`, { dropCap: false }));
    main.append(await antiphon());
  }
  return true;
}

/**
 * The hymn as one score with all its strophes. When the score holds only the first
 * strophe, the others follow as text.
 */
async function appendHymn(main, hymn, textNode, alternatives = []) {
  // the Latin hymn: its incipit (the OCO's title, else the text's first line) and strophes
  const firstLine = textNode?.innerHTML.split(/<br\s*\/?>/)[0].replace(/<[^>]*>/g, '') || '';
  const key = hymnKey(hymn?.title?.replace(/\s*\(.*$/, '') || firstLine);
  const latinStrophes = textNode ? textNode.querySelectorAll(':scope > p').length : 0;
  await appendHymnOnly(main, hymn, textNode, alternatives);
  if ((hymn || textNode) && state.tr) {
    const node = hymnTrNode(key, latinStrophes);
    if (node) main.append(node);
  }
}
/**
 * The hymn's translation after it, as Breviarium Gregorianum: one paragraph, its strophes
 * numbered when they are as many as the Latin's. Only the translated office's hymn that is
 * this hymn's translation (data/hymns/match.json); in English, else the app's own.
 */
function hymnTrNode(key, latinStrophes) {
  const T = state.tr;
  const h = T.t.hymn;
  const lines = Array.isArray(h) ? h : h?.[state.hour];
  let strophes = null;
  if (lines?.length && hymnCorresponds(state.hymns?.match, key, T.lang, lines[0])) {
    strophes = lines.reduce((a, l) => { if (l === '') a.push([]); else a[a.length - 1].push(l); return a; }, [[]]).filter((x) => x.length);
  } else if (T.lang === 'en' && state.hymns?.en?.[key]) strophes = state.hymns.en[key];
  if (!strophes) return null;
  const join = (ls) => ls.map(esc).join(T.lang === 'zh' ? '' : ' ');
  const numbered = strophes.length > 1 && strophes.length === latinStrophes;
  if (numbered) return trP(T.lang, strophes.map((st, i) => `<b>${i + 1}.</b> ${join(st)}`).join(' '));
  const div = el('<div class="tr"></div>');
  div.lang = T.lang === 'zh' ? 'zh-Hant-HK' : T.lang;
  div.innerHTML = strophes.map((st) => `<p>${join(st)}</p>`).join('');
  return div;
}
async function appendHymnOnly(main, hymn, textNode, alternatives = []) {
  if (!hymn && !textNode) return;
  main.append(el('<h2 class="section">Hymnus</h2>'));
  const src = hymn?.gabc ? await loadGabc(hymn.gabc) : null;
  if (hymn) main.append(await chantNode(hymn.gabc, { fallbackText: src ? null : hymn.title, fallbackLabel: '' }));
  if (alternatives.length) main.append(el(`<p class="rubric">Vel: ${alternatives.map((x) => esc(x.title)).join('; ')}</p>`));
  if (!textNode) return;
  const body = src ? splitGabc(src).body : '';
  const complete = /\s2\.?\s*[(A-ZÆŒ]/.test(body) || (body.match(/\(::\)/g) || []).length > 1;
  if (!src) main.append(textNode);
  else if (!complete && textNode.children.length > 2) {
    // drop the first strophe (and its spacer), sung above
    textNode.firstChild?.remove();
    while (textNode.firstChild && textNode.firstChild.nodeName !== 'P') textNode.firstChild.remove();
    textNode.firstChild?.remove();
    main.append(textNode);
  }
}

const words = (t) => t.normalize('NFD').toLowerCase().replace(/[^a-z\s]/g, '').replace(/j/g, 'i').replace(/v/g, 'u').split(/\s+/).filter((w) => w.length > 2);
/** The OCO's antiphon says what iBreviary's says (most of its words), perhaps in another order. */
const sameWords = (sung, printed) => { const w = words(sung), p = new Set(words(printed)); return w.filter((x) => p.has(x)).length >= w.length * 0.6; };

/** Antiphons 1-3 from the OCO, each with its psalms pointed to its tone; returns what followed the last psalm. */
async function appendPsalmody(main, entries, psalmodySection, { single = null } = {}) {
  main.append(el('<h2 class="section">Psalmodia</h2>'));
  state.trAt = 0; state.trPrev = null;
  let groups = psalmGroups(psalmodySection);
  if (single) { // one proper antiphon for all the psalms (little hours in the seasons and on feasts)
    groups = groups.length ? [{ n: 1, antiphon: single.text, items: groups.flatMap((g) => g.items) }] : [];
    entries = [{ ...single, position: '1' }];
  }
  // a versicle after the last antiphon (Office of Readings) comes after its repetition
  const last = groups[groups.length - 1];
  const after = [];
  while (last?.items.length && last.items[last.items.length - 1].kind === 'versicle') after.unshift(last.items.pop());
  for (let n = 1; n <= Math.max(3, groups.length); n++) {
    const ant = byPosition(entries, String(n));
    const g = groups.find((x) => x.n === n);
    if (!ant && !g) continue;
    const before = await antiphonNode(ant, g?.antiphon);
    main.append(before);
    const used = [];
    const trFor = (head) => { const t = nextTrPsalm(head); used.push(t); return t; };
    // iBreviary's antiphon ends in † when it quotes the psalm's opening; the OCO's may put
    // the same words otherwise ("Illuminátio mea et salus mea Dóminus"), or be another antiphon
    const fromCross = /†\s*$/.test(g?.antiphon || '') && (!ant?.text || sameWords(ant.text, g.antiphon));
    if (g) main.append(...keyed(before, psalmodyNode(g.items, await toneFor(ant), { trFor, fromCross }), await antiphonNode(ant, g.repeat || g.antiphon)));
    if (used[0]?.ant) before.after(trP(state.tr.lang, esc(used[0].ant)));
  }
  // the versicle before the readings (Office of Readings), sung
  for (const v of after) main.append(versicleNode(v));
  if (after.length) appendTr(main, state.tr?.t.versicle, { proper: false });
}

/** iBreviary prints the repetendum of a responsory after two spaces; mark it with a star. */
function responsoryBlocks(blocks) {
  return blocks.map((b) => (b.kind === 'versicle' ? { ...b, text: b.text.replace(/\s{2,}/, ' * '), r: b.r?.replace(/\s{2,}/, ' * ') } : b));
}

async function composeLectio(main, day, date) {
  const slot = psalterSlot(day, date, 'lectio');
  const propers = await propersFor(day, date, 'lectio');
  const entries = withPropers(ocoPsalter(slot), propers);
  const texts = await textsFor(day, date, 'lectio');
  const ownDate = hasOwnTexts(date) || state.psalterium[`${day.psalter}-${day.dow}`]?.date === date;
  if (!entries.length && !texts) { main.append(el('<p class="empty">Hæc hora nondum parata est.</p>')); return; }
  main.append(hourTitle('lectio', slot, propers));
  await appendOpening(main, day, 'lectio', propers);

  // two hymns: one for the night or early morning, one for the day (a proper hymn serves both)
  const hymns = propers.H ? entries.filter((e) => e.kind === 'hymn').slice(0, 1) : entries.filter((e) => e.kind === 'hymn').map(withScore);
  const night = new Date().getHours() < 7;
  const [hymn, other] = night || hymns.length < 2 ? hymns : [hymns[1], hymns[0]];
  const part = hymnBlocksNode(hymnPart(texts, night ? /^I\./ : /^II\./)) || hymnTextNode(texts);
  await appendHymn(main, hymn, part);
  if (other) main.append(el(`<p class="rubric">${night ? 'Diurno tempore' : 'Noctu vel summo mane'}: ${esc(other.title)}</p>`));

  await appendPsalmody(main, entries, section(texts, 'PSALMODIA'));

  // the readings and their responsories are proper to the date
  main.append(el('<h2 class="section">Lectiones</h2>'));
  const lect = ownDate ? section(texts, 'LECTIONES') : null;
  if (!lect) {
    main.append(el('<p class="rubric">Lectiones cum responsoriis huius diei nondum paratæ sunt.</p>'));
  } else {
    const out = [];
    for (const b of lect.blocks) {
      if (b.kind === 'rubric' && /^LECTIO/.test(b.text)) out.push({ kind: 'heading', text: b.text });
      else out.push(b);
    }
    let node = el('<div class="block lectiones text"></div>');
    main.append(node);
    const blocks = responsoryBlocks(out);
    // each reading's translation under it, its responsory's after the responsory
    const trL = state.tr?.same ? state.tr.t.lectiones || [] : [];
    let at = -1, respTr = null;
    const putTr = (lines) => { const t = lines?.length ? trNode(state.tr.lang, lines) : null; if (t) main.append(t); return !!t; };
    const flushResp = () => { if (respTr) { putTr(respTr); node = el('<div class="block lectiones text"></div>'); main.append(node); respTr = null; } };
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind === 'heading') { flushResp(); at++; node.insertAdjacentHTML('beforeend', `<h3 class="sub">${esc(b.text[0] + b.text.slice(1).toLowerCase())}</h3>`); }
      else if (b.kind === 'rubric' && b.text === 'RESPONSORIUM') {
        const l = trL[at];
        if (l && putTr([...(l.title ? [l.title] : []), ...l.lines])) { node = el('<div class="block lectiones text"></div>'); main.append(node); }
        respTr = l?.responsory?.length ? l.responsory : null;
        node.insertAdjacentHTML('beforeend', '<p class="rubric">Responsorium</p>');
        // a responsory with a score: the score in place of the text
        const k = blocks.findIndex((x, j) => j > i && x.kind === 'versicle' && x.sign === '℟');
        const r = blocks[k], v = blocks[k + 1];
        const id = r && blocks.slice(i + 1, k).every((x) => x.kind !== 'heading') ? responsoryScore(r.text, v?.sign === '℣' ? v.text : '') : null;
        if (id) {
          for (const x of blocks.slice(i + 1, k)) node.insertAdjacentHTML('beforeend', renderTextBlock(x)); // its reference
          main.append(await chantNode(id, { annotation: undefined }));
          node = el('<div class="block lectiones text"></div>');
          main.append(node);
          i = v?.sign === '℣' ? k + 1 : k;
        }
      } else node.insertAdjacentHTML('beforeend', renderTextBlock(b));
    }
    flushResp();
  }
  if (day.dow === 0) main.append(el('<p class="rubric">Hymnus Te Deum.</p>'));
  const or = section(texts, 'ORATIO');
  if (or) { main.append(el('<h2 class="section">Oratio</h2>')); main.append(await conclusionNode(or.blocks, propers._cel || day, 'lectio', { tr: state.tr?.same ? state.tr.t.oratio : null })); }
}

const MEDIA = { tertia: { label: 'Tertia', title: 'AD TERTIAM' }, sexta: { label: 'Sexta', title: 'AD SEXTAM' }, nona: { label: 'Nona', title: 'AD NONAM' } };

async function composeMedia(main, day, date, hour) {
  const { label, title } = MEDIA[hour];
  const slot = psalterSlot(day, date, hour);
  const texts = await textsFor(day, date, hour);
  const inDay = (week, dayName) => state.oco.filter((e) => e.part === 'PSALTERIUM' && e.chapter === week && e.day === dayName);
  const today = inDay(slot.chapter, slot.dayName);
  // the antiphons serve whichever of the three hours is said; the OCO prints them under "Hor. med." (or None)
  const entries = today.filter((e) => ['Tertia', 'Sexta', 'Nona', 'Hor. med.'].includes(e.hour) && /^[123]$/.test(e.position || ''));
  const hymnOf = (list) => list.find((e) => e.hour === label && e.kind === 'hymn');
  const propers = await propersFor(day, date, hour);
  const hymn = withScore(propers.H || hymnOf(today) || hymnOf(inDay(slot.chapter, 'Feria II')) || hymnOf(inDay('HEBDOMADA I', 'Feria II')));
  if (!entries.length && !texts) { main.append(el('<p class="empty">Hæc hora nondum parata est.</p>')); return; }

  main.append(hourTitle(hour, slot, propers));
  await appendOpening(main, day, hour, propers);
  await appendHymn(main, hymn, hymnBlocksNode(hymnPart(texts, new RegExp(`^${title}$`))) || (propers.H ? hymnTextNode(texts) : null));
  await appendPsalmody(main, entries, section(texts, 'PSALMODIA'), { single: propers['1'] || null });

  // the hour's own part: the short reading with its versicle, then the collect
  const own = section(texts, title);
  if (own) {
    const at = (t) => own.blocks.findIndex((b) => b.kind === 'rubric' && b.text === t);
    const lbAt = at('LECTIO BREVIS'), orAt = at('ORATIO');
    const first = [lbAt, orAt].filter((k) => k >= 0);
    for (const b of own.blocks.slice(0, first.length ? Math.min(...first) : undefined)) main.insertAdjacentHTML('beforeend', renderTextBlock(b));
    if (lbAt >= 0) {
      main.append(el('<h2 class="section">Lectio brevis</h2>'));
      const part = own.blocks.slice(lbAt + 1, orAt > lbAt ? orAt : undefined);
      main.append(readingNode(part.filter((b) => b.kind !== 'versicle')));
      appendTr(main, state.tr?.own.reading?.lines);
      for (const v of part.filter((b) => b.kind === 'versicle')) main.append(versicleNode(v));
      appendTr(main, state.tr?.own.versicle);
    }
    if (orAt >= 0) {
      main.append(el('<h2 class="section">Oratio</h2>'));
      main.append(await conclusionNode(own.blocks.slice(orAt + 1), propers._cel || day, hour, { tr: state.tr?.same ? state.tr.own.oratio : null }));
    }
  }
}

async function composeLaudesVesperae(main, day, date, hour) {
  const slot = psalterSlot(day, date, hour);
  const propers = await propersFor(day, date, hour);
  const entries = withPropers(ocoPsalter(slot), propers);
  // Saturday Vespers texts are stored under the Saturday itself (iBreviary gives I Vespers there)
  const texts = await textsFor(day, date, hour);
  if (!entries.length && !texts) { main.append(el('<p class="empty">Hæc hora nondum parata est.</p>')); return; }

  main.append(hourTitle(hour, slot, propers));
  await appendOpening(main, day, hour, propers);
  const hymns = entries.filter((e) => e.kind === 'hymn');
  await appendHymn(main, hymns[0], hymns.length ? hymnTextNode(texts) : null, hymns.slice(1));
  await appendPsalmody(main, entries, section(texts, 'PSALMODIA'));

  // on memorials the weekday's short reading, responsory and intercessions, unless the common is chosen
  const feria = memoriaDeFeria(propers._cel) ? state.psalterium[`${day.psalter}-${day.dow}`]?.hours[TEXT_HOUR[hour]] : null;
  const part = (title) => (feria && section(feria, title)) || section(texts, title);

  // Short reading, responsory
  const lb = part('LECTIO BREVIS');
  if (lb) { main.append(el('<h2 class="section">Lectio brevis</h2>')); main.append(readingNode(lb.blocks)); appendTr(main, state.tr?.own.reading?.lines); }
  // the short responsory is one piece of music: its score, or else the text
  const rb = entries.find((e) => e.kind !== 'reference' && (e.kind === 'resp_brevis' || /br\./.test(e.position || '')));
  const rbText = part('RESPONSORIUM BREVE');
  if (rb || rbText) {
    main.append(el('<h2 class="section">Responsorium breve</h2>'));
    const node = rb?.gabc ? await chantNode(rb.gabc, { annotation: '' }) : null;
    if (node?.dataset.notated) main.append(node);
    else if (rbText) main.append(el(`<div class="block">${renderBlocks(rbText.blocks)}</div>`));
    appendTr(main, state.tr?.own.responsory);
  }

  // Gospel canticle
  const cant = byPosition(entries, hour === 'laudes' ? 'B' : 'M');
  const ce = section(texts, 'CANTICUM EVANGELICUM');
  main.append(el(`<h2 class="section">${hour === 'laudes' ? 'Benedictus' : 'Magnificat'}</h2>`));
  await appendGospelCanticle(main, cant, ce, { solemn: true });

  // Intercessions, Pater noster (sung), collect, conclusion
  const cel = propers._cel || day;
  const preces = part('PRECES');
  if (preces) { main.append(el('<h2 class="section">Preces</h2>')); main.append(precesNode(preces.blocks, state.tr?.same ? state.tr.own.preces : null)); }
  if (section(texts, 'PATER NOSTER')) {
    main.append(el('<h2 class="section">Pater noster</h2>'));
    main.append(await chantNode(isFestive(cel) ? PATER_NOSTER.festive : PATER_NOSTER.ferial, { annotation: '' }));
  }
  const or = section(texts, 'ORATIO');
  if (or) { main.append(el('<h2 class="section">Oratio</h2>')); main.append(await conclusionNode(or.blocks, cel, hour, { first: propers._first, tr: state.tr?.same ? state.tr.own.oratio : null })); }
}

/**
 * A Gospel canticle between its antiphons, the antiphon's translation under the first (when
 * the translated office is the same; Compline's always is) and the canticle's verse by verse.
 */
async function appendGospelCanticle(main, ant, ce, { solemn = false, proper = true } = {}) {
  const ceAnt = ce?.blocks.find((b) => b.kind === 'antiphon')?.text;
  const g = state.tr?.own.gospel;
  const first = await antiphonNode(ant, ceAnt);
  const trAnt = g?.ant && (!proper || state.tr.same) ? [trP(state.tr.lang, esc(g.ant))] : [];
  const canticle = ce ? [psalmodyNode(canticleBlocks(ce.blocks.filter((b) => b.kind !== 'antiphon' && b.kind !== 'rubric')), await toneFor(ant),
    { canticle: true, solemn, trFor: () => (g?.lines?.length ? { lines: g.lines } : null) })] : [];
  main.append(...keyed(first, ...canticle, await antiphonNode(ant, ceAnt)));
  first.after(...trAnt);
}

/**
 * Intercessions: the introduction with its response, then each intention as one line,
 * its two halves joined by a red dash.
 */
function precesNode(blocks, trLines = null) {
  const node = el('<div class="block preces"></div>');
  const html = (b) => b.lines.map((l) => (typeof l === 'string' ? esc(l) : `<i>${esc(l.text)}</i>`)).join(' ');
  // the translation under each intention when they are as many, else after them all
  const T = trLines?.length ? precesParts(trLines) : null;
  const latinPairs = blocks.filter((b, k) => b.kind === 'text' && blocks[k + 1]?.kind === 'rubric' && blocks[k + 1].text === '—').length;
  const each = T && T.pairs.length === latinPairs;
  const lang = state.tr?.lang;
  let i = 0, intro = false;
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    if (b.kind === 'text' && blocks[k + 1]?.kind === 'rubric' && blocks[k + 1].text === '—' && blocks[k + 2]?.kind === 'text') {
      node.insertAdjacentHTML('beforeend', `<p class="intention">${html(b)}<br><span class="r">—</span> ${html(blocks[k + 2])}</p>`);
      if (each) { const [a, z] = T.pairs[i]; node.append(trP(lang, `${esc(a)}<br><span class="r">—</span> ${esc(z)}`, 'intention-tr')); }
      i++;
      k += 2;
    } else if (b.kind === 'text') {
      node.insertAdjacentHTML('beforeend', `<p class="intro">${html(b)}</p>`);
      if (each && !intro && T.intro.length) { node.append(trP(lang, T.intro.map((l) => esc(l).replace(/^(領|眾)[：:]\s*/, '')).join('<br>'))); intro = true; }
    } else node.insertAdjacentHTML('beforeend', renderTextBlock(b));
  }
  if (T && !each) { const t = trNode(lang, trLines); if (t) node.append(t); }
  return node;
}

/**
 * The collect and the conclusion of an hour. Lauds and Vespers: with a priest or deacon
 * presiding (an option), Dominus vobiscum and the blessing; otherwise Dominus nos
 * benedicat; then Benedicamus Domino of the day's rank (Antiphonale Romanum II). The
 * little hours and the Office of Readings end with Benedicamus Domino (AM 2005).
 */
async function conclusionNode(blocks, cel, hour, { first = false, tr = null } = {}) {
  const node = el('<div class="block"></div>');
  const textOf = (b) => (b?.kind === 'text' ? b.lines.map((l) => (typeof l === 'string' ? l : l.text)).join(' ') : '');
  const major = hour === 'laudes' || hour === 'vesperae';
  // the collect and its Amen; iBreviary's rubrics and formulas of the conclusion are replaced
  const end = blocks.findIndex((b, k) => k > 0 && (b.kind === 'rubric' || /^(Dóminus vobíscum|Dóminus nos|Benedicámus Dómino)/.test(textOf(b))));
  node.append(collectNode(end < 0 ? blocks : blocks.slice(0, end)));
  // the collect's translation under it, before the blessing (Breviarium Gregorianum)
  if (tr?.length && state.tr) { const t = trNode(state.tr.lang, tr); if (t) node.append(t); }
  if (!major) {
    if (blocks.some((b) => /^Benedicámus Dómino/.test(textOf(b)))) node.append(await chantNode(isFestive(cel) ? BENEDICAMUS_HORAE.festive : BENEDICAMUS_HORAE.ferial, { annotation: '' }));
    return node;
  }
  const solemn = ['major', 'solemnity'].includes(rankOf(cel));
  if (state.settings.presider) node.append(await chantNode(solemn ? DOMINUS_VOBISCUM.solemn : DOMINUS_VOBISCUM.simple, { annotation: '' }));
  else node.append(chantFromGabc(dominusNosBenedicat(cel)));
  node.append(await chantNode(benedicamusFor(cel, first && hour === 'vesperae' ? 'vesperae1' : hour), { annotation: '' }));
  return node;
}
/**
 * Dominus nos benedicat has no score in the books. It is pointed here on the tones the
 * books give for the blessing and the collect, by rank, each cadence placed by the accents:
 * - solemnities: the solemn blessing tone (Graduale Romanum 1974 p. 817, tone B): the
 *   first member falls on its last syllable, the second rises to the upper note on its
 *   last accent, the third bends after the accent of perdúcat and closes on ætérnam;
 * - Sundays and feasts: the blessing of the Antiphonale Romanum II p. 761 (Benedicat vos):
 *   the two syllables before the last accent of the first members dip a third and a fourth
 *   below the reciting note ("om-ní-po-tens Dé-us"), the last falls after its accent;
 * - other days: the ferial tone of the collect (AR II p. 759): the first member falls after
 *   its accent, the second has the metrum ("oc-cur-rén-tes"), the last falls to d.
 */
const DOMINUS_NOS_BENEDICAT = {
  solemn: "(c4) DO(g)mi(h)nus(h) nos(h) be(h)ne(h)dí(h)cat,(g.) (;) et(g) ab(h) om(h)ni(h) ma(h)lo(h) de(h)fén(i)dat,(h_') (,) et(h) ad(h) vi(h)tam(h) per(h)dú(h)cat(g) æ(h)tér(hg)nam.(g.) (::) <sp>R/</sp> A(g)men.(gh..) (::)",
  festive: '(c3) DO(h)mi(h)nus(h) nos(h) be(g)ne(f)dí(h)cat,(h) (;) et(h) ab(h) om(h)ni(h) ma(h)lo(g) de(f)fén(h)dat,(h) (,) et(h) ad(h) vi(h)tam(h) per(h)dú(h)cat(h) æ(h)tér(h)nam.(f) (::) <sp>R/</sp> A(h)men.(h) (::)',
  ferial: '(c3) DO(h)mi(h)nus(h) nos(h) be(h)ne(h)dí(h)cat,(f) (;) et(h) ab(h) om(h)ni(h) ma(h)lo(g) de(f)fén(h)dat,(h) (;) et(h) ad(h) vi(h)tam(h) per(h)dú(h)cat(h) æ(h)tér(h)nam.(d) (::) <sp>R/</sp> A(h)men.(h) (::)',
};
function dominusNosBenedicat(cel) {
  const r = rankOf(cel);
  if (r === 'major' || r === 'solemnity') return DOMINUS_NOS_BENEDICAT.solemn;
  return r === 'ferial' ? DOMINUS_NOS_BENEDICAT.ferial : DOMINUS_NOS_BENEDICAT.festive;
}
function chantFromGabc(body, { dropCap = true } = {}) {
  const wrap = el('<div class="chant"><div class="score"></div></div>');
  layouts.push(renderChant(wrap.firstChild, body, { annotation: dropCap ? '' : null, dropCap }));
  wrap.dataset.notated = '1';
  return wrap;
}

// The versicles are sung on the common tones of the AM 2005 / AR II (site/recitation.js).
// Short readings and collects can be sung the same way (SING_READINGS); for now they stand
// as text.
const SING_READINGS = false;
const blockText = (b) => (b?.kind === 'text' ? b.lines.map((l) => (typeof l === 'string' ? l : l.text)).join(' ') : '');
const recited = () => state.settings.recite !== 'text';
/** A short reading: its reference, then the reading on the lesson tone. */
function readingNode(blocks) {
  const node = el('<div class="block"></div>');
  const text = blocks.filter((b) => b.kind === 'text').map(blockText).join(' ').trim();
  const gabc = SING_READINGS && recited() && text ? readingGabc(text) : null;
  if (!gabc) { node.insertAdjacentHTML('beforeend', renderBlocks(blocks)); return node; }
  node.insertAdjacentHTML('beforeend', renderBlocks(blocks.filter((b) => b.kind !== 'text')));
  node.append(chantFromGabc(gabc, { dropCap: false }));
  return node;
}
/** A collect, with Orémus before it and Amen after when iBreviary gives them, on the collect tone. */
function collectNode(blocks) {
  const node = el('<div class="block"></div>');
  const texts = blocks.filter((b) => b.kind === 'text');
  const oremus = /^Orémus\.?$/.test(blockText(texts[0]).trim());
  const text = texts.slice(oremus ? 1 : 0).map(blockText).join(' ').trim();
  if (!SING_READINGS || !recited() || !text) { node.insertAdjacentHTML('beforeend', renderBlocks(blocks)); return node; }
  const amen = blocks.some((b) => b.kind === 'versicle' && /^Amen/.test(b.text));
  node.insertAdjacentHTML('beforeend', renderBlocks(blocks.filter((b) => b.kind === 'rubric')));
  node.append(chantFromGabc(collectGabc(text, { oremus, amen }), { dropCap: false }));
  return node;
}
// ------------------------------------------------------------------ translations
/** Append a translation (site/translate.js) when one is chosen; `proper`: only when it is the same office. */
function appendTr(main, lines, { proper = true, head = null, fold = false } = {}) {
  const T = state.tr;
  if (!T || (proper && !T.same)) return;
  const node = trNode(T.lang, lines, { head, fold });
  if (node) main.append(node);
}
/**
 * The translation of the hour's next psalm (heading block `head`): the translated hour's
 * psalm at the same place, if it is the same psalm (by its number; a canticle by its chapter
 * and verse; a part of a psalm when the psalm before it was taken), else the one with its number.
 */
function nextTrPsalm(head) {
  const T = state.tr;
  const list = T?.t.psalms;
  if (!list?.length) return null;
  const at = state.trAt++;
  const num = (x) => psalmNumber(x?.ref, T.lang);
  const want = head.ref ? psalmNumber(head.ref, 'la') : null;
  const same = (x) => {
    if (!x) return false;
    if (!head.ref) return state.trPrev !== null && !num(x); // a part: "II", "貳"
    if (want === 'c' || num(x) === 'c') {
      const a = chapterVerse(head.ref), b = chapterVerse(x.ref);
      return want === num(x) && (!a || !b || a === b);
    }
    return want !== null && want === num(x);
  };
  let p = same(list[at]) ? list[at] : null;
  if (!p && head.ref && want !== 'c' && want !== null) p = list.find((x) => num(x) === want) || null;
  if (head.ref) state.trPrev = p;
  return p;
}
/** The Latin reference of the hour's reading: the short reading, or the first reading of the Office of Readings. */
function latinReadingRef(texts, hour) {
  const rubricAfter = (blocks, at) => blocks?.slice(at + 1).find((b) => b.kind === 'rubric')?.text;
  if (hour === 'lectio') { // both readings' references
    const lect = section(texts, 'LECTIONES');
    return (lect?.blocks || []).filter((b) => b.kind === 'rubric' && /\d/.test(b.text)).map((b) => b.text);
  }
  if (MEDIA[hour]) {
    const own = section(texts, MEDIA[hour].title);
    const at = own?.blocks.findIndex((b) => b.kind === 'rubric' && b.text === 'LECTIO BREVIS') ?? -1;
    return at >= 0 ? rubricAfter(own.blocks, at) : null;
  }
  return section(texts, 'LECTIO BREVIS')?.blocks.find((b) => b.kind === 'rubric')?.text || null;
}

/** The versicle and response after the short reading of a little hour. */
function versicleNode(b) {
  if (!recited() || !b.text) return el(`<div class="block">${renderTextBlock(b)}</div>`);
  return chantFromGabc(versicleGabc(b.text, b.r), { dropCap: false });
}
/** The rank that chooses the conclusion's tones; All Souls is sung as a weekday. */
function rankOf(cel) {
  if (MAIOR.test(cel.id || '')) return 'major';
  if (cel.id === 'commemoration_of_all_the_faithful_departed') return 'ferial';
  if (cel.rank === 'SOLEMNITY') return 'solemnity';
  if (cel.rank === 'FEAST') return 'feast';
  if (cel.rank === 'SUNDAY') return 'sunday';
  return 'ferial';
}
/** Benedicamus Domino for Lauds ("laudes"), I Vespers ("vesperae1") or Vespers. */
function benedicamusFor(cel, hour) {
  const r = rankOf(cel);
  const at = (set) => set[hour] || set.vesperae;
  if (r === 'major') return at(BENEDICAMUS.major);
  if (cel.seasons?.includes('CHRISTMAS_TIME') && (r !== 'ferial' || /^christmas_octave/.test(cel.id || ''))) return BENEDICAMUS.christmas;
  if (r === 'solemnity') return at(BENEDICAMUS.solemnity);
  if (r === 'feast') return BENEDICAMUS.feast;
  if (r === 'sunday') return BENEDICAMUS.sunday;
  return at(BENEDICAMUS.ferial);
}

/**
 * Compline, in the order of the Liturgia Horarum: Deus in adiutorium (sung, by rank), the
 * examination of conscience, the hymn, the psalmody, the short reading, the responsory In
 * manus tuas, the Nunc dimittis with Salva nos, the collect, the blessing Noctem quietam
 * (AM 2005 p. 540) and the antiphon of Our Lady of the season (AM 2005 pp. 472-477).
 */
async function composeCompline(main, day, date, hour) {
  const texts = await textsFor(day, date, hour);
  const slot = psalterSlot(day, date, hour);
  const propers = await propersFor(day, date, hour);
  const entries = withPropers(ocoCompline(day, hour), propers);
  if (!entries.length && !texts) { main.append(el('<p class="empty">Hæc hora nondum parata est.</p>')); return; }
  const cel = propers._cel || day;
  const paschal = cel.seasons?.includes('EASTER_TIME');

  main.append(hourTitle(hour, slot, propers));
  await appendOpening(main, day, hour, propers);
  // iBreviary's opening section: only its rubric (the examination of conscience) is kept
  const opening = texts?.find((s) => s.title && /^Completorium$/i.test(s.title));
  for (const b of opening?.blocks || []) if (b.kind === 'rubric') main.insertAdjacentHTML('beforeend', renderTextBlock(b));

  await appendHymn(main, withScore(entries.find((e) => e.kind === 'hymn')), hymnTextNode(texts));
  await appendPsalmody(main, entries.filter((e) => e.kind !== 'reference'), section(texts, 'PSALMODIA'));

  const lb = section(texts, 'LECTIO BREVIS');
  if (lb) { main.append(el('<h2 class="section">Lectio brevis</h2>')); main.append(readingNode(lb.blocks)); appendTr(main, state.tr?.own.reading?.lines); }

  // In manus tuas: the OCO's score (with its alleluias in Eastertide), else the text
  const rbs = entries.filter((e) => e.kind !== 'reference' && e.gabc && /^In manus tuas/.test(e.text || ''));
  const rb = rbs.find((e) => /allel[uú]ia/i.test(e.text) === paschal) || rbs[0];
  const rbText = section(texts, 'RESPONSORIUM BREVE');
  if (rb || rbText) {
    main.append(el('<h2 class="section">Responsorium breve</h2>'));
    const node = rb ? await chantNode(rb.gabc, { annotation: '' }) : null;
    if (node?.dataset.notated) main.append(node);
    else if (rbText) main.append(el(`<div class="block">${renderBlocks(responsoryBlocks(rbText.blocks))}</div>`));
    appendTr(main, state.tr?.own.responsory);
  }

  const ce = section(texts, 'CANTICUM EVANGELICUM');
  const nunc = entries.find((e) => (e.position || '').startsWith('Nunc') && e.kind !== 'reference');
  main.append(el('<h2 class="section">Nunc dimittis</h2>'));
  await appendGospelCanticle(main, nunc, ce, { proper: false });

  // the collect (as text), then the blessing and the antiphon of Our Lady, sung
  const or = section(texts, 'ORATIO');
  if (or) {
    main.append(el('<h2 class="section">Oratio</h2>'));
    const text = (b) => (b.kind === 'text' ? b.lines.map((l) => (typeof l === 'string' ? l : l.text)).join(' ') : '');
    const end = or.blocks.findIndex((b) => /^Noctem/.test(text(b)) || (b.kind === 'rubric' && /Mariam|antiphon/i.test(b.text)));
    main.append(collectNode(end < 0 ? or.blocks : or.blocks.slice(0, end)));
    appendTr(main, state.tr?.own.oratio, { proper: false });
  }
  main.append(el('<h2 class="section">Benedictio</h2>'));
  main.append(await chantNode(NOCTEM_QUIETAM, { annotation: '' }));
  main.append(el('<h2 class="section">Antiphona ad B. Mariam Virginem</h2>'));
  main.append(await chantNode(marianAntiphon(cel, date), { annotation: '' }));
}
const NOCTEM_QUIETAM = 20685;
// Antiphonale Monasticum 2005: Alma (p. 472), Ave Regina (p. 474), Regina cæli (p. 475), Salve Regina, simple tone (p. 477)
const MARIAN = { alma: 4694, ave: 18754, regina: 18753, salve: 18655 };
/** The antiphon of Our Lady by season: Alma from Advent to the Presentation (2 Feb), Ave Regina to Holy Week, Regina cæli in Eastertide, Salve Regina after. */
function marianAntiphon(cel, date) {
  const s = cel.seasons || [];
  const [, m, d] = date.split('-').map(Number);
  if (s.includes('EASTER_TIME')) return MARIAN.regina;
  if (s.includes('ADVENT') || s.includes('CHRISTMAS_TIME') || m === 1 || (m === 2 && d <= 2)) return MARIAN.alma;
  if (s.includes('LENT') || s.includes('PASCHAL_TRIDUUM') || m === 2 || m === 3) return MARIAN.ave;
  return MARIAN.salve;
}

async function render() {
  const main = $('#office');
  main.replaceChildren(el('<p class="loading">Paratur…</p>'));
  layouts.length = 0;
  const days = await calendarFor(state.date);
  const day = days[0];
  $('#hour').value = state.hour;
  document.title = `${HOUR_NAMES[state.hour]} · ${day ? capitalize(day.name) : state.date} · Cantus Horarum`;
  if (!day) { main.replaceChildren(el('<p class="empty">Calendarium huius anni deest.</p>')); return; }
  const frag = await composeHour(day);
  main.replaceChildren(...frag.childNodes);
  layouts.forEach((f) => f());
  location.hash = `${state.date}/${state.hour}`;
}

/** The chosen hour of the chosen date, composed into a detached container (its scores laid out once placed). */
async function composeHour(day) {
  const frag = document.createElement('div');
  state.tr = null;
  if (state.settings.translation) {
    const t = await loadTranslation(state.settings.translation, state.date);
    state.tr = hourTranslation(t, state.hour, latinReadingRef(await textsFor(day, state.date, state.hour), state.hour));
  }
  try {
    if (state.hour === 'laudes' || state.hour === 'vesperae') await composeLaudesVesperae(frag, day, state.date, state.hour);
    else if (state.hour === 'lectio') await composeLectio(frag, day, state.date);
    else if (MEDIA[state.hour]) await composeMedia(frag, day, state.date, state.hour);
    else await composeCompline(frag, day, state.date, state.hour);
  } catch (e) {
    frag.append(el(`<p class="empty">Error: ${esc(e.message)}</p>`));
    console.error(e);
  }
  return frag;
}

/**
 * The hour as PDF (site/print.js): composed again into a column of the page's width, in the
 * day's light colours, every score one SVG per system; then paged, and the print dialog.
 */
async function makePdf(fmt) {
  const day = (await calendarFor(state.date))[0];
  if (!day || !FORMATS[fmt]) return;
  const btn = $('#pdf-make');
  btn.disabled = true;
  const theme = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = 'light';
  const screenLayouts = layouts.splice(0);
  setPerLine(true);
  try {
    const col = printColumn(fmt);
    const frag = await composeHour(day);
    col.append(...frag.childNodes);
    await document.fonts?.ready;
    await Promise.all(layouts.map((f) => f()));
    printPages(col, fmt, () => {
      if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
      btn.disabled = false;
    });
  } catch (e) {
    console.error(e);
    btn.disabled = false;
  } finally {
    setPerLine(false);
    layouts.splice(0, layouts.length, ...screenLayouts);
  }
}

// ------------------------------------------------------------------ boot
function defaultHour() {
  const h = new Date().getHours();
  if (h < 9) return 'laudes'; if (h < 11) return 'tertia'; if (h < 14) return 'sexta'; if (h < 16) return 'nona'; if (h < 20) return 'vesperae'; return 'completorium';
}
function applySettings() {
  document.documentElement.style.setProperty('--size', state.settings.size || 100);
  if (state.settings.theme) document.documentElement.dataset.theme = state.settings.theme; else delete document.documentElement.dataset.theme;
  $('#text-size').value = state.settings.size || 100;
  $('#opt-theme').value = state.settings.theme || '';
  $('#opt-voice').value = state.settings.voice || '';
  for (const b of document.querySelectorAll('.mode')) b.setAttribute('aria-checked', String(b.dataset.psalms === (state.settings.psalms || '')));
  $('#opt-memoria').value = state.settings.memoria || '';
  $('#opt-presider').value = state.settings.presider ? '1' : '';
  $('#opt-invitatory').value = state.settings.invitatory || '';
  $('#opt-translation').value = state.settings.translation || '';
}
// The two psalm modes, shown in their cards as they will look: Ps 116 on tone 8 g, its
// short verses large enough to read
const MINI_VERSES = [
  'Laudáte Dóminum, omnes gentes, * collaudáte eum, omnes pópuli,',
  'quóniam confirmáta est super nos misericórdia eius, * et véritas Dómini manet in ætérnum.',
  'Glória Patri, et Fílio, * et Spirítui Sancto.',
];
function drawModePreviews() {
  const ctx = toneContext('8g');
  const scale = 1.3 * (state.settings.size || 100) / 100;
  for (const card of document.querySelectorAll('.mode .mini')) {
    const compact = card.closest('.mode').dataset.psalms === 'text';
    const sc = el('<div class="score"></div>');
    card.replaceChildren(sc);
    if (compact) {
      renderChant(sc, `(${ctx.clef}) 1. ${verseGabc(MINI_VERSES[0], ctx, { intone: true, first: true })}`, { dropCap: false, scale, maxLines: 2 });
      const ol = el('<ol start="2"></ol>');
      for (const v of MINI_VERSES.slice(1)) ol.append(el(`<li>${verseHtml(v, ctx, 1)}</li>`));
      card.append(ol);
    } else {
      const body = psalmGabc(MINI_VERSES.slice(0, 2), ctx).replace(/^\([^)]*\)\s*/, '');
      const numbered = body.split(/(?<=\(::\))\s*/).filter(Boolean).map((v, i) => `${i + 1}. ${v}`).join(' ');
      renderChant(sc, `(${ctx.clef}) ${numbered}`, { dropCap: false, scale });
    }
  }
}
function saveSettings() { localStorage.setItem('settings', JSON.stringify(state.settings)); }

async function boot() {
  const [oco, psalterium, slots, hymns] = await Promise.all([json('data/oco.json'), json('data/psalterium.json').catch(() => ({})), json('data/slots.json').catch(() => []), json('data/hymns.json').catch(() => ({}))]);
  state.hymns = hymns;
  state.oco = oco; state.psalterium = psalterium; state.slots = slots; state.ocoIndex = indexOco(oco);
  const m = /^#(\d{4}-\d{2}-\d{2})\/(\w+)$/.exec(location.hash);
  state.date = m ? m[1] : iso(new Date());
  state.hour = m && HOURS.includes(m[2]) ? m[2] : defaultHour();
  $('#date').value = state.date;
  applySettings();
  $('#date').onchange = (e) => { if (e.target.value) { state.date = e.target.value; render(); } };
  $('#hour').onchange = (e) => { state.hour = e.target.value; render(); };
  $('#settings-toggle').onclick = () => {
    const s = $('#settings');
    s.hidden = !s.hidden;
    $('#settings-toggle').setAttribute('aria-expanded', String(!s.hidden));
    if (!s.hidden) drawModePreviews();
  };
  $('#text-size').oninput = (e) => { state.settings.size = Number(e.target.value); saveSettings(); applySettings(); render(); };
  $('#opt-voice').onchange = (e) => { state.settings.voice = e.target.value || undefined; saveSettings(); };
  $('#opt-theme').onchange = (e) => { state.settings.theme = e.target.value || undefined; saveSettings(); applySettings(); };
  for (const b of document.querySelectorAll('.mode')) b.onclick = () => { state.settings.psalms = b.dataset.psalms || undefined; saveSettings(); applySettings(); render(); };
  $('#opt-memoria').onchange = (e) => { state.settings.memoria = e.target.value || undefined; saveSettings(); render(); };
  $('#opt-presider').onchange = (e) => { state.settings.presider = e.target.value ? true : undefined; saveSettings(); render(); };
  $('#opt-invitatory').onchange = (e) => { state.settings.invitatory = e.target.value || undefined; saveSettings(); render(); };
  $('#opt-translation').onchange = (e) => { state.settings.translation = e.target.value || undefined; saveSettings(); render(); };
  $('#pdf-format').value = state.settings.pdf || 'a5';
  $('#pdf-format').onchange = (e) => { state.settings.pdf = e.target.value; saveSettings(); };
  $('#pdf-make').onclick = () => makePdf($('#pdf-format').value);
  watchResize(layouts);
  render();
}
boot().catch((e) => { $('#office').replaceChildren(el(`<p class="empty">Error: ${esc(e.message)}</p>`)); console.error(e); });
