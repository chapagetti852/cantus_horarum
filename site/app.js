// Cantus Horarum — compose and display one hour of the Liturgia Horarum in chant.
import { loadGabc, renderChant, splitGabc, watchResize } from './chant.js';
import { toneContext, versesOf, pointVerse, verseGabc, lineHtml } from './psalmtone.js';
import { resolveHour, indexOco, celebrationFor, isSanctoral } from './resolve.js';

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
const DOMINUS_VOBISCUM = 4322;
const BENEDICAMUS = { christmas: 16665, solemn: 16129, sunday: 16976, other: 3972 };
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
  // Saturday evening) and one after II Vespers. The hymn and the Nunc dimittis
  // antiphon are printed once, under the Sunday form.
  const pool = state.oco.filter((e) => e.part === 'PSALTERIUM' && e.chapter === 'AD COMPLETORIUM');
  const sunday = pool.filter((e) => e.day === 'In Dominica et sollemnitatibus');
  const hymn = sunday.filter((e) => e.kind === 'hymn');
  const nunc = sunday.filter((e) => e.position === 'Nunc' && e.kind !== 'reference');
  let own;
  if (day.dow === 6) own = sunday.filter((e) => e.hour === 'Post I Vesp.' && e.kind !== 'hymn');
  else if (day.dow === 0) own = sunday.filter((e) => e.hour === 'Post II Vesp.' && e.kind !== 'hymn');
  else own = pool.filter((e) => e.day === DAY_NAMES[day.dow]);
  own = own.filter((e) => !(e.position === 'Nunc' && e.kind === 'reference'));
  return [...hymn, ...own.filter((e) => e.position !== 'Nunc'), ...nunc];
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
/** "Laudes matutinæ · Feria II, hebdomada I", or the celebration's name on feasts and at I Vespers. */
function hourTitle(hour, slot, propers) {
  const cel = propers._cel;
  const name = propers._first ? `I Vesperæ · ${cel.name}`
    : cel && (propers._big || cel.rank === 'MEMORIAL' || cel.seasons?.some((x) => x !== 'ORDINARY_TIME')) ? `${HOUR_NAMES[hour]} · ${cel.name}`
      : `${HOUR_NAMES[hour]} · ${slot.dayName}, hebdomada ${ROMAN[slot.week - 1]}`;
  return el(`<h2 class="section">${esc(name)}</h2>`);
}
const PLACE = { R: 'Ɠ br.' };
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
    if (b.kind === 'antiphon' && b.n) { cur = { n: b.n, antiphon: b.text, items: [] }; groups.push(cur); }
    else if (b.kind === 'antiphon' && cur) { cur.repeat = b.text; }
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
function pointedPsalmNode(b, ctx, { canticle = false } = {}) {
  const node = el('<div class="psalm"></div>');
  const head = renderPsalmBlock({ ...b, strophes: [] });
  node.insertAdjacentHTML('beforeend', head);
  const h = node.querySelector('.psalm-head');
  const toneLabel = `<span class="tone">Tonus ${esc(ctx.tone)}${ctx.ending ? ' ' + esc(ctx.ending) : ''}</span>`;
  // Gospel canticles: the antiphon above already shows the mode
  if (!canticle) { if (h) h.insertAdjacentHTML('beforeend', toneLabel); else node.insertAdjacentHTML('afterbegin', `<div class="psalm-head">${toneLabel}</div>`); }
  let first = true;
  if (state.settings.psalms !== 'text') {
    const bodies = [];
    for (const st of b.strophes) for (const v of versesOf(st)) {
      bodies.push(verseGabc(pointVerse(v, ctx, { intone: canticle || first }), ctx).replace(/^\([^)]*\)\s*/, ''));
      first = false;
    }
    if (bodies.length) {
      const sc = el('<div class="score psalm-score"></div>');
      node.append(sc);
      layouts.push(renderChant(sc, `(${ctx.clef}) ${bodies.join(' ')}`, { dropCap: false }));
    }
    return node;
  }
  for (const st of b.strophes) {
    const sdiv = el('<div class="strophe"></div>');
    for (const v of versesOf(st)) {
      const p = pointVerse(v, ctx, { intone: canticle || first });
      if (first) {
        const sc = el('<div class="score verse-score"></div>');
        sdiv.append(sc);
        layouts.push(renderChant(sc, verseGabc(p, ctx), { dropCap: false }));
      } else {
        sdiv.insertAdjacentHTML('beforeend', p.map((l) => `<div class="line">${lineHtml(l)}</div>`).join(''));
      }
      first = false;
    }
    node.append(sdiv);
  }
  return node;
}

/** Blocks of a psalmody group or canticle, pointed when the tone is known. */
function psalmodyNode(blocks, ctx, opts = {}) {
  const node = el('<div class="block"></div>');
  // iBreviary sometimes gives a psalm's heading and its verses as two blocks: join them
  blocks = (blocks || []).reduce((out, b) => {
    const prev = out[out.length - 1];
    if (b.kind === 'psalm' && !b.ref && !b.title && prev?.kind === 'psalm' && !prev.strophes.length) out[out.length - 1] = { ...prev, strophes: b.strophes };
    else out.push(b);
    return out;
  }, []);
  for (const b of blocks) {
    if (isNavigation(b)) continue;
    if (ctx && b.kind === 'psalm') node.append(pointedPsalmNode(b, ctx, opts));
    else if (ctx && b.kind === 'text' && b.lines.some((l) => typeof l === 'string' && /\*\s*$/.test(l))) {
      node.append(pointedPsalmNode({ kind: 'psalm', strophes: [b.lines.filter((l) => typeof l === 'string')] }, ctx, opts));
    } else node.insertAdjacentHTML('beforeend', renderTextBlock(b));
  }
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
    if (isVerses && last?.kind === 'psalm' && last.canticle) last.strophes.push(b.lines.filter((l) => typeof l === 'string'));
    else if (isVerses) out.push({ kind: 'psalm', canticle: true, strophes: [b.lines.filter((l) => typeof l === 'string')] });
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

/** An antiphon: its score, or its text when there is none. */
const antiphonNode = (ant, fallbackText) => chantNode(ant?.gabc, { fallbackText: ant?.text || fallbackText });

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
  const antiphon = () => chantNode(ant.gabc, { fallbackText: antText });
  main.append(await antiphon());
  const toneId = INVITATORY_TONES[ant.mode];
  const src = toneId ? await loadGabc(toneId) : null;
  if (!src) { main.append(el('<p class="rubric">Psalmus 94 (95): notatio deest.</p>')); return true; }
  const { body } = splitGabc(src);
  const clef = /^\s*(\([cf]b?[1-4]\))/.exec(body)?.[1] || '(c4)';
  const strophes = body.replace(/^\s*\([cf]b?[1-4]\)/, '').split(/\(::Z?\)/).map((x) => x.trim()).filter((x) => /[a-z]\(/i.test(x));
  main.append(el(`<div class="psalm-head"><span class="ref">Psalmus 94 (95)</span><span class="tone">Tonus ${esc(ant.mode)}</span></div>`));
  for (const st of strophes) {
    const sc = el('<div class="score verse-score"></div>');
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

/** Antiphons 1-3 from the OCO, each with its psalms pointed to its tone; returns what followed the last psalm. */
async function appendPsalmody(main, entries, psalmodySection, { single = null } = {}) {
  main.append(el('<h2 class="section">Psalmodia</h2>'));
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
    main.append(await antiphonNode(ant, g?.antiphon));
    if (g) {
      main.append(psalmodyNode(g.items, await toneFor(ant)));
      main.append(await antiphonNode(ant, g.repeat || g.antiphon));
    }
  }
  if (after.length) main.append(el(`<div class="block">${renderBlocks(after)}</div>`));
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
    const node = el('<div class="block lectiones text"></div>');
    for (const b of responsoryBlocks(out)) {
      if (b.kind === 'heading') node.insertAdjacentHTML('beforeend', `<h3 class="sub">${esc(b.text[0] + b.text.slice(1).toLowerCase())}</h3>`);
      else if (b.kind === 'rubric' && b.text === 'RESPONSORIUM') node.insertAdjacentHTML('beforeend', '<p class="rubric">Responsorium</p>');
      else node.insertAdjacentHTML('beforeend', renderTextBlock(b));
    }
    main.append(node);
  }
  if (day.dow === 0) main.append(el('<p class="rubric">Hymnus Te Deum.</p>'));
  const or = section(texts, 'ORATIO');
  if (or) { main.append(el('<h2 class="section">Oratio</h2>')); main.append(await conclusionNode(or.blocks, propers._cel || day, 'lectio')); }
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

  const own = section(texts, title);
  if (own) {
    let node = null;
    for (const b of own.blocks) {
      if (b.kind === 'rubric' && /^(LECTIO BREVIS|ORATIO)$/.test(b.text)) {
        main.append(el(`<h2 class="section">${b.text === 'ORATIO' ? 'Oratio' : 'Lectio brevis'}</h2>`));
        node = el('<div class="block"></div>');
        main.append(node);
        continue;
      }
      (node || main).insertAdjacentHTML('beforeend', renderTextBlock(b));
    }
    if (node) node.replaceWith(await conclusionNode(own.blocks.slice(own.blocks.findIndex((b) => b.kind === 'rubric' && b.text === 'ORATIO') + 1), propers._cel || day, hour));
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
  if (lb) { main.append(el('<h2 class="section">Lectio brevis</h2>')); main.append(el(`<div class="block">${renderBlocks(lb.blocks)}</div>`)); }
  // the short responsory is one piece of music: its score, or else the text
  const rb = entries.find((e) => e.kind !== 'reference' && (e.kind === 'resp_brevis' || /br\./.test(e.position || '')));
  const rbText = part('RESPONSORIUM BREVE');
  if (rb || rbText) {
    main.append(el('<h2 class="section">Responsorium breve</h2>'));
    const node = rb?.gabc ? await chantNode(rb.gabc, { annotation: '' }) : null;
    if (node?.dataset.notated) main.append(node);
    else if (rbText) main.append(el(`<div class="block">${renderBlocks(rbText.blocks)}</div>`));
  }

  // Gospel canticle
  const cant = byPosition(entries, hour === 'laudes' ? 'B' : 'M');
  const ce = section(texts, 'CANTICUM EVANGELICUM');
  main.append(el(`<h2 class="section">${hour === 'laudes' ? 'Benedictus' : 'Magnificat'}</h2>`));
  const ceAnt = ce?.blocks.find((b) => b.kind === 'antiphon')?.text;
  main.append(await antiphonNode(cant, ceAnt));
  if (ce) main.append(psalmodyNode(canticleBlocks(ce.blocks.filter((b) => b.kind !== 'antiphon' && b.kind !== 'rubric')), await toneFor(cant), { canticle: true }));
  main.append(await antiphonNode(cant, ceAnt));

  // Intercessions, Pater noster (sung), collect, conclusion
  const cel = propers._cel || day;
  const preces = part('PRECES');
  if (preces) { main.append(el('<h2 class="section">Preces</h2>')); main.append(precesNode(preces.blocks)); }
  if (section(texts, 'PATER NOSTER')) {
    main.append(el('<h2 class="section">Pater noster</h2>'));
    main.append(await chantNode(isFestive(cel) ? PATER_NOSTER.festive : PATER_NOSTER.ferial, { annotation: '' }));
  }
  const or = section(texts, 'ORATIO');
  if (or) { main.append(el('<h2 class="section">Oratio</h2>')); main.append(await conclusionNode(or.blocks, cel, hour)); }
}

/**
 * Intercessions: the introduction with its response, then each intention as one line,
 * its two halves joined by a red dash.
 */
function precesNode(blocks) {
  const node = el('<div class="block preces"></div>');
  const html = (b) => b.lines.map((l) => (typeof l === 'string' ? esc(l) : `<i>${esc(l.text)}</i>`)).join(' ');
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    if (b.kind === 'text' && blocks[k + 1]?.kind === 'rubric' && blocks[k + 1].text === '—' && blocks[k + 2]?.kind === 'text') {
      node.insertAdjacentHTML('beforeend', `<p class="intention">${html(b)}<br><span class="r">—</span> ${html(blocks[k + 2])}</p>`);
      k += 2;
    } else if (b.kind === 'text') node.insertAdjacentHTML('beforeend', `<p class="intro">${html(b)}</p>`);
    else node.insertAdjacentHTML('beforeend', renderTextBlock(b));
  }
  return node;
}

/**
 * The collect and the conclusion of an hour. Lauds and Vespers: with a priest or deacon
 * presiding (an option), Dominus vobiscum and the blessing; otherwise Dominus nos
 * benedicat; then Benedicamus Domino of the day's rank (Antiphonale Romanum II). The
 * little hours and the Office of Readings end with Benedicamus Domino (AM 2005).
 */
async function conclusionNode(blocks, cel, hour) {
  const node = el('<div class="block"></div>');
  const textOf = (b) => (b?.kind === 'text' ? b.lines.map((l) => (typeof l === 'string' ? l : l.text)).join(' ') : '');
  const major = hour === 'laudes' || hour === 'vesperae';
  // the collect and its Amen; iBreviary's rubrics and formulas of the conclusion are replaced
  const end = blocks.findIndex((b, k) => k > 0 && (b.kind === 'rubric' || /^(Dóminus vobíscum|Dóminus nos|Benedicámus Dómino)/.test(textOf(b))));
  node.insertAdjacentHTML('beforeend', renderBlocks(end < 0 ? blocks : blocks.slice(0, end)));
  if (!major) {
    if (blocks.some((b) => /^Benedicámus Dómino/.test(textOf(b)))) node.append(await chantNode(isFestive(cel) ? BENEDICAMUS_HORAE.festive : BENEDICAMUS_HORAE.ferial, { annotation: '' }));
    return node;
  }
  if (state.settings.presider) node.append(await chantNode(DOMINUS_VOBISCUM, { annotation: '' }));
  else node.append(chantFromGabc(DOMINUS_NOS_BENEDICAT));
  node.append(await chantNode(benedicamusFor(cel), { annotation: '' }));
  return node;
}
/**
 * Dominus nos benedicat: no score in the books; recited on one pitch with the falls of
 * the blessing "Benedicat vos" of the Antiphonale Romanum II (p. 761).
 */
const DOMINUS_NOS_BENEDICAT = '(c3) DO(h)mi(h)nus(h) nos(h) be(h)ne(h)dí(g)cat,(f) (,) et(h) ab(h) om(h)ni(h) ma(h)lo(h) de(h)fén(g)dat,(f) (;) et(h) ad(h) vi(h)tam(h) per(h)dú(h)cat(h) æ(h)tér(g)nam.(f) (::) <sp>R/</sp> A(h)men.(h) (::)';
function chantFromGabc(body) {
  const wrap = el('<div class="chant"><div class="score"></div></div>');
  layouts.push(renderChant(wrap.firstChild, body, { annotation: '' }));
  wrap.dataset.notated = '1';
  return wrap;
}
function benedicamusFor(cel) {
  if (cel.seasons?.includes('CHRISTMAS_TIME') && isFestive(cel)) return BENEDICAMUS.christmas;
  if (cel.rank === 'SOLEMNITY' || /blessed_virgin_mary|^our_lady/.test(cel.id || '')) return BENEDICAMUS.solemn;
  if (cel.rank === 'SUNDAY' && cel.seasons?.includes('ORDINARY_TIME')) return BENEDICAMUS.sunday;
  return BENEDICAMUS.other;
}

async function composeGeneric(main, day, date, hour) {
  const texts = await textsFor(day, date, hour);
  const slot = psalterSlot(day, date, hour);
  const entries = withPropers(hour === 'completorium' ? ocoCompline(day, hour) : ocoPsalter(slot), await propersFor(day, date, hour));
  // antiphons of the psalms and of the canticle go with their texts below, when there are texts
  const inline = (e) => texts && e.kind !== 'hymn' && /^(\d|Nunc)/.test(e.position || '');
  main.append(el(`<h2 class="section">${HOUR_NAMES[hour]}</h2>`));
  for (const e of entries) {
    if (inline(e)) continue;
    if (e.kind === 'reference') { main.append(el(`<p class="rubric">${esc(e.position || '')} ${esc(e.title)}</p>`)); continue; }
    if (e.kind === 'hymn') { await appendHymn(main, withScore(e), hymnTextNode(texts)); continue; }
    main.append(await chantNode(e.gabc, { fallbackText: e.text }));
  }
  const antiphon = async (e, label, fallback) => main.append(await antiphonNode(e, fallback));
  if (texts) {
    for (const s of texts) {
      if (!s.title || /^(Breviarium|PSALMI INVITATORII)$/.test(s.title) || s.blocks.length === 0) continue;
      main.append(el(`<h2 class="section">${esc(s.title)}</h2>`));
      if (s.title === 'PSALMODIA') {
        const groups = psalmGroups(s);
        for (const g of groups) {
          const ant = byPosition(entries.filter((e) => e.kind !== 'reference'), String(g.n));
          await antiphon(ant, `Ant. ${g.n}`, g.antiphon);
          main.append(psalmodyNode(g.items, await toneFor(ant)));
          await antiphon(ant, '', g.repeat || g.antiphon);
        }
        if (groups.length) continue;
      }
      if (s.title === 'HYMNUS' && entries.some((e) => e.kind === 'hymn')) continue; // with its score above
      if (s.title === 'ORATIO') { main.append(await conclusionNode(s.blocks, day, hour)); continue; }
      if (s.title === 'CANTICUM EVANGELICUM') {
        const ant = entries.find((e) => (e.position || '').startsWith('Nunc') && e.kind !== 'reference');
        const a = s.blocks.find((b) => b.kind === 'antiphon');
        await antiphon(ant, 'Ant. ad Nunc dimittis', a?.text);
        main.append(psalmodyNode(canticleBlocks(s.blocks.filter((b) => b.kind !== 'antiphon' && b.kind !== 'rubric')), await toneFor(ant), { canticle: true }));
        await antiphon(ant, '', a?.text);
        continue;
      }
      main.append(el(`<div class="block">${renderBlocks(s.blocks)}</div>`));
    }
  } else if (!entries.length) main.append(el('<p class="empty">Hæc hora nondum parata est.</p>'));
}

async function render() {
  const main = $('#office');
  main.replaceChildren(el('<p class="loading">Paratur…</p>'));
  layouts.length = 0;
  const days = await calendarFor(state.date);
  const day = days[0];
  $('#date-name').textContent = day ? day.name : state.date;
  $('#date-sub').textContent = day ? [state.date, day.psalter ? `hebd. ${ROMAN[day.psalter - 1]} psalterii` : '', days.slice(1).map((d) => d.name).join(' · ')].filter(Boolean).join(' · ') : '';
  for (const b of $('#hours').children) b.setAttribute('aria-current', b.dataset.hour === state.hour ? 'true' : 'false');
  if (!day) { main.replaceChildren(el('<p class="empty">Calendarium huius anni deest.</p>')); return; }
  const frag = document.createElement('div');
  try {
    if (state.hour === 'laudes' || state.hour === 'vesperae') await composeLaudesVesperae(frag, day, state.date, state.hour);
    else if (state.hour === 'lectio') await composeLectio(frag, day, state.date);
    else if (MEDIA[state.hour]) await composeMedia(frag, day, state.date, state.hour);
    else await composeGeneric(frag, day, state.date, state.hour);
  } catch (e) {
    frag.append(el(`<p class="empty">Error: ${esc(e.message)}</p>`));
    console.error(e);
  }
  main.replaceChildren(...frag.childNodes);
  layouts.forEach((f) => f());
  location.hash = `${state.date}/${state.hour}`;
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
  $('#opt-dark').checked = state.settings.theme === 'dark' || (!state.settings.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  $('#opt-psalms').value = state.settings.psalms || '';
  $('#opt-memoria').value = state.settings.memoria || '';
  $('#opt-presider').checked = !!state.settings.presider;
  $('#opt-invitatory').value = state.settings.invitatory || '';
}
function saveSettings() { localStorage.setItem('settings', JSON.stringify(state.settings)); }

async function boot() {
  const [oco, psalterium, slots] = await Promise.all([json('data/oco.json'), json('data/psalterium.json').catch(() => ({})), json('data/slots.json').catch(() => [])]);
  state.oco = oco; state.psalterium = psalterium; state.slots = slots; state.ocoIndex = indexOco(oco);
  const m = /^#(\d{4}-\d{2}-\d{2})\/(\w+)$/.exec(location.hash);
  state.date = m ? m[1] : iso(new Date());
  state.hour = m && HOURS.includes(m[2]) ? m[2] : defaultHour();
  $('#date').value = state.date;
  applySettings();
  $('#prev').onclick = () => { state.date = addDays(state.date, -1); $('#date').value = state.date; render(); };
  $('#next').onclick = () => { state.date = addDays(state.date, 1); $('#date').value = state.date; render(); };
  $('#date').onchange = (e) => { if (e.target.value) { state.date = e.target.value; render(); } };
  $('#hours').onclick = (e) => { const b = e.target.closest('button'); if (b) { state.hour = b.dataset.hour; render(); } };
  $('#settings-toggle').onclick = () => { const s = $('#settings'); s.hidden = !s.hidden; $('#settings-toggle').setAttribute('aria-expanded', String(!s.hidden)); };
  $('#text-size').oninput = (e) => { state.settings.size = Number(e.target.value); saveSettings(); applySettings(); render(); };
  $('#opt-dark').onchange = (e) => { state.settings.theme = e.target.checked ? 'dark' : 'light'; saveSettings(); applySettings(); };
  $('#opt-psalms').onchange = (e) => { state.settings.psalms = e.target.value || undefined; saveSettings(); render(); };
  $('#opt-memoria').onchange = (e) => { state.settings.memoria = e.target.value || undefined; saveSettings(); render(); };
  $('#opt-presider').onchange = (e) => { state.settings.presider = e.target.checked || undefined; saveSettings(); render(); };
  $('#opt-invitatory').onchange = (e) => { state.settings.invitatory = e.target.value || undefined; saveSettings(); render(); };
  watchResize(layouts);
  render();
}
boot().catch((e) => { $('#office').replaceChildren(el(`<p class="empty">Error: ${esc(e.message)}</p>`)); console.error(e); });
