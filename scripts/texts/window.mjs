#!/usr/bin/env node
// Keep a rolling window of iBreviary texts: every date from a few days back to some
// weeks ahead, so each day has its own propers (collects, readings' responsories,
// feasts). Days already fetched are kept; days that fell out of the window are removed.
//
// Usage:  node scripts/texts/window.mjs [daysBack=3] [daysAhead=35] [outDir=cache/texts/days]
// The build reads cache/texts/days as well as data/texts/days (the committed psalter days).
import { existsSync, mkdirSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { IBreviary, buildDay } from './ibreviary.mjs';

const back = Number(process.argv[2] ?? 3);
const ahead = Number(process.argv[3] ?? 35);
const outDir = process.argv[4] ?? 'cache/texts/days';

const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date(`${iso(new Date())}T12:00:00Z`);
const want = [];
for (let n = -back; n <= ahead; n++) want.push(iso(new Date(today.getTime() + n * 86400000)));

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) {
  if (f.endsWith('.json') && !want.includes(f.slice(0, 10))) unlinkSync(join(outDir, f));
}
// iBreviary's page cache (cache/ibreviary/la/<date>/) is pruned the same way
const htmlCache = 'cache/ibreviary/la';
if (existsSync(htmlCache)) {
  for (const d of readdirSync(htmlCache)) if (/^\d{4}-\d\d-\d\d$/.test(d) && d < want[0]) rmSync(join(htmlCache, d), { recursive: true, force: true });
}
const ib = new IBreviary();
let fetched = 0, failed = 0;
for (const d of want) {
  if (existsSync(join(outDir, `${d}.json`))) continue;
  try {
    await buildDay(d, { ib, outDir });
    fetched++;
    console.log(d);
  } catch (e) {
    failed++;
    console.error(`${d}: ${e.message}`);
  }
}
console.log(`window ${want[0]} .. ${want[want.length - 1]}: ${fetched} fetched, ${failed} failed`);
