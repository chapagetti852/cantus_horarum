#!/usr/bin/env node
// Which sung texts of the window have no English: every date and hour of dist/ opened in
// headless Chromium with the English translation on; the app notes in window.__trMissing the
// OCO antiphons and responsories that are not the Liturgia Horarum's and have no translation
// in data/translations/en.json, and in window.__trMissingHymns the hymns without English.
//
// Usage: node scripts/build.mjs && node scripts/texts/missing_translations.cjs [from] [to] > missing.json
//        (dates YYYY-MM-DD; default: the dates of dist/data/tr/en)
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '../../dist');
const HOURS = ['lectio', 'laudes', 'tertia', 'sexta', 'nona', 'vesperae', 'completorium'];

(async () => {
  let dates = fs.readdirSync(path.join(dist, 'data/tr/en')).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
  const [from, to] = process.argv.slice(2);
  if (from) dates = dates.filter((d) => d >= from && (!to || d <= to));
  const port = 8400 + Math.floor(Math.random() * 100);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--directory', dist], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.addInitScript(() => localStorage.setItem('settings', JSON.stringify({ translation: 'en' })));
  const texts = new Map(), hymns = new Map();
  let n = 0;
  for (const d of dates) {
    for (const h of HOURS) {
      await page.goto(`http://localhost:${port}/?n=${n++}#${d}/${h}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !document.querySelector('#office .loading'), null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(150);
      const got = await page.evaluate(() => ({ t: [...(window.__trMissing || [])], h: [...(window.__trMissingHymns || [])] }));
      for (const t of got.t) if (!texts.has(t)) texts.set(t, `${d}/${h}`);
      for (const k of got.h) if (!hymns.has(k)) hymns.set(k, `${d}/${h}`);
    }
    process.stderr.write(`${d}: ${texts.size} texts, ${hymns.size} hymns without English\n`);
  }
  await browser.close(); srv.kill();
  console.log(JSON.stringify({ texts: [...texts].map(([latin, at]) => ({ latin, at })), hymns: [...hymns].map(([key, at]) => ({ key, at })) }, null, 1));
})();
