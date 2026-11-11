#!/usr/bin/env node
// English names of the celebrations, by id (romcal's English localisation of the General Roman
// Calendar and of Hong Kong's), for the English interface: shown as the title with the Latin
// under it, as the Chinese interface does with Hong Kong's names (data/calendar-zh.json).
//
//   node scripts/calendar/en_names.mjs 2025 2032   -> data/calendar-en.json
import { writeFile } from 'node:fs/promises';
import { Romcal } from 'romcal';
import { GeneralRoman_En } from '@romcal/calendar.general-roman';
import { HongKong_En } from '@romcal/calendar.hong-kong';

const [from = '2025', to = '2032'] = process.argv.slice(2);
// Hong Kong's own days romcal names otherwise than the diocese's English Ordo
const HK = { dedication_of_the_cathedral_of_the_immaculate_conception_hong_kong: 'Anniversary of the Dedication of the Cathedral of the Immaculate Conception, Hong Kong' };
const names = {};
for (const localizedCalendar of [GeneralRoman_En, HongKong_En]) {
  const romcal = new Romcal({ localizedCalendar, scope: 'gregorian' });
  for (let y = Number(from); y <= Number(to); y++) {
    for (const days of Object.values(await romcal.generateCalendar(y))) for (const d of days) names[d.id] ??= HK[d.id] || d.name;
  }
}
const sorted = Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(new URL('../../data/calendar-en.json', import.meta.url), `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`${Object.keys(sorted).length} names`);
