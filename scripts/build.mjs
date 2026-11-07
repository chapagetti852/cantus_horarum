#!/usr/bin/env node
// Assemble the static site into dist/:
//   site/**                      copied as is (app, styles, fonts, vendor, calendar)
//   dist/data/oco.json           compact OCO entries with their GregoBase score id
//   dist/data/slots.json         the OCO index slot codes (tempus, hour, place) for site/resolve.js
//   dist/data/psalterium.json    the four-week psalter texts, keyed "week-dow", from data/texts/days
//   dist/data/days/<date>.json   texts of particular dates (for what is proper to the day)
//   dist/gabc/<id>.gabc          every score the entries point to, plus the common tones;
//                                oco-<entry id>.gabc for scores read from the OCO itself (data/gabc-oco)
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { attachVerses } from './texts/verses.mjs';
import { gregobaseLabel } from '../site/sources.js';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const gabcCache = process.env.GABC_CACHE || join(root, 'data/gabc');

mkdirSync(dist, { recursive: true });
cpSync(join(root, 'site'), dist, { recursive: true });

// ---- version: package.json (semver, see CHANGELOG.md) and the commit, in the footer --------
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
let commit = (process.env.GITHUB_SHA || '').slice(0, 7);
if (!commit) { try { commit = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = ''; } }
const built = new Date().toISOString().slice(0, 10);
writeFileSync(join(dist, 'version.json'), JSON.stringify({ version, commit, built }));
{
  const page = join(dist, 'index.html');
  writeFileSync(page, readFileSync(page, 'utf8').replace('<p class="version" id="version">dev</p>',
    `<p class="version" id="version" title="Built ${built}">v${version}${commit ? ` · ${commit}` : ''}</p>`));
}

// ---- OCO entries + scores -------------------------------------------------
const entries = JSON.parse(readFileSync(join(root, 'data/oco/oco.json'), 'utf8'));
const match = new Map(JSON.parse(readFileSync(join(root, 'data/oco/gregobase-match.json'), 'utf8')).map((m) => [m.oco_id, m]));
const compact = entries.map((e) => {
  const m = match.get(e.id);
  const o = {
    id: e.id, page: e.page, part: e.part, chapter: e.chapter, sub: e.sub, group: e.group, day: e.day, hour: e.hour,
    // the PDF's ℟ glyph comes out as "Ɠ": "Ɠ br." and "R br." are the same place
    position: e.position ? e.position.replace(/^Ɠ/, 'R') : e.position, kind: e.kind, mode: e.mode, title: e.title, text: e.text || null,
  };
  if (e.qualifiers?.length) o.qualifiers = e.qualifiers;
  if (e.rubrics?.length) o.rubrics = e.rubrics;
  if (e.cao) o.cao = e.cao;
  if (e.lhym) o.lhym = e.lhym;
  if (e.scripture) o.scripture = e.scripture;
  if (m?.use === 'oco') { o.gabc = `oco-${e.id}`; o.gabcConfidence = 'oco'; } // read from the OCO's own notation
  else if (m?.gregobase) { o.gabc = m.gregobase; o.gabcConfidence = m.confidence; }
  return o;
});
mkdirSync(join(dist, 'data'), { recursive: true });
writeFileSync(join(dist, 'data/oco.json'), JSON.stringify(compact));

// ---- slot codes of the OCO indices, for resolving propers (site/resolve.js) ------
const indices = JSON.parse(readFileSync(join(root, 'data/oco/indices.json'), 'utf8'));
const indexHymns = JSON.parse(readFileSync(join(root, 'data/oco/index-hymns.json'), 'utf8'));
// the responsories of the Office of Readings on GregoBase (scripts/oco/match_responsoria_prolixa.py)
const responsoria = JSON.parse(readFileSync(join(root, 'data/oco/responsoria-prolixa.json'), 'utf8'));
writeFileSync(join(dist, 'data/responsoria.json'), JSON.stringify(responsoria));
// the index gives some hymns to I Vespers only where the OCO body sings them at both
// ("Te sæculorum principem", Christ the King: "I & II Vesp."); 'V' is both
const bothVespers = new Set(entries.filter((e) => e.kind === 'hymn' && e.lhym && /I & II/.test(e.hour || '')).map((e) => String(e.lhym)));
for (const e of indices.hymni) if (e.officium === '1V' && bothVespers.has(String(e.lhym))) e.officium = 'V';
const slots = [
  ...indices.antiphonae.map((e) => ['a', e.tempus, e.officium, e.locus, e.oco_ids, null, e.incipit]),
  // the 8th field: the score of a hymn the OCO names only in its index (data/oco/index-hymns.json)
  ...indices.hymni.map((e) => ['h', e.tempus, e.officium, '', [], e.lhym, e.incipit, indexHymns[`${e.incipit}|${e.lhym}`] ?? null]),
  ...indices.responsoria_brevia.map((e) => ['r', e.tempus, e.officium, '', e.oco_ids, null, e.incipit]),
];
writeFileSync(join(dist, 'data/slots.json'), JSON.stringify(slots));

const COMMON_TONES = [4121, 7864, 18107, 18108, 4321, 15301, 15302, 17847, 17848, 18352, 18353, 18354, 18355, 18356, 18357, 18358, 18359, 18360, 18361, 18362, 18363, 18364, 18365, 18366,
  // invitatory psalm 94 in the Liber Hymnarius tones (see INVITATORY_TONES in site/app.js)
  8218, 10397, 15508, 7669, 16356, 10248, 9664, 10035, 15059, 9834, 9707, 9642,
  // Salus et gloria with its Alleluias, Sunday II Vespers per annum (SALUS_ET_GLORIA in site/app.js)
  4317, 4145,
  // conclusions of Lauds and Vespers, Antiphonale Romanum II pp. 761-765
  4322, 16665, 16129, 16976, 3972, 17802, 1310, 20680, 20681, 20682, 20683, 19868, 19189, 20715, 20685, 4694, 18754, 18753, 18655,
  // responsories of the Office of Readings (RESPONSORIA in site/app.js)
  16139, 16360, 16205, 16108, 16135, 19647, 20401, 20438, 20687];
const ids = new Set([...compact.map((e) => e.gabc).filter(Boolean), ...COMMON_TONES, 4680, 4681, 4682, 4677, 4683, 7515, 7517, 7518, 7519, 16706,
  ...Object.values(indexHymns).flatMap((v) => (typeof v === 'object' ? Object.values(v) : [v])), ...responsoria.map((r) => r[0])]);
mkdirSync(join(dist, 'gabc'), { recursive: true });
let copied = 0, missing = 0;
// each file headed with where its notation comes from (site/sources.js), shown at the top
// right of the score: "LH 197", "AM I 215", "A&R III 93", "OCO 343" (the page of the OCO)
const chantsById = new Map(JSON.parse(readFileSync(join(root, 'data/gregobase/chants.json'), 'utf8')).map((c) => [c.id, c]));
const entriesById = new Map(entries.map((e) => [e.id, e]));
const headerOf = (txt) => {
  const h = {};
  for (const part of txt.split(/^%%\s*$/m).slice(0, -1)) for (const line of part.split('\n')) {
    const m = /^([\w-]+)\s*:\s*(.*?);?\s*$/.exec(line);
    if (m) h[m[1]] = m[2];
  }
  return h;
};
// Hymns GregoBase has with their first strophe only, completed with the same melody on every
// strophe of the full text, taken (already in syllables) from another form of the same hymn
// in the Liber Hymnarius: "Te lucis" ferial (p. 241) and for memorials, from its Sunday form (p. 242)
const COMPLETE_FROM = { 4680: 4677, 4681: 4677 };
const AMEN = { 8: 'A(ghg)men.(fg..)' };
const bodyOf = (txt) => { const parts = txt.split(/^%%\s*$/m); return parts[parts.length - 1]; };
function completeHymn(shortTxt, fullTxt, mode) {
  const short = bodyOf(shortTxt);
  const clef = /^\s*(\([cf]b?\d\))/.exec(short)?.[1] || '';
  const firstSrc = short.replace(/^\s*\([cf]b?\d\)/, '').split('(::)')[0].trim();
  const groups = (src) => [...src.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const isBar = (g) => /^[,;:]+$/.test(g);
  const tune = groups(firstSrc + ' (::)');
  const tuneNotes = tune.filter((g) => !isBar(g)), tuneBars = tune.filter(isBar);
  const strophes = bodyOf(fullTxt).replace(/^\s*\([cf]b?\d\)/, '').split(/\(::\)/).map((x) => x.trim()).filter((x) => /\(/.test(x));
  const out = [`${clef} ${firstSrc} (::)`];
  for (const st0 of strophes.slice(1)) {
    let st = st0;
    if (/^A\([^)]*\)\s*men\.?\([^)]*\)$/i.test(st)) { // the Amen on its own
      if (AMEN[mode]) out[out.length - 1] += ` ${AMEN[mode]} (::)`;
      continue;
    }
    const amen = /\s*A\([^)]*\)\s*men\.?\([^)]*\)\s*$/i.exec(st);
    if (amen) st = st.slice(0, amen.index);
    const g = groups(st + ' (::)');
    if (g.filter((x) => !isBar(x)).length !== tuneNotes.length || g.filter(isBar).length !== tuneBars.length) return null; // they do not scan alike
    let n = 0, b = 0;
    const done = (st + ' (::)').replace(/\(([^)]*)\)/g, (m, x) => `(${isBar(x) ? tuneBars[b++] : tuneNotes[n++]})`);
    out.push(`${done}${amen && AMEN[mode] ? ` ${AMEN[mode]} (::)` : ''}`);
  }
  return out.join('\n\n');
}
const sourceLabels = {};
for (const id of ids) {
  const oco = String(id).startsWith('oco-');
  const src = oco ? join(root, 'data/gabc-oco', `${String(id).slice(4)}.gabc`) : join(gabcCache, `${id}.gabc`);
  if (!existsSync(src)) { missing++; continue; }
  let txt = readFileSync(src, 'utf8');
  if (COMPLETE_FROM[id]) {
    const full = join(gabcCache, `${COMPLETE_FROM[id]}.gabc`);
    const mode = Number(headerOf(txt).mode) || 8;
    const done = existsSync(full) ? completeHymn(txt, readFileSync(full, 'utf8'), mode) : null;
    if (done) txt = txt.replace(/(^%%\s*$)(?![\s\S]*^%%\s*$)[\s\S]*/m, `$1\n${done}\n`).replace(/^name:/m, `completed-from: ${COMPLETE_FROM[id]};\nname:`);
    else console.log(`hymn ${id}: could not be completed from ${COMPLETE_FROM[id]}`);
  }
  const label = oco ? `OCO ${entriesById.get(Number(String(id).slice(4)))?.page ?? ''}`.trim() : gregobaseLabel(chantsById.get(Number(id)), headerOf(txt));
  sourceLabels[label.split(' ')[0]] = (sourceLabels[label.split(' ')[0]] || 0) + 1;
  writeFileSync(join(dist, 'gabc', `${id}.gabc`), `cantus-source: ${label.replace(/;/g, ',')};\n${oco ? '' : `gregobase-id: ${id};\n`}${txt}`);
  copied++;
}
console.log('score sources:', JSON.stringify(sourceLabels));

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
// psalm verses as jgabc takes them (Nova Vulgata where it matches): scripts/texts/verses.mjs
const verseStats = { fromNV: 0, total: 0 };
for (const d of Object.values(psalterium)) attachVerses(d.hours, root, verseStats);
writeFileSync(join(dist, 'data/psalterium.json'), JSON.stringify(psalterium));

// ---- texts of particular days ------------------------------------------------
// The committed psalter days plus the rolling window fetched by scripts/texts/window.mjs
// (cache/texts/days, not committed). Each date's own texts carry its propers.
let dayFiles = 0;
mkdirSync(join(dist, 'data/days'), { recursive: true });
for (const dir of [daysDir, join(root, 'cache/texts/days')]) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const day = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    attachVerses(day.hours, root, verseStats);
    writeFileSync(join(dist, 'data/days', f), JSON.stringify(day));
    dayFiles++;
  }
}

// ---- translations (scripts/texts/translations.mjs, cache/texts/tr/<lang>, not committed) ----
const trFiles = {};
for (const lang of ['en', 'zh']) {
  const dir = join(root, 'cache/texts/tr', lang);
  if (!existsSync(dir)) continue;
  mkdirSync(join(dist, 'data/tr', lang), { recursive: true });
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) cpSync(join(dir, f), join(dist, 'data/tr', lang, f));
  trFiles[lang] = readdirSync(dir).filter((f) => f.endsWith('.json')).length;
}
// the celebrations' names in Hong Kong's calendar, for the Chinese interface (scripts/calendar/zh_names.mjs)
mkdirSync(join(dist, 'data'), { recursive: true });
cpSync(join(root, 'data/calendar-zh.json'), join(dist, 'data/calendar-zh.json'));
// the translated four-week psalter (scripts/texts/psalter_translations.mjs, committed), keyed
// "week-dow" as data/psalterium.json: the weekday's parts on memorials
for (const lang of ['en', 'zh']) {
  const dir = join(root, 'data/texts/tr-psalter', lang);
  if (!existsSync(dir)) continue;
  const all = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) all[f.slice(0, -5)] = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  mkdirSync(join(dist, 'data/tr', lang), { recursive: true });
  writeFileSync(join(dist, 'data/tr', lang, 'psalter.json'), JSON.stringify(all));
  trFiles[`${lang}-psalter`] = Object.keys(all).length;
}
// the app's own translations of the OCO's texts that are not the Liturgia Horarum's (data/translations)
mkdirSync(join(dist, 'data/tr'), { recursive: true });
for (const lang of ['en']) {
  const own = JSON.parse(readFileSync(join(root, 'data/translations', `${lang}.json`), 'utf8'));
  delete own._;
  writeFileSync(join(dist, 'data/tr', `own-${lang}.json`), JSON.stringify(own));
  trFiles[`own-${lang}`] = Object.keys(own).length;
}

// ---- hymns: which translated hymn is the Latin one's, and the app's own English ----------
const hymnTable = JSON.parse(readFileSync(join(root, 'data/hymns/match.json'), 'utf8'));
const hymnEn = JSON.parse(readFileSync(join(root, 'data/hymns/en.json'), 'utf8'));
writeFileSync(join(dist, 'data/hymns.json'), JSON.stringify({ match: hymnTable, en: hymnEn }));
{ // Latin hymns of the window not judged yet in data/hymns/match.json, or without any English
  const { hymnKey } = await import('../site/translate.js');
  const unjudged = new Set(), noEnglish = new Set();
  for (const f of readdirSync(join(dist, 'data/days'))) {
    const day = JSON.parse(readFileSync(join(dist, 'data/days', f), 'utf8'));
    for (const secs of Object.values(day.hours || {})) {
      for (const sec of (secs || []).filter((x) => x.title === 'HYMNUS')) {
        sec.blocks.forEach((b, i) => {
          const prev = sec.blocks[i - 1];
          if (b.kind !== 'text' || !(i === 0 || (prev?.kind === 'rubric' && /^(Ad (Tertiam|Sextam|Nonam)|Vel:?)$/.test(prev.text)))) return;
          const k = hymnKey(typeof b.lines[0] === 'string' ? b.lines[0] : b.lines[0]?.text);
          if (!k || /^psalmodia/.test(k)) return;
          if (!(k in hymnTable)) unjudged.add(k);
          else if (!hymnTable[k].en && !hymnEn[k] && prev?.text !== 'Vel:' && prev?.text !== 'Vel') noEnglish.add(k);
        });
      }
    }
  }
  if (unjudged.size) console.log(`hymns not judged in data/hymns/match.json: ${[...unjudged].join('; ')}`);
  if (noEnglish.size) console.log(`hymns without English (data/hymns/en.json): ${[...noEnglish].join('; ')}`);
}

console.log(`dist/: ${compact.length} entries, ${copied} gabc files (${missing} missing), psalter days ${Object.keys(psalterium).length}/28, ${dayFiles} day files, verses ${verseStats.fromNV}/${verseStats.total} from the Nova Vulgata, translations ${JSON.stringify(trFiles)}`);
