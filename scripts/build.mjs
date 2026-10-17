#!/usr/bin/env node
// Assemble the static site into dist/:
//   site/**                      copied as is (app, styles, fonts, vendor, calendar)
//   dist/data/oco.json           compact OCO entries with their GregoBase score id
//   dist/data/slots.json         the OCO index slot codes (tempus, hour, place) for site/resolve.js
//   dist/data/psalterium.json    the four-week psalter texts, keyed "week-dow", from data/texts/days
//   dist/data/days/<date>.json   texts of particular dates (for what is proper to the day)
//   dist/gabc/<id>.gabc          every score the entries point to, plus the common tones
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const gabcCache = process.env.GABC_CACHE || join(root, 'data/gabc');

mkdirSync(dist, { recursive: true });
cpSync(join(root, 'site'), dist, { recursive: true });

// ---- OCO entries + scores -------------------------------------------------
const entries = JSON.parse(readFileSync(join(root, 'data/oco/oco.json'), 'utf8'));
const match = new Map(JSON.parse(readFileSync(join(root, 'data/oco/gregobase-match.json'), 'utf8')).map((m) => [m.oco_id, m]));
const compact = entries.map((e) => {
  const m = match.get(e.id);
  const o = {
    id: e.id, page: e.page, part: e.part, chapter: e.chapter, sub: e.sub, group: e.group, day: e.day, hour: e.hour,
    position: e.position, kind: e.kind, mode: e.mode, title: e.title, text: e.text || null,
  };
  if (e.qualifiers?.length) o.qualifiers = e.qualifiers;
  if (e.rubrics?.length) o.rubrics = e.rubrics;
  if (e.cao) o.cao = e.cao;
  if (e.lhym) o.lhym = e.lhym;
  if (e.scripture) o.scripture = e.scripture;
  if (m?.gregobase) { o.gabc = m.gregobase; o.gabcConfidence = m.confidence; }
  return o;
});
mkdirSync(join(dist, 'data'), { recursive: true });
writeFileSync(join(dist, 'data/oco.json'), JSON.stringify(compact));

// ---- slot codes of the OCO indices, for resolving propers (site/resolve.js) ------
const indices = JSON.parse(readFileSync(join(root, 'data/oco/indices.json'), 'utf8'));
const slots = [
  ...indices.antiphonae.map((e) => ['a', e.tempus, e.officium, e.locus, e.oco_ids, null, e.incipit]),
  ...indices.hymni.map((e) => ['h', e.tempus, e.officium, '', [], e.lhym, e.incipit]),
  ...indices.responsoria_brevia.map((e) => ['r', e.tempus, e.officium, '', e.oco_ids, null, e.incipit]),
];
writeFileSync(join(dist, 'data/slots.json'), JSON.stringify(slots));

const COMMON_TONES = [4121, 18178, 7864, 18107, 18108, 4321, 15303, 15301, 15302, 17847, 17848, 18352, 18353, 18354, 18355, 18356, 18357, 18358, 18359, 18360, 18361, 18362, 18363, 18364, 18365, 18366,
  // invitatory psalm 94 in the Liber Hymnarius tones (see INVITATORY_TONES in site/app.js)
  8218, 10397, 15508, 7669, 16356, 10248, 9664, 10035, 15059, 9834, 9707, 9642,
  // conclusions of Lauds and Vespers, Antiphonale Romanum II pp. 761-765
  4322, 4323, 17802, 3972, 16976, 16129, 16665];
const ids = new Set([...compact.map((e) => e.gabc).filter(Boolean), ...COMMON_TONES]);
mkdirSync(join(dist, 'gabc'), { recursive: true });
let copied = 0, missing = 0;
for (const id of ids) {
  const src = join(gabcCache, `${id}.gabc`);
  if (existsSync(src)) { cpSync(src, join(dist, 'gabc', `${id}.gabc`)); copied++; } else missing++;
}

// ---- psalter texts ----------------------------------------------------------
const daysDir = join(root, 'data/texts/days');
const psalterium = {};
if (existsSync(daysDir)) {
  const calendars = {};
  for (const f of readdirSync(daysDir).filter((f) => f.endsWith('.json'))) {
    const day = JSON.parse(readFileSync(join(daysDir, f), 'utf8'));
    const year = day.date.slice(0, 4);
    calendars[year] ??= JSON.parse(readFileSync(join(root, `site/data/calendar/${year}.json`), 'utf8'));
    const top = calendars[year][day.date]?.[0];
    if (!top || !top.seasons.includes('ORDINARY_TIME')) continue;
    if (!['WEEKDAY', 'MEMORIAL', 'OPTIONAL_MEMORIAL', 'SUNDAY'].includes(top.rank)) continue;
    const key = `${top.psalter}-${top.dow}`;
    if (!psalterium[key]) psalterium[key] = { date: day.date, hours: day.hours };
  }
}
writeFileSync(join(dist, 'data/psalterium.json'), JSON.stringify(psalterium));

// ---- texts of particular days ------------------------------------------------
// The committed psalter days plus the rolling window fetched by scripts/texts/window.mjs
// (cache/texts/days, not committed). Each date's own texts carry its propers.
let dayFiles = 0;
mkdirSync(join(dist, 'data/days'), { recursive: true });
for (const dir of [daysDir, join(root, 'cache/texts/days')]) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    writeFileSync(join(dist, 'data/days', f), JSON.stringify(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
    dayFiles++;
  }
}

console.log(`dist/: ${compact.length} entries, ${copied} gabc files (${missing} missing), psalter days ${Object.keys(psalterium).length}/28, ${dayFiles} day files`);
