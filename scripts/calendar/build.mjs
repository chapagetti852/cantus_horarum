#!/usr/bin/env node
// Build the General Roman Calendar for a range of years with romcal (Latin
// localisation) and write one compact JSON file per year for the web app; and the calendar
// of the Diocese of Hong Kong (@romcal/calendar.hong-kong: the Epiphany, the Ascension and
// Corpus Christi on Sunday, its patrons and proper days), for the setting "Ordo".
//
//   node scripts/calendar/build.mjs 2025 2030        -> site/data/calendar/2025.json ...
//                                                       site/data/calendar-hk/2025.json ...
//
// Each file: { "YYYY-MM-DD": [ { id, name, rank, prec, seasons, week, dow,
// psalter, sunday, weekday, colors, optional, titles, commons } ... ] }
// The first entry of a day is the celebration romcal puts first (the one that
// outranks the others); optional memorials follow with optional: true.
import { mkdir, writeFile } from 'node:fs/promises';
import { Romcal } from 'romcal';
import { GeneralRoman_La } from '@romcal/calendar.general-roman';
import { HongKong_La } from '@romcal/calendar.hong-kong';

const [from = String(new Date().getFullYear()), to = from] = process.argv.slice(2);
// Hong Kong's proper days as its own Ordo and daily office keep them (catholic-dlc.org.hk):
// the Holy Martyrs and Blesseds of China a feast (中華諸聖及真福（慶日）, not a solemnity), the
// names in Latin where romcal has only English, and the commons Hong Kong gives them
const HK = {
  holy_martyrs_and_blesseds_of_china: { name: 'Ss. Martyrum et Beatorum Sinarum', rank: 'FEAST', commons: ['Martyrs'] },
  gabriele_maria_allegra_priest: { name: 'B. Gabrielis Mariæ Allegra, presbyteri', commons: ['Pastors'] },
  joseph_freinademetz_priest: { commons: ['Pastors'] },
  our_lady_of_china: { commons: ['BlessedVirginMary'] },
  our_lady_help_of_christians: { commons: ['BlessedVirginMary'] },
  // a feast of the diocese, kept everywhere in it (romcal marks it optional)
  dedication_of_the_cathedral_of_the_immaculate_conception_hong_kong: { name: 'In anniversario dedicationis ecclesiæ cathedralis Immaculatæ Conceptionis Hongcongensis', optional: undefined, first: true },
};
// romcal's Lunar New Year entries are Masses: Hong Kong's office those days is the day's own
const HK_LEAVE = /lunar_new_year/;
const PSALTER = { WEEK_1: 1, WEEK_2: 2, WEEK_3: 3, WEEK_4: 4 };
for (const [dir, localizedCalendar, fix] of [['calendar', GeneralRoman_La, {}], ['calendar-hk', HongKong_La, HK]]) {
const outDir = new URL(`../../site/data/${dir}/`, import.meta.url);
await mkdir(outDir, { recursive: true });
const romcal = new Romcal({ localizedCalendar, scope: 'gregorian' });
for (let year = Number(from); year <= Number(to); year++) {
  const cal = await romcal.generateCalendar(year);
  const out = {};
  for (const [date, days] of Object.entries(cal)) {
    out[date] = days.filter((d) => !(fix === HK && HK_LEAVE.test(d.id))).map((d) => ({
      id: d.id,
      name: d.name.replace(/\bquartra\b/, 'quarta'), // romcal's Latin misspells it
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
      ...(fix[d.id] || {}),
    }));
    const first = out[date].findIndex((c) => c.first);
    if (first > 0) out[date].unshift(...out[date].splice(first, 1));
    for (const c of out[date]) delete c.first;
  }
  await writeFile(new URL(`${year}.json`, outDir), JSON.stringify(out));
  console.log(`${dir} ${year}: ${Object.keys(out).length} days`);
}
}
