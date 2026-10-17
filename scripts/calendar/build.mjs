#!/usr/bin/env node
// Build the General Roman Calendar for a range of years with romcal (Latin
// localisation) and write one compact JSON file per year for the web app.
//
//   node scripts/calendar/build.mjs 2025 2030        -> site/data/calendar/2025.json ...
//
// Each file: { "YYYY-MM-DD": [ { id, name, rank, prec, seasons, week, dow,
// psalter, sunday, weekday, colors, optional, titles, commons } ... ] }
// The first entry of a day is the celebration romcal puts first (the one that
// outranks the others); optional memorials follow with optional: true.
import { mkdir, writeFile } from 'node:fs/promises';
import { Romcal } from 'romcal';
import { GeneralRoman_La } from '@romcal/calendar.general-roman';

const [from = String(new Date().getFullYear()), to = from] = process.argv.slice(2);
const outDir = new URL('../../site/data/calendar/', import.meta.url);
await mkdir(outDir, { recursive: true });

const romcal = new Romcal({ localizedCalendar: GeneralRoman_La, scope: 'gregorian' });
const PSALTER = { WEEK_1: 1, WEEK_2: 2, WEEK_3: 3, WEEK_4: 4 };

for (let year = Number(from); year <= Number(to); year++) {
  const cal = await romcal.generateCalendar(year);
  const out = {};
  for (const [date, days] of Object.entries(cal)) {
    out[date] = days.map((d) => ({
      id: d.id,
      name: d.name,
      rank: d.rank,
      prec: d.precedence,
      seasons: d.seasons,
      week: d.calendar.weekOfSeason,
      dow: d.calendar.dayOfWeek,
      psalter: PSALTER[d.cycles.psalterWeek] ?? null,
      sunday: d.cycles.sundayCycle?.replace('YEAR_', ''),
      weekday: d.cycles.weekdayCycle?.replace('YEAR_', ''),
      colors: d.colors,
      optional: d.isOptional || undefined,
      titles: d.titles?.length ? d.titles : undefined,
      commons: d.commonsDef?.length ? d.commonsDef : undefined,
    }));
  }
  await writeFile(new URL(`${year}.json`, outDir), JSON.stringify(out));
  console.log(`${year}: ${Object.keys(out).length} days`);
}
