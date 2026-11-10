// Cantus Horarum — compose and display one hour of the Liturgia Horarum in chant.
import { loadGabc, renderChant, splitGabc, watchResize, setPerLine, setGabcAliases } from './chant.js';
import { FORMATS, printColumn, paginate } from './print.js';
import { makePdfFile } from './pdf.js';
import { BOOKS } from './sources.js';
import { toneContext, versesOf, psalmGabc, verseGabc, verseHtml, startAtCross } from './psalmtone.js';
import { resolveHour, indexOco, celebrationFor, isSanctoral } from './resolve.js';
import { findResponsory } from './responsoria.js';
import { t, setUiLang, applyPage, uiLang, zhNumber } from './i18n.js';
import { versicleGabc, chapterGabc, luCollectGabc, collectGabc, readingGabc, precesIntroGabc, intentionGabc, intentionAbbrGabc } from './recitation.js';
import { loadTranslation, loadOwn, ownKey, hourTranslation, sameReading, trNode, psalmNumber, chapterVerse, alignPsalm, verseTrHtml, trP, precesParts, hymnKey, hymnCorresponds } from './translate.js';

const HOURS = ['lectio', 'laudes', 'tertia', 'sexta', 'nona', 'vesperae', 'completorium'];
const hourName = (h) => t(`hour.${h}`);
/**
 * A celebration's name in Hong Kong's calendar (data/calendar-zh.json, from the Hong Kong
 * Diocesan Liturgy Commission's daily office): by its id, or for the days of the seasons
 * their pattern ("常年期第三十二周星期五").
 */
function celebrationZh(cel) {
  const own = state.zhNames?.[cel.id];
  if (own) return own;
  const m = /^(advent|lent|easter_time|ordinary_time)_(\d+)_(\w+)$/.exec(cel.id || '');
  const SEASON = { advent: '將臨期', lent: '四旬期', easter_time: '復活期', ordinary_time: '常年期' };
  const DOW = { sunday: '主日', monday: '周星期一', tuesday: '周星期二', wednesday: '周星期三', thursday: '周星期四', friday: '周星期五', saturday: '周星期六' };
  if (m && DOW[m[3]]) return `${SEASON[m[1]]}第${zhNumber(Number(m[2]))}${DOW[m[3]]}`;
  return null;
}
const sectionHead = (k) => el(`<h2 class="section" data-sec="${k}">${esc(t(`sec.${k}`))}</h2>`);
const ZH_TONE = { C: 'C', D: 'D', E: 'E', 'per.': '遊方' };
/** A psalm tone's label: "Tone 8 g", "第八調 g", "Tonus 8 g". */
function toneName(tone, ending = '') {
  const m = /^(\d)(\*?)$/.exec(String(tone));
  return t('tone', { t: [tone, ending].filter(Boolean).join(' '), zh: m ? zhNumber(Number(m[1])) + m[2] : ZH_TONE[tone] || tone, e: ending || '' }).trim();
}
const DAY_NAMES = ['Dominica', 'Feria II', 'Feria III', 'Feria IV', 'Feria V', 'Feria VI', 'Sabbato'];
const ROMAN = ['I', 'II', 'III', 'IV'];
const TEXT_HOUR = { lectio: 'lectio', laudes: 'laudes', tertia: 'media', sexta: 'media', nona: 'media', vesperae: 'vesperae', completorium: 'completorium' };
// The Antiphonale Romanum II (2009) is the book of the Liturgia Horarum: where it gives a
// piece, it is taken; the Antiphonale Monasticum 2005 only where it is silent (the little
// hours, Lauds, the ferias).
// Deus in adiutorium: AR II p. 737 "in dominicis et festis" (the AM's ferial tone, also on
// ferias) and "in sollemnitatibus" (Lauds and Vespers)
const DEUS_IN_ADIUTORIUM = { ferial: 4121, festive: 4121, solemn: 7864 };
const DOMINE_LABIA = { ferial: 18107, festive: 18108 };
const PATER_NOSTER = 4321; // AR II pp. 758-759, its one tone for the Lord's Prayer
// Conclusions: Antiphonale Monasticum 2005 p. 546 (little hours), Antiphonale Romanum II pp. 761-765
const BENEDICAMUS_HORAE = { ferial: 17847, festive: 17848 };
// Sunday II Vespers in Ordinary Time: the canticle of Ap 19 "Salus et gloria" is sung "more
// responsoriali vetustissimo cum Alleluia" (OCO), without antiphon. The Antiphonale Romanum
// II sets it each psalter week with one of two melodies: weeks I and III (pp. 457, 480; also
// in Advent and Eastertide) as GregoBase 4145, weeks II and IV (pp. 469, 491) as 4317.
const SALUS_ET_GLORIA = { 1: 4145, 2: 4317, 3: 4145, 4: 4317 };
// Dominus vobiscum … Benedicat vos: AR II p. 761, its one tone
const DOMINUS_VOBISCUM = 4322;
// Benedicamus Domino at Lauds and Vespers: the Antiphonale Romanum II's (pp. 763-765) by the
// day, the same melodies the AM 2005 gives (pp. 541-546); the AM's where the AR II, a book of
// Vespers on Sundays and feasts, has none (Lauds of solemnities, ferias). I sollemnitates
// maiores (Christmas, Epiphany, Ascension), II other solemnities, III feasts and the octave of
// Christmas, IV solemnities and feasts of Our Lady, V Sundays after the octave of Easter
// (not on GregoBase: BENEDICAMUS_PASCHAE), VI Sundays of Advent and Lent, VII Sundays per
// annum. The octave of Easter and Pentecost: Ite in pace with its two Alleluias (p. 762).
const BENEDICAMUS = {
  major: { vesperae1: 20680, laudes: 20681, vesperae: 20682 },
  solemnity: { laudes: 20683, vesperae: 19868 },
  christmas: 16665,
  feast: 16665,
  marian: 16129,
  sunday: 16976,
  sundayAdventLent: 3972,
  ferial: { laudes: 20715, vesperae: 19189 },
  paschal: 17802,
};
// AR II p. 765, "V. Post octavam Paschæ", read from the book
const BENEDICAMUS_PASCHAE = '(c3) BE(e)ne(g)di(h)cá(i)mus(i) Dó(hi/ji/ig/iHGFE/fgf)mi(f)no.(e) (::) <sp>R/</sp> De(eghwi)o(hi/ji/ig/iHGFE) grá(fgf)ti(f)as.(e) (::)';
// the "sollemnitates maiores": the Lord's great days (the octave of Easter sings Easter's)
const MAIOR = /^(nativity_of_the_lord|epiphany_of_the_lord|easter_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)|ascension_of_the_lord|pentecost_sunday)$/;
// the solemnities and feasts of Our Lady (AR II's Benedicamus IV)
const MARIAN_FEAST = /(_of_the_blessed_virgin_mary|^mary_mother_of_god)$/;
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
/**
 * The score of a responsory of the Office of Readings: those above first, then GregoBase's
 * (data/oco/responsoria-prolixa.json, from scripts/oco/match_responsoria_prolixa.py: above all
 * the Nocturnale Romanum), whose response and verse begin as iBreviary's do.
 */
function responsoryScore(r, v) {
  const R = plainWords(r), V = plainWords(v);
  return RESPONSORIA.find(([, a, b]) => R.startsWith(a) && (!b || V.startsWith(b)))?.[0]
    || findResponsory(state.responsoria, r, v);
}
// Psalm 94 (95) in the Liber Hymnarius (1983) tones, by the mode of the invitatory antiphon
const INVITATORY_TONES = { '2': 8218, '3': 10397, '4': 15508, '4*': 7669, '4**': 16356, '5': 10248, '6': 9664, '6*': 10035, '6**': 15059, '7': 9834, D: 9707, E: 9642 };

const state = {
  date: null, hour: null,
  calendar: {}, oco: null, ocoIndex: null, slots: [], psalterium: null, days: {}, daysHk: {},
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
  // the Diocese of Hong Kong's days that take other pages (its Epiphany, the days after it,
  // its cathedral's dedication: scripts/texts/hk.mjs)
  if (hkOrdo() && !(date in state.daysHk)) state.daysHk[date] = await json(`data/days-hk/${date}.json`).catch(() => null);
  const own = (hkOrdo() && state.daysHk[date]) || state.days[date];
  return withoutInvitatoryRubrics(own?.hours[TEXT_HOUR[hour]] || state.psalterium[`${day.psalter}-${day.dow}`]?.hours[TEXT_HOUR[hour]]);
}
/**
 * iBreviary's rubrics on where the invitatory goes and on Ps 94 standing in for a psalm of
 * the hour ("Quando sequens psalmus adhibitus est ad Invitatorium …"): the app places the
 * invitatory itself, always with Ps 94, so they go.
 */
const INVITATORY_RUBRIC = /Invitatori/;
function withoutInvitatoryRubrics(sections) {
  if (!sections) return sections;
  return sections.map((sec) => ({ ...sec, blocks: (sec.blocks || []).filter((b) => !((b.kind === 'rubric' || b.kind === 'text') && INVITATORY_RUBRIC.test(b.kind === 'rubric' ? b.text : (b.lines || []).map((l) => (typeof l === 'string' ? l : l.text)).join(' ')))) }));
}
// (a day file may lack an hour: a page iBreviary gives cut short, a Sunday it never has)
const hasOwnTexts = (date, hour) => {
  const own = (hkOrdo() && state.daysHk[date]) || state.days[date];
  return !!own && (!hour || !!own.hours?.[TEXT_HOUR[hour]]);
};
/**
 * Beyond the window of daily texts the short reading, responsories, intercessions and prayer
 * are the psalter day's. They are the day's own only on a weekday of Ordinary Time at Lauds,
 * the little hours, Vespers and Compline; anywhere else a line under the title says whose
 * they are (antiphons and hymns come from the Ordo Cantus Officii and are the day's).
 */
function borrowedNotice(day, date, hour, propers) {
  if (hasOwnTexts(date, hour) || state.psalterium[`${day.psalter}-${day.dow}`]?.date === date) return '';
  const cel = propers._cel || day;
  const plain = cel.rank === 'WEEKDAY' && cel.seasons?.includes('ORDINARY_TIME') && hour !== 'lectio' && !propers._first;
  return plain ? '' : el(`<p class="borrowed">${esc(t('msg.borrowed'))}</p>`);
}
/** The setting "Ordo": the General Roman Calendar, or the Diocese of Hong Kong's. */
const hkOrdo = () => state.settings.ordo === 'hk';

async function calendarFor(date) {
  const y = date.slice(0, 4);
  const dir = hkOrdo() ? 'calendar-hk' : 'calendar';
  const k = `${dir}/${y}`;
  if (!state.calendar[k]) state.calendar[k] = await json(`data/${dir}/${y}.json`).catch(() => ({}));
  return state.calendar[k][date] || [];
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
    .flatMap((e) => followReference(e) || [e]);
}
/**
 * "Ut in hebd. II." points to the same place of the same day in another psalter week. The
 * hymn's place ("H") takes all the hymns of that hour there, which the OCO lists without a
 * place (Sunday's Office of Readings: one by night, one by day).
 */
function followReference(e) {
  const m = e.kind === 'reference' && /hebd(?:\.|omada)\s*([IV]+)/i.exec(e.title || '');
  if (!m) return null;
  const there = (x) => x.part === 'PSALTERIUM' && x.chapter === `HEBDOMADA ${m[1]}` && x.day === e.day && x.hour === e.hour && x.kind !== 'reference';
  if (e.position === 'H') { const hymns = state.oco.filter((x) => there(x) && x.kind === 'hymn'); if (hymns.length) return hymns; }
  const one = state.oco.find((x) => there(x) && x.position === e.position);
  return one ? [one] : null;
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
// The interface is in English; the celebration's name and the texts stay Latin
const SEASON_NAMES = { ADVENT: 'Adventus', CHRISTMAS_TIME: 'Nativitatis', LENT: 'Quadragesimæ', HOLY_WEEK: 'Hebdomadæ sanctæ', PASCHAL_TRIDUUM: 'Tridui paschalis', EASTER_TIME: 'Paschæ', ORDINARY_TIME: 'per annum' };
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
  // in the Chinese interface the celebration's name is Hong Kong's (data/calendar-zh.json), the Latin under it
  const zhName = uiLang() === 'zh' ? celebrationZh(cel) : null;
  const week = t('psalterWeek', { n: ROMAN[slot.week - 1], zh: zhNumber(slot.week) });
  node.innerHTML = `<p class="rank">${esc(cel.rank ? t(`rank.${cel.rank}`) : '')}</p>
    <h1${zhName ? ' lang="zh-Hant-HK"' : ''}>${esc(zhName || capitalize(cel.name || ''))}</h1>
    ${zhName ? `<p class="tempora latin-name">${esc(capitalize(cel.name || ''))}</p>` : ''}
    <p class="tempora">${esc([isSanctoral(cel) && !zhName && tempora, week].filter(Boolean).join(' · '))}</p>`;
  const frag = document.createDocumentFragment();
  frag.append(node, el(`<h2 class="hour">${esc(t(`head.${propers._first ? 'vesperae1' : hour}`))}</h2>`));
  return frag;
}
const ROMAN_NUM = (n) => { const r = [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]]; let s = ''; for (const [k, v] of r) while (n >= v) { s += k; n -= v; } return s || '0'; };
const PLACE = { R: 'R br.' };
/** The psalter's entries with the proper ones put in their places. */
/**
 * Eastertide's "Psalmi cum Alleluia (in tonis diversis)" (OCO pp. 280-285: the psalms of the
 * weekdays' Office of Readings, the first and third of Lauds, the first two of Vespers, the
 * little hours, Compline): the antiphon Alleluia in the mode of the psalter's antiphon whose
 * place it takes, so each psalm keeps the tone the OCO gives it. The melodies are the old
 * Roman and monastic antiphonals' (Liber Usualis, Antiphonale Monasticum), by mode and, where
 * there are several, by ending; the psalm follows the ending the antiphon itself shows.
 */
const ALLELUIA = { // mode: { ending of the psalter's antiphon ('' = any other): [GregoBase id, its own mode and ending] }
  1: { '': [2822, '1g2'], a: [2383, '1a'], f: [15201, '1f'] }, 2: { '': [2197, '2d'] }, 3: { '': [2090, '3g'], b: [3000, '3b'] },
  4: { '': [15186, '4e'] }, 5: { '': [15188, '5a'] }, 6: { '': [3004, '6f'] }, 7: { '': [2622, '7c2'], a: [10195, '7a'] },
  8: { '': [2293, '8g'], c: [2025, '8c'] },
};
function alleluiaFor(e, entries, place) {
  if (!e?.alleluia) return e;
  const m = /^(\d)\*?-?\d?([a-z]?)/.exec(byPosition(entries, place)?.mode || '');
  const set = ALLELUIA[m?.[1]] || ALLELUIA[8]; // the psalter's new tones (C, D, E) and the peregrinus have none
  const [gabc, mode] = set[m?.[2]] || set[''];
  return { ...e, gabc, mode };
}

function withPropers(entries, propers) {
  const places = Object.keys(propers).filter((k) => k !== 'I' && k[0] !== '_');
  // on feasts the psalter's cross-references ("ut in hebd. I") do not apply
  if (propers._big) entries = entries.filter((e) => e.kind !== 'reference');
  const replaced = (e) => (e.kind === 'hymn' && propers.H) || places.some((k) => k !== 'H' && (e.position || '').split(' ')[0] === (PLACE[k] || k).split(' ')[0]);
  const own = places.map((k) => ({ ...alleluiaFor(propers[k], entries, k), position: k === 'H' ? 'H' : PLACE[k] || k }));
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
  if (b.kind === 'text') {
    // italics within a line (b.italics: the words of Scripture a reading quotes)
    const line = (l, i) => {
      const ranges = b.italics?.[i];
      if (!ranges) return esc(l);
      let out = '', at = 0;
      for (const [from, to] of ranges) { out += `${esc(l.slice(at, from))}<i>${esc(l.slice(from, to))}</i>`; at = to; }
      return out + esc(l.slice(at));
    };
    return `<div class="text">${b.lines.map((l, i) => (typeof l === 'string' ? `<p>${line(l, i)}</p>` : `<p><i>${esc(l.text)}</i></p>`)).join('')}</div>`;
  }
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
function pointedPsalmNode(b, ctx, { canticle = false, solemn = false, segments = null, trs = [], fromCross = false } = {}) {
  const node = el('<div class="psalm"></div>');
  const head = renderPsalmBlock({ ...b, strophes: [] });
  node.insertAdjacentHTML('beforeend', head);
  const h = node.querySelector('.psalm-head');
  const toneLabel = `<span class="tone">${esc(toneName(ctx.tone, ctx.ending))}</span>`;
  // Gospel canticles: the antiphon above already shows the mode
  if (!canticle) { if (h) h.insertAdjacentHTML('beforeend', toneLabel); else node.insertAdjacentHTML('afterbegin', `<div class="psalm-head">${toneLabel}</div>`); }
  // the verses as jgabc takes them (the build groups them, from the Nova Vulgata where it can),
  // in runs, with whatever stands between them (a refrain, a rubric) kept in its place
  segments ||= [{ strophes: versesOfBlock(b) }];
  // its translation, verse by verse where the verses pair (site/translate.js), else after it;
  // paired with the whole psalm, the translations keeping the verses the antiphon quotes
  // `trs`: [{ lang, lines }], one per translation chosen (in fallback mode the first there is)
  const latinVerses = segments.filter((x) => !x.html).flatMap((x) => x.strophes);
  let als = (trs || []).filter((x) => x?.lines?.length).map((x) => ({ lang: x.lang, al: alignPsalm(latinVerses, x.lines, x.lang) }));
  if (state.trMode === 'fallback') als = als.slice(0, 1);
  // after an antiphon ending in † the psalm begins at the verse marked † (startAtCross);
  // elsewhere that mark is dropped
  const cut = fromCross ? startAtCross(segments) : null;
  const skip = cut?.skip || 0;
  segments = (cut?.segments || segments).map((x) => (x.html ? x
    : { strophes: x.strophes.map((st) => st.map((v) => v.replace(/^\s*†\s*/, '').replace(/\*\s*†\s*/, '* '))) }));
  const underOf = (al, i) => (al?.mode === 'verse' ? (al.under[i - 1 + skip] || []).map(verseTrHtml).join(' ') : '');
  // each translation's verse `i` as paragraphs
  const underNodes = (i) => als.map(({ lang, al }) => (underOf(al, i) ? trP(lang, underOf(al, i)) : null)).filter(Boolean);
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
      layouts.push(renderChant(sc, `(${ctx.clef}) ${numbered}`, { dropCap: false, source: first ? PSALM_TONE_SOURCE : null }));
      // as Breviarium Gregorianum: the run's translation in one paragraph, its verses numbered
      for (const { lang, al } of als) {
        if (al.mode !== 'verse') continue;
        const html = [];
        // a translated verse that covers several Latin ones (the Grail joins and splits them) is numbered by their range
        let start = from;
        for (let i = from; i <= n; i++) {
          if (!underOf(al, i)) continue;
          html.push(`<b>${start < i ? `${start}–${i}` : i}.</b> ${underOf(al, i)}`);
          start = i + 1;
        }
        if (html.length) node.append(trP(lang, html.join(' ')));
      }
    } else {
      // Compactus: the psalm's first verse in notes with the intonation, the others numbered,
      // cadence accents bold and preparatory syllables italic (as jgabc and Breviarium Gregorianum)
      let k = 0;
      if (first) {
        const sc = el('<div class="score verse-score"></div>');
        node.append(sc);
        layouts.push(renderChant(sc, `(${ctx.clef}) ${++n}. ${verseGabc(verses[0], ctx, { intone: true, first: true, solemn })}`, { dropCap: false, source: PSALM_TONE_SOURCE }));
        node.append(...underNodes(n));
        k = 1;
      }
      const ol = el(`<ol class="verses" start="${n + 1}"></ol>`);
      let i = 0;
      seg.strophes.forEach((st) => st.forEach((v, j) => {
        if (i++ < k) return;
        const li = el(`<li${j === 0 ? ' class="strophe-start"' : ''}></li>`);
        li.innerHTML = canticle ? verseHtml(v, ctx, 0, { solemn }) : verseHtml(v, ctx, n);
        ol.append(li);
        n++;
        li.append(...underNodes(n));
      }));
      if (ol.children.length) node.append(ol);
    }
    first = false;
  }
  for (const { lang, al } of als) if (al.mode === 'block') { const t = trNode(lang, al.lines); if (t) node.append(t); }
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
    if (psalm) node.append(pointedPsalmNode(psalm.head, ctx, { ...rest, segments: psalm.segs, trs: trFor?.(psalm.head) || [], fromCross: cross }));
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

/** Where a score file's notation comes from (stamped by the build, site/sources.js), linked to GregoBase. */
function sourceOf(header) {
  const label = header?.['cantus-source'];
  if (!label) return null;
  const id = header['gregobase-id'];
  return { label, href: id ? `https://gregobase.selapa.net/chant.php?id=${id}` : null };
}
// the books the generated scores follow (site/sources.js)
const PSALM_TONE_SOURCE = { label: 'AR II 738–740' };
const RECITATION_SOURCE = { chapter: { label: 'LU 123' }, festal: { label: 'LU 98' }, simple: { label: 'LU 101' }, ferialB: { label: 'LU 99' }, versicle: { label: 'AM I 532' }, versicleFestive: { label: 'LU 118' }, lectio: { label: 'AR II 756' }, oratio: { label: 'AR II 759' }, preces: { label: 'AR II 758' } };

/**
 * A score, without label (the annotation above the initial gives the mode). Without a
 * score, `fallbackText` is shown after `fallbackLabel`.
 */
async function chantNode(gabcId, { annotation = null, fallbackText = null, fallbackLabel = 'Ant.', transform = null } = {}) {
  const wrap = el('<div class="chant"><div class="score"></div></div>');
  const score = wrap.querySelector('.score');
  const src = gabcId ? await loadGabc(gabcId) : null;
  if (!src) {
    score.innerHTML = fallbackText ? `<p class="ant-text">${fallbackLabel ? `<span class="r">${esc(fallbackLabel)}</span> ` : ''}${esc(fallbackText)}</p>` : '<p class="missing">No score.</p>';
    return wrap;
  }
  const { header, body: raw } = splitGabc(src);
  const ann = annotation ?? header.annotation ?? (header.mode ? `${header.mode}${header['mode-modifier'] || ''}` : null);
  const body = transform ? transform(withoutEuouae(raw)) : withoutEuouae(raw);
  layouts.push(renderChant(score, body, { annotation: ann, source: sourceOf(header) }));
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
const antiphonNode = (ant, fallbackText, { custos = null } = {}) => chantNode(ant?.gabc, {
  fallbackText: (ant?.text || fallbackText)?.replace(/\s*†\s*$/, ''),
  transform: custos ? (b) => withCustos(b, custos) : null,
});
/**
 * The first note of the psalm or canticle after an antiphon, as a custos after the antiphon's
 * double bar (as Breviarium Gregorianum and the books print it): read from the first score of
 * the psalm node, in the antiphon's clef.
 */
const LETTERS = 'abcdefghijklm';
const doOf = (clef) => { const m = /^([cf])b?([1-4])$/.exec(clef || ''); if (!m) return null; const line = 3 + 2 * (Number(m[2]) - 1); return m[1] === 'c' ? line : line + 4; };
function firstNoteOf(node) {
  const g = node?.querySelector?.('.score')?.gabc;
  if (!g) return null;
  const clef = /\(([cf]b?[1-4])\)/.exec(g)?.[1];
  const note = /\(([^)]*)\)/g; let m; note.lastIndex = g.indexOf(`(${clef})`) + clef.length + 2;
  while ((m = note.exec(g))) { const p = /[a-m]/i.exec(m[1].replace(/^[cf]b?[1-4]$/, '')); if (p) return { clef, letter: p[0].toLowerCase() }; }
  return null;
}
function withCustos(body, first) {
  const clefs = [...body.matchAll(/\(([cf]b?[1-4])\)/g)];
  const antClef = clefs.length ? clefs[clefs.length - 1][1] : null;
  const a = doOf(antClef), p = doOf(first.clef);
  if (a === null || p === null) return body;
  const i = a + LETTERS.indexOf(first.letter) - p;
  if (i < 0 || i >= LETTERS.length || !/\(::\)\s*$/.test(body)) return body;
  return body.replace(/\(::\)\s*$/, `(::) (${LETTERS[i]}+)`);
}

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
/** Deus, in adiutorium: the solemn tone at Lauds and Vespers of solemnities, else the simple one. */
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
 * Domine, labia mea aperies; the antiphon, sung and at once repeated (a rubric says so); Psalm 94 (95) strophe
 * by strophe in the tone that matches the antiphon's mode, the antiphon after each strophe
 * (IGLH 34: "antiphona proponitur et statim repetitur, et post singulas strophas iterum
 * repetitur"). An antiphon ending in "venite, adoremus" has only those words after the
 * strophes and the whole antiphon after the Gloria Patri, as the Liber Hymnarius (2nd ed.,
 * 2019, praenotanda) allows ("haec verba tantum repetere licet post unamquamque stropham …
 * Sed post Gloria Patri, semper repeti debet antiphona integra").
 */
async function appendInvitatory(main, day, proper = null) {
  const ant = proper || invitatoryAntiphon(day);
  if (!ant) return false;
  main.append(sectionHead('invitatory'));
  main.append(await chantNode(isFestive(day) ? DOMINE_LABIA.festive : DOMINE_LABIA.ferial, { annotation: '' }));
  const antText = (ant.text || ant.title).replace(/([.!?])\s.*$/, '$1'); // the OCO text runs on into "Veníte, …"
  // the books' "Ps. Veníte" after the antiphon goes: the psalm's score follows with it
  const transform = (b) => { const i = b.indexOf('(::)'); return i < 0 ? b : b.slice(0, i + 4); };
  const [first] = keyed(await chantNode(ant.gabc, { fallbackText: antText, transform }));
  const antiphon = async () => { const n = await chantNode(ant.gabc, { fallbackText: antText, transform }); n.dataset.key = first.dataset.key; return n; };
  main.append(first, el('<p class="rubric">Antiphona repetitur.</p>')); // sung again at once (IGLH 34), not printed twice
  // "Veníte, adorémus" alone, cut from the antiphon's score, when it ends so
  const src0 = ant.gabc ? await loadGabc(ant.gabc) : null;
  const venite = src0 ? veniteAdoremus(splitGabc(src0).body) : null;
  const refrain = async () => {
    if (!venite) return antiphon();
    const n = el('<div class="chant"><div class="score"></div></div>');
    layouts.push(renderChant(n.firstChild, venite, { dropCap: false }));
    n.dataset.notated = '1'; n.dataset.key = first.dataset.key;
    return n;
  };
  const toneId = INVITATORY_TONES[ant.mode];
  const src = toneId ? await loadGabc(toneId) : null;
  if (!src) { main.append(el('<p class="rubric">Psalm 94 (95): no score.</p>')); return true; }
  const { header: toneHeader, body } = splitGabc(src);
  const clef = /^\s*(\([cf]b?[1-4]\))/.exec(body)?.[1] || '(c4)';
  // the strophes end in a double bar, written "(::)", "(::Z)", "(::Z-)", "(::/)" or inside the
  // last neume ("(d/eed.::Z)") as the transcribers had it
  const strophes = body.replace(/^\s*\([cf]b?[1-4]\)/, '').replace(/^%.*$/gm, '') // and GABC comments go
    .replace(/\(([^():]*?)\s*::[^)]*\)/g, (m, notes) => (notes.trim() ? `(${notes.trim()}) (::)` : '(::)'))
    .replace(/\(Z-?\)/g, '')
    .split('(::)').map((x) => x.trim()).filter((x) => /[a-z]\(/i.test(x));
  main.append(el(`<div class="psalm-head"><span class="ref">Psalmus 94 (95)</span><span class="tone">${esc(toneName(ant.mode))}</span></div>`));
  for (const [i, st] of strophes.entries()) {
    const sc = el('<div class="score verse-score"></div>');
    sc.dataset.key = first.dataset.key;
    main.append(sc);
    layouts.push(renderChant(sc, `${clef} ${st} (::)`, { dropCap: false, source: i === 0 ? sourceOf(toneHeader) : null }));
    main.append(await (i < strophes.length - 1 ? refrain() : antiphon())); // the last strophe is the Gloria Patri
  }
  return true;
}
/**
 * The end of an invitatory antiphon's score from "ve-ní-te, a-do-ré-mus" on, with its clef,
 * when the antiphon (before its first double bar) ends with those words; else null.
 */
function veniteAdoremus(body) {
  const clef = /^\s*(\([cf]b?[1-4]\))/.exec(body)?.[1];
  const end = body.indexOf('(::)');
  if (!clef || end < 0) return null;
  const ant = body.slice(0, end);
  const n = '(\\([^)]*\\)\\s*)'; // a syllable's notes
  // ve-ní-te, a-do-ré-mus (or ad-o-ré-mus), in Eastertide followed by al-le-lú-ia
  const re = new RegExp(`[Vv]e${n}n[íi]${n}te,?${n}(?:<[^>]*>\\s*)*(?:a${n}do|ad${n}o)${n}ré${n}mus[.,]?${n}(?:(?:\\([,;:]\\)\\s*)?(?:<[^>]*>\\s*)*al${n}le${n}l[úu]${n}[ij]a\\.?\\([^)]*\\)\\s*)?$`);
  const m = re.exec(ant);
  if (!m) return null;
  return `${clef} ${m[0].replace(/^v/, 'V').trim()} (::)`;
}


/**
 * The hymn as one score with all its strophes. When the score holds only the first
 * strophe, the others follow as text.
 */
async function appendHymn(main, hymn, textNode, alternatives = []) {
  // the Latin hymn: its incipit (the OCO's title, else the text's first line) and strophes
  const firstLine = textNode?.innerHTML.split(/<br\s*\/?>/)[0].replace(/<[^>]*>/g, '') || '';
  // without a score the text printed is iBreviary's, which may be another hymn: translate that
  const key = hymnTableKey(hymn?.gabc ? hymn.title?.replace(/\s*\(.*$/, '').replace(/\s+(ut|vel|de Communi)\b.*$/, '') : null, firstLine);
  const latinStrophes = textNode ? textNode.querySelectorAll(':scope > p').length : 0;
  await appendHymnOnly(main, hymn, textNode, alternatives);
  if (hymn || textNode) eachTr(() => { const node = hymnTrNode(key, latinStrophes); if (node) main.append(node); return !!node; });
}
/**
 * The tables' key for a hymn (its first three words): the OCO often names a hymn by two
 * ("Beate martyr"), so the printed text's first line, when it is that hymn, or the one
 * key in the tables that begins so.
 */
function hymnTableKey(title, firstLine) {
  const t = hymnKey(title || firstLine), l = hymnKey(firstLine);
  if (!title || l.startsWith(t)) return l || t;
  if (t.split(' ').length >= 3) return t;
  const keys = new Set([...Object.keys(state.hymns?.match || {}), ...Object.keys(state.hymns?.en || {})].filter((k) => k.startsWith(`${t} `)));
  return keys.size === 1 ? [...keys][0] : t;
}
/**
 * The hymn's translation after it, as Breviarium Gregorianum: one paragraph, its strophes
 * numbered when they are as many as the Latin's. Only the translated office's hymn that is
 * this hymn's translation (data/hymns/match.json); in English, else the app's own.
 */
function hymnTrNode(key, latinStrophes) {
  const T = state.tr;
  const h = T.t.hymn;
  let lines = Array.isArray(h) ? h : h?.[state.hour];
  // iBreviary heads its Advent hymns "Alternate Hymns"
  while (lines?.length && (lines[0] === '' || /^alternate hymns?$/i.test(lines[0]))) lines = lines.slice(1);
  let strophes = null;
  const opening = T.lang === 'zh' ? (lines || []).filter(Boolean).slice(0, 4).join('') : lines?.[0];
  if (lines?.length && hymnCorresponds(state.hymns?.match, key, T.lang, opening)) {
    strophes = lines.reduce((a, l) => { if (l === '') a.push([]); else a[a.length - 1].push(l); return a; }, [[]]).filter((x) => x.length);
  } else if (T.lang === 'en' && state.hymns?.en?.[key]) strophes = state.hymns.en[key];
  (window.__trHymns ||= []).push([key, lines?.find((l) => l) || '', !!strophes]); // for audits
  if (!strophes) { if (key) (window.__trMissingHymns ||= new Set()).add(key); return null; }
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
  main.append(sectionHead('hymn'));
  const src = hymn?.gabc ? await loadGabc(hymn.gabc) : null;
  if (hymn) main.append(await chantNode(hymn.gabc, { fallbackText: src ? null : hymn.title, fallbackLabel: '' }));
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
async function appendPsalmody(main, entries, psalmodySection, { single = null, salus = null } = {}) {
  main.append(sectionHead('psalmody'));
  for (const T of state.trs) { T.at = 0; T.prev = null; }
  let groups = psalmGroups(psalmodySection);
  const printed = Object.fromEntries(groups.map((g) => [g.n, g.antiphon])); // iBreviary's Latin antiphons
  if (single) { // one proper antiphon for all the psalms (little hours in the seasons and on feasts)
    // (where iBreviary prints the psalms without their antiphon, the psalms alone)
    const items = groups.length ? groups.flatMap((g) => g.items) : (psalmodySection?.blocks || []).filter((b) => b.kind === 'psalm');
    groups = items.length ? [{ n: 1, antiphon: single.text, items }] : [];
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
    if (salus && g && ant?.kind === 'reference' && /Salus et gloria/.test(ant.title || '')) {
      await appendSalusEtGloria(main, g, salus);
      if (g === last) after.length = 0; // iBreviary's closing "Allelúia" refrain, sung in the score
      continue;
    }
    // in the other seasons (and on solemnities) the AR II has the canticle Ap 19 "modo tropari,
    // cum Alleluia et antiphona" (p. 457): its Alleluia melody (pp. 10, 40, 238, GregoBase
    // 4145) between the day's antiphon
    if (g && ant && ant.kind !== 'reference' && g.items.some((x) => x.kind === 'psalm' && /Ap 19/.test(x.ref || ''))) {
      const box = el('<div></div>');
      await appendSalusEtGloria(box, g, SALUS_ET_GLORIA[3]);
      const before = await antiphonNode(ant, g.antiphon);
      main.append(before, ...box.childNodes, await antiphonNode(ant, g.repeat || g.antiphon));
      afterAntiphon(before, (T) => sungTr(ant?.text, printed[n], null, { shared: T.same || ant?.part === 'PSALTERIUM' }));
      if (g === last) after.length = 0;
      continue;
    }
    // each translation's psalm (all of them, to keep their places), the first giving the antiphon
    const used = new Map();
    const trFor = (head) => {
      const out = [];
      eachTr((T) => { const t = nextTrPsalm(head); if (!used.has(T.lang)) used.set(T.lang, t); if (t) out.push({ lang: T.lang, lines: t.lines }); }, { all: true });
      return out;
    };
    // iBreviary's antiphon ends in † when it quotes the psalm's opening; the OCO's may put
    // the same words otherwise ("Illuminátio mea et salus mea Dóminus"), or be another antiphon
    const fromCross = /†\s*$/.test(g?.antiphon || '') && (!ant?.text || sameWords(ant.text, g.antiphon));
    // the psalm first, so the antiphon can show where it begins (its custos)
    const psalms = g ? psalmodyNode(g.items, await toneFor(ant), { trFor, fromCross }) : null;
    const first = firstNoteOf(psalms);
    const before = await antiphonNode(ant, g?.antiphon, { custos: first });
    main.append(before);
    if (g) main.append(...keyed(before, psalms, await antiphonNode(ant, g.repeat || g.antiphon)));
    // the translated office's antiphon is the psalter's, or the day's when it keeps the same office
    afterAntiphon(before, (T) => sungTr(ant?.text, single ? null : printed[n], used.get(T.lang)?.ant, { shared: T.same || ant?.part === 'PSALTERIUM' }));
  }
  // the versicle before the readings (Office of Readings), sung
  for (const v of after) main.append(versicleNode(v));
  if (after.length) eachTr((T) => appendTr(main, T.t.versicle, { proper: false }));
}

/**
 * The canticle Salus et gloria sung responsorially with its Alleluias (Sunday II Vespers per
 * annum): its heading from iBreviary, then the one score; its translation after it.
 */
async function appendSalusEtGloria(main, g, id) {
  const head = g.items.find((b) => b.kind === 'psalm');
  if (head) {
    main.append(el(`<div class="psalm-head"><span class="ref">${esc(head.ref || 'Canticum Ap 19, 1-7')}</span>${head.title ? `<span class="title">${esc(head.title)}</span>` : ''}</div>`));
  }
  main.append(await chantNode(id, { annotation: '' }));
  // the translation's verses without its Alleluias (the score sings them) and marks
  // every translation's psalm (to keep their places), shown as the mode says
  const got = [];
  eachTr((T) => { got.push([T, nextTrPsalm(head)]); }, { all: true });
  for (const [T, t] of got) {
  const lines = (t?.lines || []).filter((l) => l.trim() && !/^((alleluia|亞肋路亞)[\s.,!，。！]*)+$/i.test(l.trim())).map((l) => l.replace(/\s*[*†※＋]\s*$/, ''));
  const node = lines.length ? trNode(T.lang, lines) : null;
  if (node) { main.append(node); if (state.trMode === 'fallback') break; }
  }
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
  const ownDate = hasOwnTexts(date, 'lectio') || state.psalterium[`${day.psalter}-${day.dow}`]?.date === date;
  if (!entries.length && !texts) { main.append(el(`<p class="empty">${t('msg.notYet')}</p>`)); return; }
  main.append(hourTitle('lectio', slot, propers));
  main.append(borrowedNotice(day, date, 'lectio', propers));
  await appendOpening(main, day, 'lectio', propers);

  // two hymns: one for the night or early morning, one for the day (a proper hymn serves both)
  const hymns = propers.H ? entries.filter((e) => e.kind === 'hymn').slice(0, 1) : entries.filter((e) => e.kind === 'hymn').map(withScore);
  // which: the setting "Office of Readings hymn" (by the hour unless chosen: before 7 the night's)
  const pref = state.settings.ofHymn;
  const night = pref === 'night' || (pref !== 'day' && new Date().getHours() < 7);
  const [hymn] = night || hymns.length < 2 ? hymns : [hymns[1], hymns[0]];
  const part = hymnBlocksNode(hymnPart(texts, night ? /^I\./ : /^II\./)) || hymnTextNode(texts);
  await appendHymn(main, hymn, part);

  await appendPsalmody(main, entries, section(texts, 'PSALMODIA'));

  // the readings and their responsories are proper to the date
  main.append(sectionHead('readings'));
  const lect = ownDate ? section(texts, 'LECTIONES') : null;
  if (!lect) {
    main.append(el(`<p class="rubric">${t('msg.noReadings')}</p>`));
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
    let at = -1, respTr = null;
    // `get(T)`: the lines of translation T, when its office is the same
    const putTr = (get) => eachTr((T) => { const lines = T.same ? get(T) : null; const t = lines?.length ? trNode(T.lang, lines) : null; if (t) main.append(t); return !!t; });
    const flushResp = () => { if (respTr) { putTr(respTr); node = el('<div class="block lectiones text"></div>'); main.append(node); respTr = null; } };
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind === 'heading') { flushResp(); at++; node.insertAdjacentHTML('beforeend', `<h3 class="sub">${esc(b.text[0] + b.text.slice(1).toLowerCase())}</h3>`); }
      else if (b.kind === 'rubric' && b.text === 'RESPONSORIUM') {
        const a = at;
        const l = (T) => T.t.lectiones?.[a];
        if (putTr((T) => l(T) && [...(l(T).title ? [l(T).title] : []), ...l(T).lines])) { node = el('<div class="block lectiones text"></div>'); main.append(node); }
        respTr = (T) => l(T)?.responsory;
        node.insertAdjacentHTML('beforeend', `<p class="rubric">${t('sub.responsory')}</p>`);
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
  if (day.dow === 0) main.append(el(`<p class="rubric">${t('msg.teDeum')}</p>`));
  const or = section(texts, 'ORATIO');
  if (or) { main.append(sectionHead('oratio')); main.append(await conclusionNode(or.blocks, propers._cel || day, 'lectio', { trFor: (T) => (T.same ? T.t.oratio : null) })); }
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
  if (!entries.length && !texts) { main.append(el(`<p class="empty">${t('msg.notYet')}</p>`)); return; }

  main.append(hourTitle(hour, slot, propers));
  main.append(borrowedNotice(day, date, hour, propers));
  await appendOpening(main, day, hour, propers);
  await appendHymn(main, hymn, hymnBlocksNode(hymnPart(texts, new RegExp(`^${title}$`))) || (propers.H ? hymnTextNode(texts) : null));
  // The hour's own part: the short reading with its versicle, then the collect. In the seasons
  // and on feasts iBreviary puts the hour's one antiphon there too, before the reading (the
  // psalms then stand bare in the psalmody); on solemnities with the complementary psalmody,
  // the hymn, the antiphon and the psalms as well.
  // (All Saints: each hour twice, first its hymn and antiphon, then its reading)
  const isLb = (b) => b.kind === 'rubric' && b.text === 'LECTIO BREVIS';
  const owns = (texts || []).filter((x) => x.title === title);
  let own = owns.find((x) => x.blocks.some(isLb)) || owns[0];
  let psalmody = section(texts, 'PSALMODIA');
  let single = alleluiaFor(propers['1'], entries, '1') || null;
  if (own) {
    const lb = own.blocks.findIndex(isLb);
    const head = [...owns.filter((x) => x !== own).flatMap((x) => x.blocks), ...(lb > 0 ? own.blocks.slice(0, lb) : [])];
    if (head.some((b) => b.kind === 'psalm')) psalmody = { title: 'PSALMODIA', blocks: head.filter((b) => b.kind === 'psalm') };
    // (or only after the hour's hymn, 1 January)
    const hy = section(texts, 'HYMNUS')?.blocks || [];
    const from = hy.findIndex((b) => b.kind === 'rubric' && b.text === title);
    const upTo = hy.findIndex((b, k) => k > from && b.kind === 'rubric' && /^AD /.test(b.text));
    // (or slipped under the reading's heading: the Holy Family at None)
    const ant = head.find((b) => b.kind === 'antiphon') || own.blocks.find((b) => b.kind === 'antiphon')
      || (from >= 0 ? hy.slice(from, upTo < 0 ? undefined : upTo).find((b) => b.kind === 'antiphon') : null);
    // an antiphon the OCO does not give is sung from iBreviary's text
    if (ant && !single) single = { kind: 'chant', title: ant.text, text: ant.text };
    own = { ...own, blocks: own.blocks.slice(Math.max(lb, 0)).filter((b) => b.kind !== 'antiphon') };
  }
  await appendPsalmody(main, entries, psalmody, { single });

  if (own) {
    // on Sundays, on feasts and in the seasons the three hours have one collect, which
    // iBreviary prints once, under None: the word "Oratio" alone stands under Terce and Sext
    const isOr = (b) => b.kind === 'rubric' && b.text === 'ORATIO';
    const blocks = own.blocks.filter((b) => !(b.kind === 'text' && b.lines?.length === 1 && /^Oratio\.?$/i.test(String(b.lines[0]).trim())));
    if (!blocks.some(isOr)) {
      const donor = (texts || []).filter((x) => /^AD (TERTIAM|SEXTAM|NONAM)$/.test(x.title || '')).reverse().find((x) => x.blocks.some(isOr));
      if (donor) blocks.push(...donor.blocks.slice(donor.blocks.findIndex(isOr)));
    }
    own = { ...own, blocks };
    const at = (t) => own.blocks.findIndex((b) => b.kind === 'rubric' && b.text === t);
    const lbAt = at('LECTIO BREVIS'), orAt = at('ORATIO');
    const first = [lbAt, orAt].filter((k) => k >= 0);
    for (const b of own.blocks.slice(0, first.length ? Math.min(...first) : undefined)) main.insertAdjacentHTML('beforeend', renderTextBlock(b));
    if (lbAt >= 0) {
      main.append(sectionHead('reading'));
      const part = own.blocks.slice(lbAt + 1, orAt > lbAt ? orAt : undefined);
      main.append(readingNode(part.filter((b) => b.kind !== 'versicle')));
      eachTr((T) => appendTr(main, T.own.reading?.lines));
      for (const v of part.filter((b) => b.kind === 'versicle')) main.append(versicleNode(v));
      eachTr((T) => appendTr(main, T.own.versicle));
    }
    if (orAt >= 0) {
      main.append(sectionHead('oratio'));
      main.append(await conclusionNode(own.blocks.slice(orAt + 1), propers._cel || day, hour, { trFor: (T) => (T.same ? T.own.oratio : null) }));
    }
  }
}

async function composeLaudesVesperae(main, day, date, hour) {
  const slot = psalterSlot(day, date, hour);
  const propers = await propersFor(day, date, hour);
  const entries = withPropers(ocoPsalter(slot), propers);
  // Saturday Vespers texts are stored under the Saturday itself (iBreviary gives I Vespers there)
  const texts = await textsFor(day, date, hour);
  if (!entries.length && !texts) { main.append(el(`<p class="empty">${t('msg.notYet')}</p>`)); return; }

  main.append(hourTitle(hour, slot, propers));
  main.append(borrowedNotice(day, date, hour, propers));
  await appendOpening(main, day, hour, propers);
  const hymns = entries.filter((e) => e.kind === 'hymn');
  await appendHymn(main, hymns[0], hymns.length ? hymnTextNode(texts) : null, hymns.slice(1));
  const salus = hour === 'vesperae' && slot.label === 'II Vesp.' && day.seasons?.includes('ORDINARY_TIME') ? SALUS_ET_GLORIA[slot.week] : null;
  await appendPsalmody(main, entries, section(texts, 'PSALMODIA'), { salus });

  // on memorials the weekday's short reading, responsory and intercessions, unless the common is chosen
  const feria = memoriaDeFeria(propers._cel) ? state.psalterium[`${day.psalter}-${day.dow}`]?.hours[TEXT_HOUR[hour]] : null;
  const part = (title) => (feria && section(feria, title)) || section(texts, title);
  // the translation of those parts: the translated office of the day when it has the same
  // short reading as the Latin sung (the saint's or common's, or the weekday's), else the
  // translated psalter's weekday (scripts/texts/psalter_translations.mjs) when the Latin sings
  // the weekday's: so both choices of the setting "Memorials" are translated
  const partsRef = latinReadingRef(feria || texts, hour);
  const partsTr = (T) => {
    if (sameReading(partsRef, T.own.reading?.ref)) return { ...T, same: true };
    const ps = feria && hourTranslation(state.trPsalter?.[T.lang]?.[`${day.psalter}-${day.dow}`], hour, partsRef);
    if (ps?.same) return { ...T, own: ps.own, same: true };
    return feria ? { ...T, same: false } : T;
  };

  // Short reading, responsory
  let lb = part('LECTIO BREVIS');
  // In the Triduum and the octave of Easter an antiphon takes the responsory's place (OCO pp.
  // 242-263: Christus factus est, longer each day, then Hæc dies); iBreviary prints it at
  // the foot of the reading
  const locoAt = lb ? lb.blocks.findIndex(isLoco) : -1;
  const locoText = locoAt >= 0 ? lb.blocks.slice(locoAt).find((b) => b.kind === 'antiphon')?.text : null;
  if (locoAt >= 0) lb = { ...lb, blocks: lb.blocks.slice(0, locoAt) };
  const inPlace = inPlaceAntiphon(propers._cel || day, hour);
  if (lb) { main.append(sectionHead('reading')); main.append(readingNode(lb.blocks)); eachTr((T) => appendTr(main, T.own.reading?.lines), { map: partsTr }); }
  if (inPlace || locoText) {
    main.append(sectionHead('antiphon'));
    main.append(el('<p class="rubric">Loco responsorii dicitur:</p>'));
    main.append(await chantNode(inPlace?.gabc, { annotation: inPlace?.mode, fallbackText: inPlace?.text || locoText }));
    eachTr((T) => { const t = sungTr(inPlace?.text || locoText, null, null, { shared: false }); if (t) main.append(trP(T.lang, esc(t))); return !!t; });
  }
  // the short responsory is one piece of music: its score, or else the text
  const rb = entries.find((e) => e.kind !== 'reference' && (e.kind === 'resp_brevis' || /br\./.test(e.position || '')));
  const rbText = part('RESPONSORIUM BREVE');
  if (!inPlace && !locoText && (rb || rbText)) {
    main.append(sectionHead('responsory'));
    const node = rb?.gabc ? await chantNode(rb.gabc, { annotation: '' }) : null;
    if (node?.dataset.notated) main.append(node);
    else if (rbText) main.append(el(`<div class="block">${renderBlocks(rbText.blocks)}</div>`));
    eachTr(() => appendResponsoryTr(main, node?.dataset.notated ? rb : null, rbText), { map: partsTr });
  }

  // Gospel canticle
  const cant = byPosition(entries, hour === 'laudes' ? 'B' : 'M');
  const ce = section(texts, 'CANTICUM EVANGELICUM');
  main.append(sectionHead(hour === 'laudes' ? 'benedictus' : 'magnificat'));
  // without the day's own texts (beyond the window) the printed antiphon is the psalter
  // day's: right on a weekday of Ordinary Time, another day's on a Sunday or in a season,
  // where it is not shown in place of the proper one the OCO could not give
  const own = hasOwnTexts(date, hour) || state.psalterium[`${day.psalter}-${day.dow}`]?.date === date;
  const psalterAnt = own || (day.dow !== 0 && (propers._cel || day).seasons?.includes('ORDINARY_TIME'));
  await appendGospelCanticle(main, cant, ce, { solemn: true, printed: psalterAnt });

  // Intercessions, Pater noster (sung), collect, conclusion
  const cel = propers._cel || day;
  const preces = part('PRECES');
  if (preces) { main.append(sectionHead('preces')); main.append(precesNode(preces.blocks, (state.trs || []).map(partsTr).filter((T) => T.same && T.own.preces?.length).map((T) => ({ lang: T.lang, lines: T.own.preces })))); }
  if (section(texts, 'PATER NOSTER')) {
    main.append(sectionHead('pater'));
    main.append(await chantNode(PATER_NOSTER, { annotation: '' }));
  }
  const or = section(texts, 'ORATIO');
  if (or) { main.append(sectionHead('oratio')); main.append(await conclusionNode(or.blocks, cel, hour, { first: propers._first, trFor: (T) => (T.same ? T.own.oratio : null) })); }
}

/**
 * A Gospel canticle between its antiphons, the antiphon's translation under the first (when
 * the translated office is the same; Compline's always is) and the canticle's verse by verse.
 */
async function appendGospelCanticle(main, ant, ce, { solemn = false, proper = true, printed = true } = {}) {
  const ceAnt = printed ? ce?.blocks.find((b) => b.kind === 'antiphon')?.text : null;
  const trAnt = [];
  eachTr((T) => { const t = sungTr(ant?.text, ceAnt, T.own.gospel?.ant, { shared: !proper || T.same }); if (t) trAnt.push(trP(T.lang, esc(t))); return !!t; });
  const trFor = () => (state.trs || []).filter((T) => T.own.gospel?.lines?.length).map((T) => ({ lang: T.lang, lines: T.own.gospel.lines }));
  const canticle = ce ? [psalmodyNode(canticleBlocks(ce.blocks.filter((b) => b.kind !== 'antiphon' && b.kind !== 'rubric')), await toneFor(ant),
    { canticle: true, solemn, trFor })] : [];
  if (!ant && !ceAnt) { main.append(...canticle); return; } // no antiphon known: the canticle alone
  const first = await antiphonNode(ant, ceAnt, { custos: firstNoteOf(canticle[0]) });
  main.append(...keyed(first, ...canticle, await antiphonNode(ant, ceAnt)));
  first.after(...trAnt);
}

/**
 * Intercessions: the introduction with its response, then each intention as one line,
 * its two halves joined by a red dash.
 */
function precesNode(blocks, trList = []) {
  const node = el('<div class="block preces"></div>');
  const html = (b) => b.lines.map((l) => (typeof l === 'string' ? esc(l) : `<i>${esc(l.text)}</i>`)).join(' ');
  // `trList`: [{ lang, lines }], each translation's (the first only, in fallback mode); each
  // under every intention when they are as many, else after them all
  const latinPairs = blocks.filter((b, k) => b.kind === 'text' && blocks[k + 1]?.kind === 'rubric' && blocks[k + 1].text === '—').length;
  const trs = (state.trMode === 'fallback' ? trList.slice(0, 1) : trList).map(({ lang, lines }) => {
    const P = precesParts(lines);
    return { lang, lines, P, each: P.pairs.length === latinPairs, intro: false };
  });
  let i = 0;
  // sung on the Antiphonale Romanum II's tone (setting "Intercessions"): the introduction with
  // its response, then each intention followed by the response; or, abbreviated as the book
  // writes its tones, the introduction and response in full, each intention with only its
  // start and cadences notated and ℟. for the response
  const sung = (state.settings.precesTone || 'ar') !== 'text';
  const intention = state.settings.precesTone === 'abbr' ? intentionAbbrGabc : intentionGabc;
  let sungIntro = false;
  const plain = (b) => b.lines.filter((l) => typeof l === 'string').join(' ').trim();
  const response = (blocks.find((b) => b.kind === 'text')?.lines.find((l) => typeof l !== 'string')?.text || '').trim();
  const score = (gabc) => chantFromGabc(gabc, { dropCap: false, source: RECITATION_SOURCE.preces });
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    if (b.kind === 'text' && blocks[k + 1]?.kind === 'rubric' && blocks[k + 1].text === '—' && blocks[k + 2]?.kind === 'text') {
      if (sung) node.append(score(intention(plain(b), plain(blocks[k + 2]), response)));
      else node.insertAdjacentHTML('beforeend', `<p class="intention">${html(b)}<br><span class="r">—</span> ${html(blocks[k + 2])}</p>`);
      for (const t of trs) if (t.each) { const [a, z] = t.P.pairs[i]; node.append(trP(t.lang, `${esc(a)}<br><span class="r">—</span> ${esc(z)}`, 'intention-tr')); }
      i++;
      k += 2;
    } else if (b.kind === 'text') {
      if (sung && !sungIntro && plain(b)) { node.append(score(precesIntroGabc(plain(b), response))); sungIntro = true; }
      else if (sung && plain(b)) node.append(score(intention(plain(b), '', '')));
      else node.insertAdjacentHTML('beforeend', `<p class="intro">${html(b)}</p>`);
      for (const t of trs) if (t.each && !t.intro && t.P.intro.length) { node.append(trP(t.lang, t.P.intro.map((l) => esc(l).replace(/^(領|眾)[：:]\s*/, '')).join('<br>'))); t.intro = true; }
    } else node.insertAdjacentHTML('beforeend', renderTextBlock(b));
  }
  for (const t of trs) if (!t.each) { const n = trNode(t.lang, t.lines); if (n) node.append(n); }
  return node;
}

/**
 * The collect and the conclusion of an hour. Lauds and Vespers: with a priest or deacon
 * presiding (an option), Dominus vobiscum and the blessing; otherwise Dominus nos
 * benedicat; then Benedicamus Domino of the day's rank (Antiphonale Romanum II). The
 * little hours and the Office of Readings end with Benedicamus Domino (AM 2005).
 */
async function conclusionNode(blocks, cel, hour, { first = false, trFor = null } = {}) {
  const node = el('<div class="block"></div>');
  const textOf = (b) => (b?.kind === 'text' ? b.lines.map((l) => (typeof l === 'string' ? l : l.text)).join(' ') : '');
  const major = hour === 'laudes' || hour === 'vesperae';
  // the collect and its Amen; iBreviary's rubrics and formulas of the conclusion are replaced
  const end = blocks.findIndex((b, k) => k > 0 && (b.kind === 'rubric' || /^(Dóminus vobíscum|Dóminus nos|Benedicámus Dómino)/.test(textOf(b))));
  node.append(collectNode(end < 0 ? blocks : blocks.slice(0, end), { tone: collectTone(cel, hour) }));
  // the collect's translation under it, before the blessing (Breviarium Gregorianum)
  if (trFor) eachTr((T) => { const lines = trFor(T); const t = lines?.length ? trNode(T.lang, lines) : null; if (t) node.append(t); return !!t; });
  if (!major) {
    if (blocks.some((b) => /^Benedicámus Dómino/.test(textOf(b)))) node.append(await chantNode(isFestive(cel) ? BENEDICAMUS_HORAE.festive : BENEDICAMUS_HORAE.ferial, { annotation: '' }));
    appendFidelium(node);
    return node;
  }
  if (state.settings.presider) node.append(await chantNode(DOMINUS_VOBISCUM, { annotation: '' }));
  else node.append(chantFromGabc(DOMINUS_NOS_BENEDICAT, { source: { label: 'AR II 763' } }));
  const dismissal = benedicamusFor(cel, first && hour === 'vesperae' ? 'vesperae1' : hour);
  node.append(typeof dismissal === 'string' ? chantFromGabc(dismissal, { source: { label: 'AR II 765' } }) : await chantNode(dismissal, { annotation: '' }));
  appendFidelium(node);
  return node;
}
/**
 * Without a priest or deacon: Dominus nos benedicat, AR II p. 763, on the collect's tone: the
 * metrum at "ma-lo de-fén-dat", the end falling to la ("æ-tér-nam"), Amen on do.
 */
const DOMINUS_NOS_BENEDICAT = '(c3) DO(h)mi(h)nus(h) nos(h) be(h)ne(h)dí(h)cat,(h) (,) et(h) ab(h) om(h)ni(h) ma(h)lo(g) de(f)fén(h)dat,(h) (;) et(h) ad(h) vi(h)tam(h) per(h)dú(h)cat(h) æ(h)tér(h)nam.(f) (::) <sp>R/</sp> A(h)men.(h) (::)';
function chantFromGabc(body, { dropCap = true, source = null } = {}) {
  const wrap = el('<div class="chant"><div class="score"></div></div>');
  layouts.push(renderChant(wrap.firstChild, body, { annotation: dropCap ? '' : null, dropCap, source }));
  wrap.dataset.notated = '1';
  return wrap;
}

// The versicles are sung on the common tones of the AM 2005 / AR II (site/recitation.js).
// Short readings and collects are sung by the settings "Short reading" and "Collect": on the
// Antiphonale Romanum II's tones (the default), on the Liber Usualis', or left as text; the
// readings of the Office of Readings stay text.
const readingStyle = () => state.settings.readingTone || 'ar'; // 'ar' | 'lu' | 'text'
const collectStyle = () => state.settings.collectTone || 'ar';
const blockText = (b) => (b?.kind === 'text' ? b.lines.map((l) => (typeof l === 'string' ? l : l.text)).join(' ') : '');
const recited = () => state.settings.recite !== 'text';
/** A short reading: its reference, then the reading on the lesson tone. */
function readingNode(blocks, { lesson = false } = {}) {
  const node = el('<div class="block"></div>');
  const text = blocks.filter((b) => b.kind === 'text').map(blockText).join(' ').trim();
  const deo = bonus('deoGratias');
  // the AR II's tone for the lessons; or the Liber Usualis' tone for the Chapter, at Compline
  // its tone for the short lesson (p. 123)
  const style = readingStyle();
  let gabc = !text || style === 'text' ? null : style === 'lu' ? chapterGabc(text, { lesson }) : readingGabc(text);
  if (!gabc) {
    node.insertAdjacentHTML('beforeend', renderBlocks(blocks));
    if (deo) node.insertAdjacentHTML('beforeend', '<p class="versicle"><span class="r">℟.</span> Deo grátias.</p>');
    return node;
  }
  // ℟. Deo grátias at the end of the score: on the Chapter's full stop, as the Liber Usualis
  // has it, or on the punctum of the AR II's lesson tone
  if (deo) gabc = gabc.replace(/\s*$/, style === 'lu' ? ' <sp>R/</sp> De(h)o(h) grá(f)ti(e)as.(ef..) (::)' : ' <sp>R/</sp> De(h)o(h) grá(h)ti(d)as.(d.) (::)');
  node.insertAdjacentHTML('beforeend', renderBlocks(blocks.filter((b) => b.kind !== 'text')));
  node.append(chantFromGabc(gabc, { dropCap: false, source: style === 'lu' ? RECITATION_SOURCE.chapter : RECITATION_SOURCE.lectio }));
  return node;
}
/**
 * A collect, with Orémus before it and Amen after when iBreviary gives them: on the AR II's
 * tone for the orations, or on the Liber Usualis' tone for the prayers that the hour and the
 * day call for (`tone`, see collectTone).
 */
function collectNode(blocks, { tone = 'simple' } = {}) {
  const node = el('<div class="block"></div>');
  const texts = blocks.filter((b) => b.kind === 'text');
  const oremus = /^Orémus\.?$/.test(blockText(texts[0]).trim());
  const text = texts.slice(oremus ? 1 : 0).map(blockText).join(' ').trim();
  const style = collectStyle();
  if (style === 'text' || !text) { node.insertAdjacentHTML('beforeend', renderBlocks(blocks)); return node; }
  const amen = blocks.some((b) => b.kind === 'versicle' && /^Amen/.test(b.text));
  node.insertAdjacentHTML('beforeend', renderBlocks(blocks.filter((b) => b.kind === 'rubric')));
  node.append(style === 'lu'
    ? chantFromGabc(luCollectGabc(text, { tone, oremus, amen }), { dropCap: false, source: RECITATION_SOURCE[tone] })
    : chantFromGabc(collectGabc(text, { oremus, amen }), { dropCap: false, source: RECITATION_SOURCE.oratio }));
  return node;
}
/**
 * The tone of the collect (Liber Usualis p. 124): on Sundays and feasts (and memorials, as
 * the feasts of the third class were) at the Office of Readings, Lauds and Vespers the
 * festal tone; at the little hours, at Compline and on ferias the ancient simple tone, which
 * the book allows for the first ferial tone (recto tono).
 */
function collectTone(cel, hour) {
  const major = hour === 'lectio' || hour === 'laudes' || hour === 'vesperae';
  return major && ['SUNDAY', 'SOLEMNITY', 'FEAST', 'MEMORIAL'].includes(cel?.rank) ? 'festal' : 'simple';
}
// ------------------------------------------------------------------ translations
// English under the Latin (setting "Translation", beta), as Breviarium Gregorianum lays it
// out. Chinese is built too but not offered yet.
const TRANSLATIONS = true;
// the setting "Translation": its values and the translations each lays out, in order
const TRANSLATION_MODES = {
  zh: { langs: ['zh'] },
  en: { langs: ['en'] },
  'zh+en': { langs: ['zh', 'en'] },
  'zh>en': { langs: ['zh', 'en'], fallback: true }, // English only where Hong Kong's gives none
};
/** The words of an antiphon as sung: without the OCO's notes after it ("E u o u a e", ⟨T.P.⟩ additions, sources). */
const cleanSung = (t) => String(t || '').replace(/\s*E u o u a e\.?[\s\S]*$/, '').replace(/\s*⟨[^⟩]*⟩[\s\S]*$/, '').replace(/\s*†\s*$/, '').trim();
/**
 * The translation of an antiphon (or responsory) sung from the OCO: iBreviary's (`english`,
 * the Liturgia Horarum's) when the text sung is the one it translates, that is the same words
 * as iBreviary's Latin (`printed`) in an office iBreviary's English shares (`shared`); else the
 * app's own (data/translations/en.json). Texts with neither are noted in window.__trMissing,
 * for scripts/texts/missing_translations.cjs.
 */
function sungTr(sung, printed, english, { shared = true } = {}) {
  const T = state.tr;
  if (!T) return null;
  const latin = cleanSung(sung || printed);
  if (english && shared && (!sung || !printed || sameWords(sung, printed))) return english;
  const own = T.lang === 'en' ? state.ownEn?.[ownKey(latin)] : null; // the app's own: English only
  if (own) return own;
  if (latin) (window.__trMissing ||= new Set()).add(latin);
  return null;
}
/**
 * The short responsory's translation: iBreviary's English when the responsory sung (`rb`, the
 * OCO's) is iBreviary's own, else the app's own translation of the one sung.
 */
function appendResponsoryTr(main, rb, rbText) {
  const T = state.tr;
  if (!T) return false;
  const printed = (rbText?.blocks || []).map((b) => (b.kind === 'versicle' ? b.text : b.kind === 'text' ? b.lines.map((l) => (typeof l === 'string' ? l : l.text)).join(' ') : '')).join(' ');
  const sung = cleanSung(rb?.text?.replace(/℣\.|℟\./g, ' ').replace(/Glória Patri.*$/, ''));
  if (!sung || !printed || sameWords(sung, printed)) return appendTr(main, T.own.responsory);
  const own = T.lang === 'en' ? state.ownEn?.[ownKey(sung)] : null;
  if (own) { const node = trNode(T.lang, own.split('\n')); if (node) main.append(node); return !!node; }
  (window.__trMissing ||= new Set()).add(sung);
  return false;
}
/** Append a translation (site/translate.js) when one is chosen; `proper`: only when it is the same office. */
function appendTr(main, lines, { proper = true, head = null, fold = false } = {}) {
  const T = state.tr;
  if (!T || (proper && !T.same)) return false;
  const node = trNode(T.lang, lines, { head, fold });
  if (node) main.append(node);
  return !!node;
}
/**
 * Lay out each translation chosen (`state.trs`, Chinese first) with `fn(T)`, `state.tr` set
 * to it (or to `map(T)`): all of them, or in the mode "Chinese, else English" (`trMode`
 * 'fallback') the next only where `fn` gave nothing; `all`: every one whatever the mode (to
 * keep their places in the psalms). Returns whether any gave something.
 */
function eachTr(fn, { all = false, map = null } = {}) {
  const was = state.tr;
  let any = false;
  try {
    for (const T0 of state.trs || []) {
      if (any && !all && state.trMode === 'fallback') break;
      const T = map ? map(T0) : T0;
      state.tr = T;
      if (fn(T)) any = true;
    }
  } finally { state.tr = was; }
  return any;
}
/** The translations of an antiphon after its score `before` (`textFor(T)`: the text, or null). */
function afterAntiphon(before, textFor) {
  const ps = [];
  eachTr((T) => { const t = textFor(T); if (t) ps.push(trP(T.lang, esc(t))); return !!t; });
  before.after(...ps);
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
  const at = T.at++;
  const num = (x) => psalmNumber(x?.ref, T.lang);
  const want = head.ref ? psalmNumber(head.ref, 'la') : null;
  const same = (x) => {
    if (!x) return false;
    if (!head.ref) return T.prev !== null && !num(x); // a part: "II", "貳"
    if (want === 'c' || num(x) === 'c') {
      const a = chapterVerse(head.ref), b = chapterVerse(x.ref);
      return want === num(x) && (!a || !b || a === b);
    }
    return want !== null && want === num(x);
  };
  let p = same(list[at]) ? list[at] : null;
  if (!p && head.ref && want !== 'c' && want !== null) p = list.find((x) => num(x) === want) || null;
  if (head.ref) T.prev = p;
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
/**
 * A versicle sung: on Sundays, solemnities, feasts and memorials (the old feasts) the Liber
 * Usualis' ornate first tone, otherwise the simple one (AM 2005 p. 532, the LU's second tone).
 */
function versicleNode(b) {
  if (!recited() || !b.text) return el(`<div class="block">${renderTextBlock(b)}</div>`);
  const festive = ['SUNDAY', 'SOLEMNITY', 'FEAST', 'MEMORIAL'].includes(state.rank);
  return chantFromGabc(versicleGabc(b.text, b.r, { festive }), { dropCap: false, source: festive ? RECITATION_SOURCE.versicleFestive : RECITATION_SOURCE.versicle });
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
/**
 * The dismissal of Lauds ("laudes"), I Vespers ("vesperae1") or Vespers: a GregoBase id, or
 * the GABC of the one the AR II has that GregoBase lacks.
 */
function benedicamusFor(cel, hour) {
  const r = rankOf(cel);
  const id = cel.id || '';
  const at = (set) => set[hour] || set.vesperae;
  if (EASTER_OCTAVE.test(id) || id === 'pentecost_sunday') return BENEDICAMUS.paschal;
  if (r === 'major') return at(BENEDICAMUS.major);
  if ((r === 'solemnity' || r === 'feast') && MARIAN_FEAST.test(id)) return BENEDICAMUS.marian;
  if (cel.seasons?.includes('CHRISTMAS_TIME') && (r !== 'ferial' || /^christmas_octave/.test(id))) return BENEDICAMUS.christmas;
  if (r === 'solemnity') return at(BENEDICAMUS.solemnity);
  if (r === 'feast') return BENEDICAMUS.feast;
  if (r === 'sunday') {
    if (cel.seasons?.some((x) => x === 'ADVENT' || x === 'LENT' || x === 'HOLY_WEEK')) return BENEDICAMUS.sundayAdventLent;
    if (cel.seasons?.includes('EASTER_TIME')) return BENEDICAMUS_PASCHAE;
    return BENEDICAMUS.sunday;
  }
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
  // solemnities and the days of the octaves say Sunday's Compline, after I or II Vespers:
  // the psalms the day's texts give tell which (Ps 4 and 133, or Ps 90)
  const said = (section(texts, 'PSALMODIA')?.blocks || []).filter((b) => b.kind === 'psalm').map((b) => b.ref || '').join(' ');
  const form = /Psalmus 90\b/.test(said) ? 0 : /Psalmus 133\b/.test(said) ? 6 : day.dow;
  const entries = withPropers(ocoCompline({ ...day, dow: form }, hour), propers);
  if (!entries.length && !texts) { main.append(el(`<p class="empty">${t('msg.notYet')}</p>`)); return; }
  const cel = propers._cel || day;
  const paschal = cel.seasons?.includes('EASTER_TIME');

  main.append(hourTitle(hour, slot, propers));
  await appendOpening(main, day, hour, propers);
  // iBreviary's opening section: only its rubric (the examination of conscience) is kept
  const opening = texts?.find((s) => s.title && /^Completorium$/i.test(s.title));
  for (const b of opening?.blocks || []) if (b.kind === 'rubric') main.insertAdjacentHTML('beforeend', renderTextBlock(b));

  const otHymn = !propers.H && cel.seasons?.includes('ORDINARY_TIME') ? complineHymnPerAnnum(day, cel) : null;
  await appendHymn(main, otHymn || withScore(entries.find((e) => e.kind === 'hymn')), otHymn ? null : hymnTextNode(texts));
  // Eastertide: the one antiphon Alleluia over the psalmody, two psalms or one
  await appendPsalmody(main, entries.filter((e) => e.kind !== 'reference'), section(texts, 'PSALMODIA'), { single: propers['1']?.alleluia ? byPosition(entries, '1') : null });

  const lb = section(texts, 'LECTIO BREVIS');
  // (without the antiphon iBreviary prints under it in the Triduum and the octave: sung below)
  const lbBlocks = lb && lb.blocks.some(isLoco) ? lb.blocks.slice(0, lb.blocks.findIndex(isLoco)) : lb?.blocks;
  if (lb) { main.append(sectionHead('reading')); main.append(readingNode(lbBlocks, { lesson: true })); eachTr((T) => appendTr(main, T.own.reading?.lines)); }

  // In the Triduum and the octave of Easter an antiphon takes the responsory's place (OCO pp.
  // 242, 250, 257, 264): Christus factus est, longer each day, then Hæc dies
  const inPlace = complineAntiphon(day);
  if (inPlace) {
    main.append(sectionHead('antiphon'));
    main.append(el('<p class="rubric">Loco responsorii dicitur:</p>'));
    const node = await chantNode(inPlace.gabc, { annotation: inPlace.mode, fallbackText: inPlace.text });
    main.append(node);
    eachTr((T) => { const t = sungTr(inPlace.text, null, null, { shared: false }); if (t) main.append(trP(T.lang, esc(t))); return !!t; });
  }
  // In manus tuas: the OCO's score (with its alleluias in Eastertide), else the text
  const rbs = entries.filter((e) => e.kind !== 'reference' && e.gabc && /^In manus tuas/.test(e.text || ''));
  const rb = rbs.find((e) => /allel[uú]ia/i.test(e.text) === paschal) || rbs[0];
  const rbText = section(texts, 'RESPONSORIUM BREVE');
  if (!inPlace && (rb || rbText)) {
    main.append(sectionHead('responsory'));
    const node = rb ? await chantNode(rb.gabc, { annotation: '' }) : null;
    if (node?.dataset.notated) main.append(node);
    else if (rbText) main.append(el(`<div class="block">${renderBlocks(responsoryBlocks(rbText.blocks))}</div>`));
    eachTr((T) => appendTr(main, T.own.responsory));
  }

  const ce = section(texts, 'CANTICUM EVANGELICUM');
  const nunc = entries.find((e) => (e.position || '').startsWith('Nunc') && e.kind !== 'reference');
  main.append(sectionHead('nunc'));
  await appendGospelCanticle(main, nunc, ce, { proper: false });

  // the collect (as text), then the blessing and the antiphon of Our Lady, sung
  const or = section(texts, 'ORATIO');
  if (or) {
    main.append(sectionHead('oratio'));
    const text = (b) => (b.kind === 'text' ? b.lines.map((l) => (typeof l === 'string' ? l : l.text)).join(' ') : '');
    const end = or.blocks.findIndex((b) => /^Noctem/.test(text(b)) || (b.kind === 'rubric' && /Mariam|antiphon/i.test(b.text)));
    main.append(collectNode(end < 0 ? or.blocks : or.blocks.slice(0, end), { tone: 'simple' }));
    eachTr((T) => appendTr(main, T.own.oratio, { proper: false }));
  }
  main.append(sectionHead('blessing'));
  main.append(await chantNode(NOCTEM_QUIETAM, { annotation: '' }));
  const marian = bonus('marianCalendar') ? marianTraditional(date) : marianAntiphon(cel, date);
  if (!marian) { // the traditional Triduum has none
    main.append(el('<p class="rubric bonus-note">In Triduo sacro antiphona B. Mariæ Virginis non dicitur.</p>'));
    return;
  }
  main.append(sectionHead('marian'));
  main.append(await chantNode(MARIAN[marian], { annotation: '' }));
  if (bonus('marianPrayer')) appendMarianPrayer(main, marian, date);
}
const NOCTEM_QUIETAM = 20685;
/**
 * The hymn of Compline in Ordinary Time (OCO index; Liber Hymnarius pp. 241-244): Te lucis in
 * psalter weeks I and III, Christe qui splendor in weeks II and IV, each with its melody for
 * ferias, memorials, feasts, Sundays (after I and II Vespers) and solemnities. Saturday
 * evening is the Sunday's Compline, of the next week.
 */
const COMPLINE_HYMNS = {
  te: { title: 'Te lucis ante terminum', fer: 4680, mem: 4681, fest: 4682, dom: 4677, soll: 4683 },
  christe: { title: 'Christe qui splendor et dies', fer: 7519, mem: 7518, fest: 7517, dom: 7515, soll: 16706 },
};
function complineHymnPerAnnum(day, cel) {
  const week = day.dow === 6 ? (day.psalter % 4) + 1 : day.psalter;
  const form = cel.rank === 'SOLEMNITY' ? 'soll' : day.dow === 6 || day.dow === 0 ? 'dom'
    : cel.rank === 'FEAST' ? 'fest' : cel.rank === 'MEMORIAL' && isSanctoral(cel) ? 'mem' : 'fer';
  const h = COMPLINE_HYMNS[week % 2 ? 'te' : 'christe'];
  return { kind: 'hymn', title: h.title, gabc: h[form] };
}
// the antiphon in place of the responsory at Compline (OCO entries, read from its notation)
const COMPLINE_IN_PLACE = { holy_thursday: 620, thursday_of_the_lords_supper: 620, friday_of_the_passion_of_the_lord: 645, holy_saturday: 667 };
const EASTER_OCTAVE = /^(easter_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)|divine_mercy_sunday)$/;
/** iBreviary's rubric over that antiphon, at the foot of the reading ("Loco aresponsorii" on Holy Thursday). */
const isLoco = (b) => b.kind === 'rubric' && /^Loco \w*responsorii/i.test(b.text);
/** The same at Lauds and Vespers: the OCO's entries, which stand there as the short responsory. */
const IN_PLACE = {
  holy_thursday: { vesperae: 617 }, thursday_of_the_lords_supper: { vesperae: 617 },
  friday_of_the_passion_of_the_lord: { laudes: 630, vesperae: 642 }, holy_saturday: { laudes: 655, vesperae: 664 },
};
function inPlaceAntiphon(day, hour) {
  const oco = IN_PLACE[day.id]?.[hour] || (EASTER_OCTAVE.test(day.id) ? { laudes: 673, vesperae: 685 }[hour] : null);
  return oco ? state.oco.find((e) => e.id === oco) : null;
}
function complineAntiphon(day) {
  const oco = COMPLINE_IN_PLACE[day.id] || (EASTER_OCTAVE.test(day.id) ? 689 : null);
  return oco ? state.oco.find((e) => e.id === oco) : null;
}
// Antiphonale Monasticum 2005: Alma (p. 472), Ave Regina (p. 474), Regina cæli (p. 475), Salve Regina, simple tone (p. 477)
const MARIAN = { alma: 4694, ave: 18754, regina: 18753, salve: 18655 };
/**
 * The antiphon of Our Lady by the seasons of the calendar: Regina cæli in Eastertide (which
 * the Liturgia Horarum prescribes), Alma Redemptoris in Advent and Christmastide, Ave Regina
 * in Lent and the Triduum, Salve Regina in Ordinary Time.
 */
function marianAntiphon(cel) {
  const s = cel.seasons || [];
  if (s.includes('EASTER_TIME')) return 'regina';
  if (s.includes('ADVENT') || s.includes('CHRISTMAS_TIME')) return 'alma';
  if (s.includes('LENT') || s.includes('HOLY_WEEK') || s.includes('PASCHAL_TRIDUUM')) return 'ave';
  return 'salve';
}
/**
 * The same by the older Roman Breviary (rubrics of 1960): Alma Redemptoris from Compline of
 * the Saturday before Advent until 1 February (Christmastide and the weeks after it), Ave
 * Regina from Compline of 2 February until Wednesday of Holy Week, none in the Triduum,
 * Regina cæli from Easter until the Friday after Pentecost, Salve Regina from Compline of
 * the Saturday after Pentecost (I Vespers of the Trinity) until the Friday before Advent.
 * `date` is the day whose Compline it is.
 */
function marianTraditional(date) {
  const t = Date.parse(`${date}T12:00:00Z`), day = 864e5;
  const y = Number(date.slice(0, 4));
  const easter = easterOf(y);
  const advent1 = (() => { const xmas = Date.UTC(y, 11, 25, 12); const dow = new Date(xmas).getUTCDay(); return xmas - ((dow || 7) + 21) * day; })();
  const feb2 = Date.UTC(y, 1, 2, 12);
  if (t >= advent1 - day || t < feb2) return 'alma';
  if (t < easter - 3 * day) return 'ave'; // to Wednesday of Holy Week
  if (t < easter) return null; // Holy Thursday, Good Friday, Holy Saturday
  if (t < easter + 55 * day) return 'regina'; // to the Friday after Pentecost
  return 'salve';
}
/** Easter Sunday of year `y` (Gregorian; Meeus/Jones/Butcher), as a UTC noon timestamp. */
function easterOf(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), dayOf = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, dayOf, 12);
}

// ------------------------------------------------------------------ mutual enrichment
// Customs of the older Roman Office the user may add (settings, "Mutual enrichment"): each
// off unless ticked, so not marked in the office.
const BONUS = {
  fidelium: 'Fidelium animæ at the end of the hours (not Compline)',
  marianPrayer: 'After the antiphon of Our Lady: its versicle, collect and Divinum auxilium',
  marianCalendar: 'The antiphon of Our Lady by the traditional calendar',
  deoGratias: '℟. Deo gratias after the short reading',
};
const bonus = (k) => !!state.settings.bonus?.[k];
// the Hong Kong flag's red and white, with a little gold
const HK_COLOURS = ['#de2910', '#ffffff', '#de2910', '#ffffff', '#f4d03f', '#ff6b5b'];
/** A visit from Hong Kong: its time zone, or a browser set to Hong Kong Chinese. */
function inHongKong() {
  try { if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Hong_Kong') return true; } catch {}
  return (navigator.languages || [navigator.language]).some((l) => /^zh-(HK|Hant-HK)$/i.test(l || ''));
}
/** "Mutual enrichment": the older customs, ticked in their own small window (in the interface's language). */
function fillBonus() {
  $('#bonus-list').replaceChildren(...Object.keys(BONUS).map((k) => {
    const row = el(`<label class="bonus-row"><input type="checkbox" data-bonus="${k}"> <span>${esc(t(`bonus.${k}`))}</span></label>`);
    const cb = row.querySelector('input');
    cb.checked = bonus(k);
    cb.onchange = () => {
      const b = { ...(state.settings.bonus || {}) };
      if (cb.checked) b[k] = true; else delete b[k];
      state.settings.bonus = Object.keys(b).length ? b : undefined;
      saveSettings(); render();
      if (cb.checked) { const r = cb.getBoundingClientRect(); pixelBurst(r.left + r.width / 2, r.top + r.height / 2, Object.keys(b).length); }
    };
    return row;
  }));
}
// both recto tono, as the Liber Usualis has Divinum auxilium (p. 277: "said recto tono in a low voice")
const FIDELIUM = "(c3) <sp>V/</sp> Fi(e)dé(e)li(e)um(e) á(e)ni(e)mæ(e) per(e) mi(e)se(e)ri(e)cór(e)di(e)am(e) De(e)i(e) re(e)quí(e)e(e)scant(e) in(e) pa(e)ce.(e) (::) <sp>R/</sp> A(e.)men.(e.) (::)";
const DIVINUM_AUXILIUM = "(c3) <sp>V/</sp> Di(e)ví(e)num(e) au(e)xí(e)li(e)um(e) má(e)ne(e)at(e) sem(e)per(e) no(e)bís(e)cum.(e) (::) <sp>R/</sp> A(e.)men.(e.) (::)";
/**
 * A little explosion of pixels from (x, y), the bigger the more bonus options are ticked:
 * one a puff, all of them a fireworks. Nothing when the reader prefers less motion.
 */
function pixelBurst(x, y, power = 1, colours = ['var(--rubric)', '#e8b923', '#f4e3a1', '#c0392b', '#ffffff', '#7a4fd0']) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const n = 8 + power * power * 6, reach = 30 + power * 28;
  const host = document.querySelector('dialog[open]') || document.body;
  const box = el('<div class="pixel-burst" aria-hidden="true"></div>');
  const hr = host === document.body ? { left: 0, top: 0 } : host.getBoundingClientRect();
  box.style.left = `${x - hr.left}px`; box.style.top = `${y - hr.top}px`;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = reach * (0.35 + Math.random() * 0.65);
    const p = document.createElement('i');
    const size = 3 + Math.floor(Math.random() * (2 + power));
    p.style.cssText = `--dx:${Math.round(Math.cos(a) * d / 3) * 3}px;--dy:${Math.round(Math.sin(a) * d / 3) * 3}px;width:${size}px;height:${size}px;background:${colours[i % colours.length]};animation-duration:${420 + power * 120 + Math.random() * 300}ms`;
    box.append(p);
  }
  host.append(box);
  setTimeout(() => box.remove(), 1400 + power * 150);
}
function appendFidelium(node) {
  if (!bonus('fidelium')) return;
  node.append(chantFromGabc(FIDELIUM, { dropCap: false, source: { label: 'recto tono' } }));
  // the app's own English: no Chinese is shown that is not the Hong Kong office's
  eachTr((T) => T.lang === 'en' && appendTr(node, ['May the souls of the faithful departed, through the mercy of God, rest in peace.', '— Amen.'], { proper: false }));
}
/** The versicle and collect of each antiphon of Our Lady (Breviarium Romanum), Divinum auxilium after. */
const MARIAN_PRAYER = {
  alma: {
    v: 'Ángelus Dómini nuntiávit Maríæ.', r: 'Et concépit de Spíritu Sancto.',
    oratio: 'Grátiam tuam, quǽsumus, Dómine, méntibus nostris infúnde: ut qui, Ángelo nuntiánte, Christi Fílii tui incarnatiónem cognóvimus, per passiónem eius et crucem ad resurrectiónis glóriam perducámur. Per eúndem Christum Dóminum nostrum.',
    en: ['The Angel of the Lord declared unto Mary.', '— And she conceived of the Holy Spirit.', 'Let us pray. Pour forth, we beseech you, O Lord, your grace into our hearts, that we, to whom the incarnation of Christ your Son was made known by the message of an Angel, may by his passion and cross be brought to the glory of his resurrection. Through the same Christ our Lord. Amen.'],
  },
  almaNat: { // from Christmas to 2 February
    v: 'Post partum, Virgo, invioláta permansísti.', r: 'Dei Génetrix, intercéde pro nobis.',
    oratio: 'Deus, qui salútis ætérnæ, beátæ Maríæ virginitáte fecúnda, humáno géneri prǽmia præstitísti: tríbue, quǽsumus, ut ipsam pro nobis intercédere sentiámus, per quam merúimus auctórem vitæ suscípere, Dóminum nostrum Iesum Christum, Fílium tuum.',
    en: ['After childbirth, O Virgin, you remained inviolate.', '— Mother of God, intercede for us.', 'Let us pray. O God, who by the fruitful virginity of blessed Mary bestowed on the human race the rewards of eternal salvation, grant, we pray, that we may know her intercession for us, through whom we were found worthy to receive the author of life, our Lord Jesus Christ, your Son. Amen.'],
  },
  ave: {
    v: 'Dignáre me laudáre te, Virgo sacráta.', r: 'Da mihi virtútem contra hostes tuos.',
    oratio: 'Concéde, miséricors Deus, fragilitáti nostræ præsídium: ut, qui sanctæ Dei Genetrícis memóriam ágimus, intercessiónis eius auxílio a nostris iniquitátibus resurgámus. Per eúndem Christum Dóminum nostrum.',
    en: ['Grant that I may praise you, O holy Virgin.', '— Give me strength against your enemies.', 'Let us pray. Grant, O merciful God, protection to our frailty, that we who keep the memory of the holy Mother of God may, by the help of her intercession, rise again from our iniquities. Through the same Christ our Lord. Amen.'],
  },
  regina: {
    v: 'Gaude et lætáre, Virgo María, allelúia.', r: 'Quia surréxit Dóminus vere, allelúia.',
    oratio: 'Deus, qui per resurrectiónem Fílii tui, Dómini nostri Iesu Christi, mundum lætificáre dignátus es: præsta, quǽsumus, ut, per eius Genetrícem Vírginem Maríam, perpétuæ capiámus gáudia vitæ. Per eúndem Christum Dóminum nostrum.',
    en: ['Rejoice and be glad, O Virgin Mary, alleluia.', '— For the Lord is truly risen, alleluia.', 'Let us pray. O God, who gave joy to the world through the resurrection of your Son, our Lord Jesus Christ, grant, we pray, that through his Mother, the Virgin Mary, we may obtain the joys of everlasting life. Through the same Christ our Lord. Amen.'],
  },
  salve: {
    v: 'Ora pro nobis, sancta Dei Génetrix.', r: 'Ut digni efficiámur promissiónibus Christi.',
    oratio: 'Omnípotens sempitérne Deus, qui gloriósæ Vírginis Matris Maríæ corpus et ánimam, ut dignum Fílii tui habitáculum éffici mererétur, Spíritu Sancto cooperánte, præparásti: da, ut cuius commemoratióne lætámur, eius pia intercessióne ab instántibus malis et a morte perpétua liberémur. Per eúndem Christum Dóminum nostrum.',
    en: ['Pray for us, O holy Mother of God.', '— That we may be made worthy of the promises of Christ.', 'Let us pray. Almighty and everlasting God, who by the working of the Holy Spirit prepared the body and soul of the glorious Virgin Mother Mary to become a worthy dwelling for your Son, grant that we who rejoice in her commemoration may by her loving intercession be delivered from present evils and from everlasting death. Through the same Christ our Lord. Amen.'],
  },
};
function appendMarianPrayer(main, marian, date) {
  const md = date.slice(5);
  // the Alma's versicle changes at Christmas: Advent's until Compline of 23 December, Christmastide's from I Vespers of Christmas
  const key = marian === 'alma' && (md >= '12-24' || md < '06-01') ? 'almaNat' : marian;
  const p = MARIAN_PRAYER[key];
  main.append(chantFromGabc(versicleGabc(p.v, p.r), { dropCap: false, source: RECITATION_SOURCE.versicle }));
  // the prayers after the antiphons of Our Lady: the second ferial tone (Liber Usualis p. 124),
  // or the AR II's tone for the orations
  main.append(collectStyle() === 'lu'
    ? chantFromGabc(luCollectGabc(p.oratio, { tone: 'ferialB', oremus: true, amen: true }), { dropCap: false, source: RECITATION_SOURCE.ferialB })
    : chantFromGabc(collectGabc(p.oratio, { oremus: true, amen: true }), { dropCap: false, source: RECITATION_SOURCE.oratio }));
  main.append(chantFromGabc(DIVINUM_AUXILIUM, { dropCap: false, source: { label: 'LU 277' } }));
  eachTr((T) => T.lang === 'en' && appendTr(main, [...p.en, 'May the divine assistance remain with us always. — Amen.'], { proper: false }));
}

async function render() {
  // the Antiphonale Romanum II's alternative melody of Pange lingua, the old Vatican edition's
  // (appendix p. 773; GregoBase 1310, Liber Usualis p. 957), for the Liber Hymnarius' (8671)
  setGabcAliases(state.settings.pangeLingua === 'vaticana' ? { 8671: 1310 } : {});
  const main = $('#office');
  const run = ++renderRun; // a later render (a quick change of hour or setting) takes over
  main.replaceChildren(el(`<p class="loading">${esc(t('msg.loading'))}</p>`));
  $('#hours-nav')?.replaceChildren();
  layouts.length = 0;
  const days = await calendarFor(state.date);
  const day = days[0];
  $('#hour').value = state.hour;
  $('#date').value = state.date;
  document.title = `${hourName(state.hour)} · ${day ? capitalize(day.name) : state.date} · Cantus Horarum`;
  const at = `${state.date}/${state.hour}`;
  if (location.hash !== `#${at}`) location.hash = at;
  if (!day) { main.replaceChildren(el(`<p class="empty">${t('msg.noCalendar')}</p>`)); return; }
  const frag = await composeHour(day);
  if (run !== renderRun) return;
  main.replaceChildren(...frag.childNodes);
  layouts.forEach((f) => f());
  // another hour or day: from its beginning (a change of setting keeps the place)
  if (shownAt && shownAt !== at) window.scrollTo(0, 0);
  shownAt = at;
  hoursNav();
  showPageCount(); // the settings open: their page count follows the hour and the settings
}
let renderRun = 0, shownAt = null;
/** At the foot of the hour: the hour before and the hour after (Compline leads to the morrow's first hour). */
function hoursNav() {
  const nav = $('#hours-nav');
  if (!nav) return;
  const i = HOURS.indexOf(state.hour);
  const link = (date, hour, back) => {
    const other = date !== state.date ? ` · ${new Date(`${date}T12:00:00`).toLocaleDateString(uiLang() === 'zh' ? 'zh-HK' : uiLang() === 'la' ? 'en-GB' : undefined, { day: 'numeric', month: 'short' })}` : '';
    const name = `${esc(hourName(hour))}${esc(other)}`;
    return `<a href="#${date}/${hour}" class="${back ? 'prev' : 'next'}">${back ? `<span aria-hidden="true">‹</span> ${name}` : `${name} <span aria-hidden="true">›</span>`}</a>`;
  };
  const prev = i > 0 ? link(state.date, HOURS[i - 1], true) : link(addDays(state.date, -1), HOURS[HOURS.length - 1], true);
  const next = i < HOURS.length - 1 ? link(state.date, HOURS[i + 1], false) : link(addDays(state.date, 1), HOURS[0], false);
  nav.innerHTML = prev + next;
}

/** The chosen hour of the chosen date, composed into a detached container (its scores laid out once placed). */
async function composeHour(day) {
  const frag = document.createElement('div');
  state.tr = null; state.trs = [];
  state.rank = day.rank; // the day's rank, for the versicle's tone
  const mode = TRANSLATIONS ? TRANSLATION_MODES[state.settings.translation] : null;
  if (mode) {
    // the app's own translations are English only: Chinese is the Hong Kong office's alone
    const [days, psalters, ownEn] = await Promise.all([
      Promise.all(mode.langs.map((l) => loadTranslation(l, state.date))),
      Promise.all(mode.langs.map((l) => loadTranslation(l, 'psalter'))),
      mode.langs.includes('en') ? loadOwn('en') : null]);
    state.ownEn = ownEn;
    state.trPsalter = Object.fromEntries(mode.langs.map((l, i) => [l, psalters[i]]));
    state.trMode = mode.fallback ? 'fallback' : 'all';
    const ref = latinReadingRef(await textsFor(day, state.date, state.hour), state.hour);
    state.trs = days.map((t) => hourTranslation(t, state.hour, ref)).filter(Boolean);
    state.tr = state.trs[0] || null;
  }
  try {
    if (state.hour === 'laudes' || state.hour === 'vesperae') await composeLaudesVesperae(frag, day, state.date, state.hour);
    else if (state.hour === 'lectio') await composeLectio(frag, day, state.date);
    else if (MEDIA[state.hour]) await composeMedia(frag, day, state.date, state.hour);
    else await composeCompline(frag, day, state.date, state.hour);
  } catch (e) {
    frag.append(el(`<p class="empty">${t('msg.error')}: ${esc(e.message)}</p>`));
    console.error(e);
  }
  return frag;
}

/**
 * The hour as a PDF file (site/pdf.js): composed again into a column of the page's width,
 * in the day's light colours, every score one SVG per system; paged (site/print.js), drawn
 * with jsPDF, and offered as a download (and to the share sheet, where there is one: on an
 * iPhone, Print and Save to Files are there).
 */
let pdfUrl = null;
async function makePdf(fmt) {
  const day = (await calendarFor(state.date))[0];
  if (!day || !FORMATS[fmt]) return;
  const btn = $('#pdf-make');
  const link = $('#pdf-link');
  const share = $('#pdf-share');
  btn.disabled = true;
  link.hidden = share.hidden = true;
  if (pdfUrl) { URL.revokeObjectURL(pdfUrl); pdfUrl = null; }
  const label = btn.textContent;
  btn.textContent = t('pdf.making');
  const name = `${hourName(state.hour)} ${state.date}${FORMATS[fmt].sheet ? ` ${t('pdf.booklet')}` : ''}.pdf`;
  const scale = (Number(state.settings.pdfSize) || 100) / 100;
  const restore = await preparePrint(day, fmt, scale);
  try {
    const col = restore.col;
    const { blob } = await makePdfFile(col, fmt, {
      scale,
      title: `${hourName(state.hour)} · ${day.name} · ${state.date}`,
      onProgress: (i, n) => { btn.textContent = t('pdf.page', { i, n }); },
    });
    pdfUrl = URL.createObjectURL(blob);
    link.href = pdfUrl;
    link.download = name;
    link.hidden = false;
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      share.hidden = false;
      share.onclick = () => navigator.share({ files: [file], title: name }).catch(() => {});
    }
  } catch (e) {
    console.error(e);
    alert(`The PDF could not be made: ${e.message}`);
  } finally {
    restore();
    btn.textContent = label;
    btn.disabled = false;
    pdfPages = {}; // the hour as it now is
  }
}
/**
 * The hour composed for print in format `fmt` at `scale`, in the day's light colours, every
 * score one SVG per system: returns a function that puts the screen back (with .col, the column).
 */
async function preparePrint(day, fmt, scale) {
  const theme = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = 'light';
  const screenLayouts = layouts.splice(0);
  setPerLine(true);
  const restore = () => {
    document.getElementById('print-root')?.remove();
    if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
    setPerLine(false);
    layouts.splice(0, layouts.length, ...screenLayouts);
  };
  try {
    const col = printColumn(fmt, scale);
    const frag = await composeHour(day);
    col.append(...frag.childNodes);
    await document.fonts?.ready;
    await Promise.all(layouts.map((f) => f()));
    restore.col = col;
  } catch (e) { restore(); throw e; }
  return restore;
}
/**
 * How many pages the PDF will have, shown beside the PDF settings before it is made (so the
 * print size can be chosen for a number of pages): the hour laid out for print and cut into
 * pages as for the PDF, without drawing them. Remembered per hour, format and size.
 */
let pdfPages = {};
let pagesRun = 0;
async function showPageCount() {
  const out = $('#pdf-pages');
  if (!out || $('#settings').hidden) return;
  const fmt = $('#pdf-format').value;
  const scale = (Number(state.settings.pdfSize) || 100) / 100;
  const key = [state.date, state.hour, fmt, scale, JSON.stringify(state.settings)].join('|');
  const run = ++pagesRun;
  if (!(key in pdfPages)) {
    out.textContent = '…';
    await new Promise((r) => setTimeout(r, 350)); // a quick succession of changes: count once
    if (run !== pagesRun) return;
    const day = (await calendarFor(state.date))[0];
    if (!day || !FORMATS[fmt]) { out.textContent = ''; return; }
    let restore = null;
    try {
      restore = await preparePrint(day, fmt, scale);
      if (run !== pagesRun) return;
      pdfPages[key] = paginate(restore.col, fmt, scale).length;
    } catch (e) { console.error(e); out.textContent = ''; return; } finally { restore?.(); }
  }
  if (run !== pagesRun) return;
  const n = pdfPages[key];
  const sheets = FORMATS[fmt].sheet ? Math.ceil(n / 4) : 0;
  out.textContent = sheets ? t('pdf.countBooklet', { n: Math.ceil(n / 4) * 4, s: sheets }) : t('pdf.count', { n });
}

// ------------------------------------------------------------------ boot
function defaultHour() {
  const h = new Date().getHours();
  if (h < 9) return 'laudes'; if (h < 11) return 'tertia'; if (h < 14) return 'sexta'; if (h < 16) return 'nona'; if (h < 20) return 'vesperae'; return 'completorium';
}
function applySettings() {
  // first visit from Hong Kong (its time zone, or Hong Kong Chinese in the browser): the
  // Chinese interface and the diocese's calendar; elsewhere the interface follows the browser
  if (!state.settings.ui && !state.settings.ordo && inHongKong()) { state.settings.ui = 'zh'; state.settings.ordo = 'hk'; }
  setUiLang(state.settings.ui || (/^zh/i.test(navigator.language || '') ? 'zh' : 'en'));
  applyPage();
  $('#opt-ui').value = uiLang();
  document.documentElement.style.setProperty('--size', state.settings.size || 100);
  if (state.settings.theme) document.documentElement.dataset.theme = state.settings.theme; else delete document.documentElement.dataset.theme;
  $('#text-size').value = state.settings.size || 100;
  $('#opt-theme').value = state.settings.theme || '';
  $('#opt-voice').value = state.settings.voice || '';
  for (const b of document.querySelectorAll('.mode')) b.setAttribute('aria-checked', String(b.dataset.psalms === (state.settings.psalms || '')));
  $('#opt-memoria').value = state.settings.memoria || '';
  $('#opt-presider').value = state.settings.presider ? '1' : '';
  $('#opt-sing-reading').value = readingStyle();
  $('#opt-sing-collect').value = collectStyle();
  $('#opt-preces').value = state.settings.precesTone || 'ar';
  $('#opt-invitatory').value = state.settings.invitatory || '';
  $('#opt-of-hymn').value = state.settings.ofHymn || '';
  $('#opt-pange').value = state.settings.pangeLingua || '';
  $('#opt-ordo').value = state.settings.ordo || '';
  if ($('#opt-translation')) $('#opt-translation').value = TRANSLATION_MODES[state.settings.translation] ? state.settings.translation : '';
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
  const [oco, psalterium, slots, hymns, responsoria] = await Promise.all([json('data/oco.json'), json('data/psalterium.json').catch(() => ({})), json('data/slots.json').catch(() => []), json('data/hymns.json').catch(() => ({})), json('data/responsoria.json').catch(() => [])]);
  state.hymns = hymns;
  state.responsoria = responsoria;
  state.zhNames = await json('data/calendar-zh.json').catch(() => ({}));
  state.oco = oco; state.psalterium = psalterium; state.slots = slots; state.ocoIndex = indexOco(oco);
  const m = /^#(\d{4}-\d{2}-\d{2})\/(\w+)$/.exec(location.hash);
  state.date = m ? m[1] : iso(new Date());
  state.hour = m && HOURS.includes(m[2]) ? m[2] : defaultHour();
  $('#date').value = state.date;
  applySettings();
  $('#date').onchange = (e) => { if (e.target.value) { state.date = e.target.value; render(); } };
  // the address leads: a link to another hour, the browser's Back and Forward
  window.addEventListener('hashchange', () => {
    const h = /^#(\d{4}-\d{2}-\d{2})\/(\w+)$/.exec(location.hash);
    if (!h || !HOURS.includes(h[2]) || (h[1] === state.date && h[2] === state.hour)) return;
    state.date = h[1]; state.hour = h[2];
    render();
  });
  $('#hour').onchange = (e) => { state.hour = e.target.value; render(); };
  // help and sources: the books' abbreviations from site/sources.js, the table the build labels the scores with
  const dl = $('#help-books');
  for (const b of BOOKS) dl.insertAdjacentHTML('beforeend', `<dt>${esc(b.abbr)}</dt><dd>${esc(b.title)}</dd>`);
  dl.insertAdjacentHTML('beforeend', '<dt>AR II 738–740</dt><dd>On a psalm: its tone, from the psalm tones of the Antiphonale Romanum II (2009), with the endings named as in the Antiphonale Monasticum 2005, the verses pointed with jgabc.</dd>');
  // the books' titles stay as printed, in their own languages
  for (const b of document.querySelectorAll('.help-open')) b.onclick = () => $('#help').showModal();
  $('#settings-toggle').onclick = () => {
    const s = $('#settings');
    s.hidden = !s.hidden;
    $('#settings-toggle').setAttribute('aria-expanded', String(!s.hidden));
    if (!s.hidden) { drawModePreviews(); showPageCount(); }
  };
  $('#text-size').oninput = (e) => { state.settings.size = Number(e.target.value); saveSettings(); applySettings(); render(); };
  $('#opt-voice').onchange = (e) => { state.settings.voice = e.target.value || undefined; saveSettings(); };
  $('#opt-theme').onchange = (e) => { state.settings.theme = e.target.value || undefined; saveSettings(); applySettings(); };
  for (const b of document.querySelectorAll('.mode')) b.onclick = () => { state.settings.psalms = b.dataset.psalms || undefined; saveSettings(); applySettings(); render(); };
  $('#opt-memoria').onchange = (e) => { state.settings.memoria = e.target.value || undefined; saveSettings(); render(); };
  $('#opt-presider').onchange = (e) => { state.settings.presider = e.target.value ? true : undefined; saveSettings(); render(); };
  $('#opt-sing-reading').onchange = (e) => { state.settings.readingTone = e.target.value === 'ar' ? undefined : e.target.value; saveSettings(); render(); };
  $('#opt-preces').onchange = (e) => { state.settings.precesTone = e.target.value === 'ar' ? undefined : e.target.value; saveSettings(); render(); };
  $('#opt-sing-collect').onchange = (e) => { state.settings.collectTone = e.target.value === 'ar' ? undefined : e.target.value; saveSettings(); render(); };
  $('#opt-invitatory').onchange = (e) => { state.settings.invitatory = e.target.value || undefined; saveSettings(); render(); };
  $('#opt-ordo').onchange = (e) => {
    state.settings.ordo = e.target.value || undefined;
    saveSettings(); render();
    // Hong Kong: a joyful little explosion of pixels from the menu
    if (e.target.value === 'hk') { const r = e.target.getBoundingClientRect(); pixelBurst(r.left + r.width / 2, r.top + r.height / 2, 4, HK_COLOURS); }
  };
  $('#opt-ui').onchange = (e) => { state.settings.ui = e.target.value; saveSettings(); applySettings(); fillBonus(); render(); };
  $('#opt-pange').onchange = (e) => { state.settings.pangeLingua = e.target.value || undefined; saveSettings(); render(); };
  $('#opt-of-hymn').onchange = (e) => { state.settings.ofHymn = e.target.value || undefined; saveSettings(); render(); };
  fillBonus();
  $('#bonus-open').onclick = () => $('#bonus').showModal();
  if ($('#opt-translation')) $('#opt-translation').onchange = (e) => { state.settings.translation = e.target.value || undefined; saveSettings(); render(); };
  $('#pdf-format').value = state.settings.pdf || 'a5';
  $('#pdf-format').onchange = (e) => { state.settings.pdf = e.target.value; saveSettings(); showPageCount(); };
  $('#pdf-size').value = String(state.settings.pdfSize || 100);
  $('#pdf-size').onchange = (e) => { state.settings.pdfSize = Number(e.target.value); saveSettings(); showPageCount(); };
  $('#pdf-make').onclick = () => makePdf($('#pdf-format').value);
  watchResize(layouts);
  render();
}
boot().catch((e) => { $('#office').replaceChildren(el(`<p class="empty">${t('msg.error')}: ${esc(e.message)}</p>`)); console.error(e); });
