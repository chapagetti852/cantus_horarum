// Cantus Horarum — compose and display one hour of the Liturgia Horarum in chant.
import { loadGabc, renderChant, splitGabc, watchResize } from './chant.js';
import { toneContext, versesOf, pointVerse, verseGabc, lineHtml } from './psalmtone.js';

const HOURS = ['lectio', 'laudes', 'tertia', 'sexta', 'nona', 'vesperae', 'completorium'];
const HOUR_NAMES = { lectio: 'Officium lectionis', laudes: 'Laudes matutinæ', tertia: 'Tertia', sexta: 'Sexta', nona: 'Nona', vesperae: 'Vesperæ', completorium: 'Completorium' };
const DAY_NAMES = ['Dominica', 'Feria II', 'Feria III', 'Feria IV', 'Feria V', 'Feria VI', 'Sabbato'];
const ROMAN = ['I', 'II', 'III', 'IV'];
const TEXT_HOUR = { lectio: 'lectio', laudes: 'laudes', tertia: 'media', sexta: 'media', nona: 'media', vesperae: 'vesperae', completorium: 'completorium' };
const DEUS_IN_ADIUTORIUM = { ferial: 4121, festive: 18178, solemn: 7864 };

const state = {
  date: null, hour: null,
  calendar: {}, oco: null, psalterium: null,
  settings: JSON.parse(localStorage.getItem('settings') || '{}'),
};
const layouts = [];
const $ = (s) => document.querySelector(s);

// ------------------------------------------------------------------ utilities
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
async function json(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }

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
  return state.oco.filter((e) => e.part === 'PSALTERIUM' && e.chapter === slot.chapter && e.day === slot.dayName && e.hour === slot.label);
}
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
 * A psalm (or canticle) pointed to its tone: the first verse in notes with the
 * intonation, the rest as text with the cadence accents in bold and the preparatory
 * syllables in italic. Gospel canticles take the intonation on every verse.
 */
function pointedPsalmNode(b, ctx, { canticle = false } = {}) {
  const node = el('<div class="psalm"></div>');
  const head = renderPsalmBlock({ ...b, strophes: [] });
  node.insertAdjacentHTML('beforeend', head);
  const h = node.querySelector('.psalm-head');
  const toneLabel = `<span class="tone">Tonus ${esc(ctx.tone)}${ctx.ending ? ' ' + esc(ctx.ending) : ''}</span>`;
  if (h) h.insertAdjacentHTML('beforeend', toneLabel); else node.insertAdjacentHTML('afterbegin', `<div class="psalm-head">${toneLabel}</div>`);
  let first = true;
  for (const st of b.strophes) {
    const sdiv = el('<div class="strophe"></div>');
    for (const v of versesOf(st)) {
      const p = pointVerse(v, ctx, { intone: canticle || first });
      if (first || state.settings.allNotes) {
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
    if (ctx && b.kind === 'psalm') node.append(pointedPsalmNode(b, ctx, opts));
    else if (ctx && b.kind === 'text' && b.lines.some((l) => typeof l === 'string' && /\*\s*$/.test(l))) {
      node.append(pointedPsalmNode({ kind: 'psalm', strophes: [b.lines.filter((l) => typeof l === 'string')] }, ctx, opts));
    } else node.insertAdjacentHTML('beforeend', renderTextBlock(b));
  }
  return node;
}
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

/** Keep only the first strophe of a fully notated hymn: cut before the lyric "2." */
function firstStrophe(body) {
  const m = /\s2\.\s*\(|\s2\.\s+[A-ZÆŒ]/.exec(body);
  if (!m) return body;
  let cut = body.slice(0, m.index).trim();
  if (!/\(::\)\s*$/.test(cut)) cut = cut.replace(/\([^()]*\)\s*$/, (x) => x) + ' (::)';
  return cut;
}

async function chantNode(gabcId, { label = '', annotation = null, fallbackText = null, hymn = false } = {}) {
  const wrap = el(`<div class="chant"><div class="chant-label"><span>${label}</span><span></span></div><div class="score"></div></div>`);
  const score = wrap.querySelector('.score');
  const src = gabcId ? await loadGabc(gabcId) : null;
  if (!src) {
    score.innerHTML = fallbackText ? `<p class="ant-text">${esc(fallbackText)}</p>` : '<p class="missing">Notatio deest.</p>';
    return wrap;
  }
  const parsed = splitGabc(src);
  const header = parsed.header;
  const body = hymn ? firstStrophe(parsed.body) : parsed.body;
  wrap.querySelector('.chant-label span:last-child').textContent = header.gregobase ? `GregoBase ${header.gregobase}` : '';
  const ann = annotation ?? header.annotation ?? (header.mode ? `${header.mode}${header['mode-modifier'] || ''}` : null);
  layouts.push(renderChant(score, body, { annotation: ann }));
  return wrap;
}

function hymnTextNode(hourTexts) {
  const h = section(hourTexts, 'HYMNUS');
  return h ? hymnBlocksNode(h.blocks) : null;
}
function hymnBlocksNode(blocks) {
  const node = el('<div class="hymn"></div>');
  for (const b of blocks) {
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

async function appendDeusInAdiutorium(main, day) {
  const festive = day.rank === 'SUNDAY' || day.rank === 'SOLEMNITY' || day.rank === 'FEAST';
  main.append(await chantNode(state.settings.solemn ? DEUS_IN_ADIUTORIUM.solemn : festive ? DEUS_IN_ADIUTORIUM.festive : DEUS_IN_ADIUTORIUM.ferial, { label: 'Deus, in adiutórium', annotation: '' }));
}

async function appendHymn(main, hymn, textNode, alternatives = []) {
  if (!hymn && !textNode) return;
  main.append(el('<h2 class="section">Hymnus</h2>'));
  if (hymn) main.append(await chantNode(hymn.gabc, { label: esc(hymn.title), fallbackText: hymn.title, hymn: true }));
  if (alternatives.length) main.append(el(`<p class="rubric">Vel: ${alternatives.map((x) => esc(x.title)).join('; ')}</p>`));
  if (textNode) main.append(textNode);
}

/** Antiphons 1-3 from the OCO, each with its psalms pointed to its tone; returns what followed the last psalm. */
async function appendPsalmody(main, entries, psalmodySection) {
  main.append(el('<h2 class="section">Psalmodia</h2>'));
  const groups = psalmGroups(psalmodySection);
  // a versicle after the last antiphon (Office of Readings) comes after its repetition
  const last = groups[groups.length - 1];
  const after = [];
  while (last?.items.length && last.items[last.items.length - 1].kind === 'versicle') after.unshift(last.items.pop());
  for (let n = 1; n <= Math.max(3, groups.length); n++) {
    const ant = byPosition(entries, String(n));
    const g = groups.find((x) => x.n === n);
    if (!ant && !g) continue;
    main.append(await chantNode(ant?.gabc, { label: `Ant. ${n}${ant?.mode ? ` · ${esc(ant.mode)}` : ''}`, fallbackText: ant?.text || g?.antiphon }));
    if (ant?.text) main.append(el(`<p class="ant-text"><span class="r">Ant. ${n}</span> ${esc(ant.text)}</p>`));
    if (g) {
      main.append(psalmodyNode(g.items, await toneFor(ant)));
      main.append(el(`<p class="ant-text"><span class="r">Ant.</span> ${esc(ant?.text || g.repeat || g.antiphon)}</p>`));
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
  const entries = ocoPsalter(slot);
  const pday = state.psalterium[`${day.psalter}-${day.dow}`];
  const texts = pday?.hours.lectio;
  if (!entries.length && !texts) { main.append(el('<p class="empty">Hæc hora nondum parata est.</p>')); return; }
  main.append(el(`<h2 class="section">${HOUR_NAMES.lectio} · ${slot.dayName}, hebdomada ${ROMAN[slot.week - 1]}</h2>`));
  await appendDeusInAdiutorium(main, day);

  // two hymns: one for the night or early morning, one for the day
  const hymns = entries.filter((e) => e.kind === 'hymn').map(withScore);
  const night = new Date().getHours() < 7;
  const [hymn, other] = night || hymns.length < 2 ? hymns : [hymns[1], hymns[0]];
  const part = hymnBlocksNode(hymnPart(texts, night ? /^I\./ : /^II\./)) || hymnTextNode(texts);
  await appendHymn(main, hymn, part);
  if (other) main.append(el(`<p class="rubric">${night ? 'Diurno tempore' : 'Noctu vel summo mane'}: ${esc(other.title)}</p>`));

  await appendPsalmody(main, entries, section(texts, 'PSALMODIA'));

  // the readings are left out; their responsories are proper to the date
  main.append(el('<h2 class="section">Lectiones</h2>'));
  let lect = pday?.date === date ? section(texts, 'LECTIONES') : null;
  if (!lect) lect = section((await json(`data/days/${date}.json`).catch(() => null))?.hours.lectio, 'LECTIONES');
  if (!lect) {
    main.append(el('<p class="rubric">Lectiones cum responsoriis huius diei nondum paratæ sunt.</p>'));
  } else {
    const out = [];
    for (const b of lect.blocks) {
      if (b.kind === 'text') continue; // the reading itself
      if (b.kind === 'rubric' && /^LECTIO/.test(b.text)) out.push({ kind: 'heading', text: b.text });
      else out.push(b);
    }
    const node = el('<div class="block lectiones"></div>');
    for (const b of responsoryBlocks(out)) {
      if (b.kind === 'heading') node.insertAdjacentHTML('beforeend', `<h3 class="sub">${esc(b.text[0] + b.text.slice(1).toLowerCase())}</h3>`);
      else if (b.kind === 'rubric' && b.text === 'RESPONSORIUM') node.insertAdjacentHTML('beforeend', '<p class="rubric">Responsorium</p>');
      else node.insertAdjacentHTML('beforeend', renderTextBlock(b));
    }
    main.append(node);
  }
  if (day.dow === 0) main.append(el('<p class="rubric">Hymnus Te Deum.</p>'));
  const or = section(texts, 'ORATIO');
  if (or) { main.append(el('<h2 class="section">Oratio</h2>')); main.append(el(`<div class="block">${renderBlocks(or.blocks)}</div>`)); }
}

const MEDIA = { tertia: { label: 'Tertia', title: 'AD TERTIAM' }, sexta: { label: 'Sexta', title: 'AD SEXTAM' }, nona: { label: 'Nona', title: 'AD NONAM' } };

async function composeMedia(main, day, date, hour) {
  const { label, title } = MEDIA[hour];
  const slot = psalterSlot(day, date, hour);
  const texts = state.psalterium[`${day.psalter}-${day.dow}`]?.hours.media;
  const inDay = (week, dayName) => state.oco.filter((e) => e.part === 'PSALTERIUM' && e.chapter === week && e.day === dayName);
  const today = inDay(slot.chapter, slot.dayName);
  // the antiphons serve whichever of the three hours is said; the OCO prints them under "Hor. med." (or None)
  const entries = today.filter((e) => ['Tertia', 'Sexta', 'Nona', 'Hor. med.'].includes(e.hour) && /^[123]$/.test(e.position || ''));
  const hymnOf = (list) => list.find((e) => e.hour === label && e.kind === 'hymn');
  const hymn = withScore(hymnOf(today) || hymnOf(inDay(slot.chapter, 'Feria II')) || hymnOf(inDay('HEBDOMADA I', 'Feria II')));
  if (!entries.length && !texts) { main.append(el('<p class="empty">Hæc hora nondum parata est.</p>')); return; }

  main.append(el(`<h2 class="section">${HOUR_NAMES[hour]} · ${slot.dayName}, hebdomada ${ROMAN[slot.week - 1]}</h2>`));
  await appendDeusInAdiutorium(main, day);
  await appendHymn(main, hymn, hymnBlocksNode(hymnPart(texts, new RegExp(`^${title}$`))));
  await appendPsalmody(main, entries, section(texts, 'PSALMODIA'));

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
  }
}

async function composeLaudesVesperae(main, day, date, hour) {
  const slot = psalterSlot(day, date, hour);
  const entries = ocoPsalter(slot);
  const key = `${slot.week}-${hour === 'vesperae' && day.dow === 6 ? 6 : day.dow}`;
  // Saturday Vespers texts are stored under the Saturday itself (iBreviary gives I Vespers there)
  const texts = state.psalterium[`${day.psalter}-${day.dow}`]?.hours[TEXT_HOUR[hour]];
  if (!entries.length && !texts) { main.append(el('<p class="empty">Hæc hora nondum parata est.</p>')); return; }

  main.append(el(`<h2 class="section">${HOUR_NAMES[hour]} · ${slot.dayName}, hebdomada ${ROMAN[slot.week - 1]}</h2>`));
  await appendDeusInAdiutorium(main, day);
  const hymns = entries.filter((e) => e.kind === 'hymn');
  await appendHymn(main, hymns[0], hymns.length ? hymnTextNode(texts) : null, hymns.slice(1));
  await appendPsalmody(main, entries, section(texts, 'PSALMODIA'));

  // Short reading, responsory
  const lb = section(texts, 'LECTIO BREVIS');
  if (lb) { main.append(el('<h2 class="section">Lectio brevis</h2>')); main.append(el(`<div class="block">${renderBlocks(lb.blocks)}</div>`)); }
  const rb = entries.find((e) => e.kind === 'resp_brevis' || /br\./.test(e.position || ''));
  const rbText = section(texts, 'RESPONSORIUM BREVE');
  if (rb || rbText) {
    main.append(el('<h2 class="section">Responsorium breve</h2>'));
    main.append(await chantNode(rb?.gabc, { label: rb ? esc(rb.title) : '', fallbackText: rb?.text }));
    if (rbText) main.append(el(`<div class="block">${renderBlocks(rbText.blocks)}</div>`));
  }

  // Gospel canticle
  const cant = byPosition(entries, hour === 'laudes' ? 'B' : 'M');
  const ce = section(texts, 'CANTICUM EVANGELICUM');
  main.append(el(`<h2 class="section">${hour === 'laudes' ? 'Benedictus' : 'Magnificat'}</h2>`));
  main.append(await chantNode(cant?.gabc, { label: `Ant. ad ${hour === 'laudes' ? 'Benedictus' : 'Magnificat'}${cant?.mode ? ` · ${esc(cant.mode)}` : ''}`, fallbackText: cant?.text }));
  if (cant?.text) main.append(el(`<p class="ant-text"><span class="r">Ant.</span> ${esc(cant.text)}</p>`));
  if (ce) main.append(psalmodyNode(canticleBlocks(ce.blocks.filter((b) => b.kind !== 'antiphon')), await toneFor(cant), { canticle: true }));
  if (cant?.text) main.append(el(`<p class="ant-text"><span class="r">Ant.</span> ${esc(cant.text)}</p>`));

  // Intercessions, Pater, collect, conclusion
  for (const [title, label] of [['PRECES', 'Preces'], ['PATER NOSTER', 'Pater noster'], ['ORATIO', 'Oratio']]) {
    const s = section(texts, title);
    if (!s) continue;
    main.append(el(`<h2 class="section">${label}</h2>`));
    main.append(el(`<div class="block ${title === 'PRECES' ? 'preces' : ''}">${renderBlocks(s.blocks)}</div>`));
  }
}

async function composeGeneric(main, day, date, hour) {
  const texts = state.psalterium[`${day.psalter}-${day.dow}`]?.hours[TEXT_HOUR[hour]];
  const slot = psalterSlot(day, date, hour);
  const entries = hour === 'completorium' ? ocoCompline(day, hour) : ocoPsalter(slot);
  // antiphons of the psalms and of the canticle go with their texts below, when there are texts
  const inline = (e) => texts && e.kind !== 'hymn' && /^(\d|Nunc)/.test(e.position || '');
  main.append(el(`<h2 class="section">${HOUR_NAMES[hour]}</h2>`));
  for (const e of entries) {
    if (inline(e)) continue;
    if (e.kind === 'reference') { main.append(el(`<p class="rubric">${esc(e.position || '')} ${esc(e.title)}</p>`)); continue; }
    main.append(await chantNode(e.gabc, { label: `${esc(e.position || '')} ${esc(e.title)}`.trim(), fallbackText: e.text, hymn: e.kind === 'hymn' }));
    if (e.text && e.kind !== 'hymn') main.append(el(`<p class="ant-text">${esc(e.text)}</p>`));
  }
  const antiphon = async (e, label, fallback) => {
    main.append(await chantNode(e?.gabc, { label: `${label}${e?.mode ? ` · ${esc(e.mode)}` : ''}`, fallbackText: e?.text || fallback }));
    if (e?.text) main.append(el(`<p class="ant-text"><span class="r">Ant.</span> ${esc(e.text)}</p>`));
  };
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
          main.append(el(`<p class="ant-text"><span class="r">Ant.</span> ${esc(ant?.text || g.repeat || g.antiphon)}</p>`));
        }
        if (groups.length) continue;
      }
      if (s.title === 'CANTICUM EVANGELICUM') {
        const ant = entries.find((e) => (e.position || '').startsWith('Nunc') && e.kind !== 'reference');
        const a = s.blocks.find((b) => b.kind === 'antiphon');
        main.append(el(`<div class="block">${renderBlocks(s.blocks.filter((b) => b.kind === 'rubric'))}</div>`));
        await antiphon(ant, 'Ant. ad Nunc dimittis', a?.text);
        main.append(psalmodyNode(canticleBlocks(s.blocks.filter((b) => b.kind !== 'antiphon' && b.kind !== 'rubric')), await toneFor(ant), { canticle: true }));
        main.append(el(`<p class="ant-text"><span class="r">Ant.</span> ${esc(ant?.text || a?.text || '')}</p>`));
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
  $('#opt-solemn').checked = !!state.settings.solemn;
  $('#opt-all-notes').checked = !!state.settings.allNotes;
}
function saveSettings() { localStorage.setItem('settings', JSON.stringify(state.settings)); }

async function boot() {
  const [oco, psalterium] = await Promise.all([json('data/oco.json'), json('data/psalterium.json').catch(() => ({}))]);
  state.oco = oco; state.psalterium = psalterium;
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
  $('#opt-solemn').onchange = (e) => { state.settings.solemn = e.target.checked; saveSettings(); render(); };
  $('#opt-all-notes').onchange = (e) => { state.settings.allNotes = e.target.checked; saveSettings(); render(); };
  watchResize(layouts);
  render();
}
boot().catch((e) => { $('#office').replaceChildren(el(`<p class="empty">Error: ${esc(e.message)}</p>`)); console.error(e); });
