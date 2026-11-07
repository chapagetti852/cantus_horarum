#!/usr/bin/env node
// The translations of the four-week psalter: the Hong Kong office and iBreviary in English
// for the quiet Ordinary Time dates of data/texts/psalter-days.json, the same days the Latin
// psalter is taken from. On a memorial sung from the weekday (setting "Memorials"), the
// short reading, responsory and intercessions are the weekday's: their translation comes from
// here when the translated office of the day took the saint's or the common's.
//
// Writes data/texts/tr-psalter/<lang>/<week>-<dow>.json (committed: past dates; Hong Kong's
// archive keeps about eighteen months). The build gathers them into
// dist/data/tr/<lang>/psalter.json.
//
// Usage: NODE_USE_ENV_PROXY=1 node scripts/texts/psalter_translations.mjs [zh|en]
// (Hong Kong's pages are read from cache/dlc/<date>/LH<n>.htm when there)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildChinese, buildEnglish } from './translations.mjs';
import { IBreviary } from './ibreviary.mjs';

const days = JSON.parse(readFileSync('data/texts/psalter-days.json', 'utf8'));
const langs = process.argv[2] ? [process.argv[2]] : ['zh', 'en'];
for (const lang of langs) {
  const dir = join('data/texts/tr-psalter', lang);
  mkdirSync(dir, { recursive: true });
  const ib = lang === 'en' ? new IBreviary({ lang: 'en' }) : null;
  let made = 0;
  for (const [key, iso] of Object.entries(days)) {
    if (key.startsWith('_')) continue;
    const file = join(dir, `${key}.json`);
    if (existsSync(file)) continue;
    try {
      const day = lang === 'en' ? await buildEnglish(iso, ib) : await buildChinese(iso);
      if (!day) { console.error(`${lang} ${key} (${iso}): not available`); continue; }
      writeFileSync(file, JSON.stringify(day));
      made++;
    } catch (e) { console.error(`${lang} ${key} (${iso}): ${e.message}`); }
  }
  console.log(`${lang}: ${made} psalter days made`);
}
