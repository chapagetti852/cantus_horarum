#!/usr/bin/env node
// Open every chosen hour of a span of days in headless Chromium and note what looks wrong:
// page errors, an hour that could not be composed (.empty), a score missing (.missing), an
// antiphon printed as text for want of a score (.ant-text), an hour with hardly any score, an
// hour lacking one of its parts or its psalms.
//
// Usage: node scripts/build.mjs && node scripts/audit.cjs <from> <to> [hours] [settings json] [out.json]
//   node scripts/audit.cjs 2026-11-10 2027-11-30 laudes,vesperae
//   node scripts/audit.cjs 2027-03-20 2027-04-10 lectio,laudes,tertia,sexta,nona,vesperae,completorium '{"ordo":"hk"}'
//   node scripts/audit.cjs 2027-03-26,2027-03-28 - laudes          (chosen days)
// (about a second and a half an hour; DIST=<dir> to audit a copy of dist/ while building on)
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// the sections an hour is never without (keys of sectionHead in site/app.js)
const PARTS = {
  lectio: ['hymn', 'psalmody', 'oratio'],
  laudes: ['hymn', 'psalmody', 'reading', 'benedictus', 'preces', 'pater', 'oratio'],
  vesperae: ['hymn', 'psalmody', 'reading', 'magnificat', 'preces', 'pater', 'oratio'],
  tertia: ['hymn', 'psalmody', 'reading', 'oratio'], sexta: ['hymn', 'psalmody', 'reading', 'oratio'], nona: ['hymn', 'psalmody', 'reading', 'oratio'],
  completorium: ['hymn', 'psalmody', 'reading', 'nunc', 'oratio'],
};

(async () => {
  const [from, to, hoursArg = 'laudes,vesperae', settings = '{}', out = 'audit.json'] = process.argv.slice(2);
  if (!from || !to) { console.error('usage: node scripts/audit.cjs <from> <to> [hours] [settings json] [out.json]'); process.exit(1); }
  const dist = process.env.DIST || path.join(__dirname, '../dist');
  const hours = hoursArg.split(',');
  const port = 8300 + Math.floor(Math.random() * 200);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--directory', dist], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.addInitScript((s) => localStorage.setItem('settings', s), settings);
  let errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errs.push(`console: ${m.text().slice(0, 200)}`); });
  const rows = [];
  let n = 0;
  // a span of days, or chosen days ("2027-03-26,2027-03-28 -")
  const days = [];
  if (from.includes(',')) days.push(...from.split(','));
  else for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d = new Date(d.getTime() + 864e5)) days.push(d.toISOString().slice(0, 10));
  for (const iso of days) {
    for (const h of hours) {
      errs = [];
      await page.goto(`http://localhost:${port}/?n=${n++}#${iso}/${h}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !document.querySelector('#office .loading'), null, { timeout: 30000 }).catch(() => {});
      const r = await page.evaluate(() => ({
        title: document.querySelector('.title-block h1')?.textContent || '',
        empty: [...document.querySelectorAll('#office .empty')].map((x) => x.textContent),
        missing: document.querySelectorAll('#office .missing').length,
        antText: [...document.querySelectorAll('#office .ant-text')].map((x) => x.textContent.slice(0, 60)),
        scores: document.querySelectorAll('#office .score svg').length,
        secs: [...document.querySelectorAll('#office h2.section')].map((x) => x.dataset.sec),
        psalms: document.querySelectorAll('#office .psalm').length,
      }));
      // the parts every hour has (a psalmody without its psalms, an hour cut short)
      r.lacks = r.empty.length ? [] : (PARTS[h] || []).filter((k) => !r.secs.includes(k));
      if (!r.empty.length && r.psalms < (h === 'completorium' ? 1 : 3)) r.lacks.push(`${r.psalms} psalms`);
      delete r.secs;
      if (errs.length || r.empty.length || r.missing || r.antText.length || r.scores < 3 || r.lacks.length) rows.push({ at: `${iso}/${h}`, ...r, errs: [...new Set(errs)] });
    }
  }
  fs.writeFileSync(out, JSON.stringify(rows, null, 1));
  console.log(`${n} hours, ${rows.length} flagged -> ${out}`);
  for (const r of rows) console.log(r.at, '|', r.title.slice(0, 40), '|', [...r.empty, r.missing ? `${r.missing} missing` : '', ...new Set(r.antText), r.scores < 3 ? `${r.scores} scores` : '', r.lacks.length ? `lacks ${r.lacks.join(', ')}` : '', ...r.errs].filter(Boolean).join(' ; '));
  await browser.close(); srv.kill();
})();
