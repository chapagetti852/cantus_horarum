// Render SVGs to PNGs at exact sizes with headless Chromium (Playwright), transparent where
// the SVG is: node scripts/icons/render.cjs jobs.json, jobs = [{ svg, size, out }].
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); // [{svg, size, out}]
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const j of jobs) {
    await page.setViewportSize({ width: j.size, height: j.size });
    const svg = fs.readFileSync(j.svg, 'utf8').replace('<svg ', `<svg width="${j.size}" height="${j.size}" `);
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.screenshot({ path: j.out, omitBackground: true, clip: { x: 0, y: 0, width: j.size, height: j.size } });
  }
  await browser.close();
})();
