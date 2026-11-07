// The texts of the Diocese of Hong Kong's calendar (the setting "Ordo"), where they are not
// the date's own iBreviary pages. iBreviary follows the Italian calendar: the Ascension and
// Corpus Christi on Sunday, as Hong Kong keeps them, but the Epiphany on 6 January, where
// Hong Kong keeps it on the Sunday between 2 and 8 January. So:
// - Hong Kong's Epiphany on a Sunday: the pages of 6 January (its I Vespers from 5 January,
//   on the Saturday before);
// - Hong Kong's days after the Epiphany ("Feria II post Epiphaniam"...) where the general
//   calendar has other days: the same day's pages in another year, where it has them;
// - the dedication of Hong Kong's cathedral (9 December): the dedication of a church as the
//   Lateran's feast has it (9 November), outside the cathedral itself.
// Days Hong Kong keeps otherwise as the general calendar (its patrons and proper memorials
// included) take the date's pages; the app resolves their antiphons and hymns from the OCO's
// commons.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHour, firstVespers, HOURS } from './ibreviary.mjs';

const cals = {};
const cal = (dir, iso) => {
  const k = `${dir}/${iso.slice(0, 4)}`;
  if (!(k in cals)) { try { cals[k] = JSON.parse(readFileSync(new URL(`../../site/data/${dir}/${iso.slice(0, 4)}.json`, import.meta.url), 'utf8')); } catch { cals[k] = {}; } }
  return cals[k][iso]?.[0] ?? null;
};
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekday = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Where Hong Kong's day `iso` takes its texts from: { date, id } (null: the date's own pages). */
export function hkDonor(iso) {
  const hk = cal('calendar-hk', iso), gen = cal('calendar', iso);
  if (!hk || !gen || hk.id === gen.id) return null;
  const y = Number(iso.slice(0, 4));
  if (hk.id === 'epiphany_of_the_lord') return { id: hk.id, date: `${y}-01-06` };
  if (hk.id === 'dedication_of_the_cathedral_of_the_immaculate_conception_hong_kong') return { id: 'dedication_of_the_lateran_basilica', date: `${y}-11-09` };
  if (/_after_epiphany$|^christmas_time_january_\d+$/.test(hk.id)) {
    // the same day in the general calendar, the nearest year first
    for (let k = 1; k <= 7; k++) for (const yy of [y - k, y + k]) {
      for (let d = 2; d <= 13; d++) {
        const other = `${yy}-01-${String(d).padStart(2, '0')}`;
        if (cal('calendar', other)?.id === hk.id) return { id: hk.id, date: other };
      }
    }
  }
  return null;
}
/** The Saturday before Hong Kong's Epiphany: its Vespers are the Epiphany's I Vespers. */
export function hkEve(iso) {
  const morrow = addDays(iso, 1);
  const d = weekday(iso) === 6 && hkDonor(morrow);
  return d && d.id === 'epiphany_of_the_lord' ? d : null;
}
export const hkKey = (iso) => { const d = hkDonor(iso), e = hkEve(iso); return d ? `${d.id}@${d.date}` : e ? `I Vesp. ${e.id}@${e.date}` : null; };

/** Write cache/texts/days-hk/<iso>.json when Hong Kong's day takes other pages; returns whether it does. */
export async function buildHkDay(iso, { ib, outDir = 'cache/texts/days-hk' }) {
  const donor = hkDonor(iso), eve = hkEve(iso);
  if (!donor && !eve) return false;
  const file = join(outDir, `${iso}.json`);
  if (existsSync(file)) { try { if (JSON.parse(readFileSync(file, 'utf8')).proper?.key === hkKey(iso)) return true; } catch {} }
  const day = { date: iso, hours: {} };
  const sources = {};
  for (const hour of Object.keys(HOURS)) {
    if (donor && hour !== 'completorium') { day.hours[hour] = parseHour(await ib.page(donor.date, hour)); sources[hour] = `${donor.date} ${hour}`; }
    else if (eve && hour === 'vesperae') day.hours[hour] = await firstVespers(ib, eve, sources);
    else day.hours[hour] = parseHour(await ib.page(iso, hour));
  }
  day.proper = { key: hkKey(iso), celebration: (donor || eve).id, sources };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(file, JSON.stringify(day, null, 1));
  return true;
}
