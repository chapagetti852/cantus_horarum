// Point every half-verse of the committed psalter days with each cadence of
// site/psalmtone.js, once with our engine and once with jgabc's (public domain), and
// report where the notes differ. Needs a jgabc checkout:
//   git clone --depth 1 https://github.com/bbloomf/jgabc /tmp/jgabc
//   JGABC=/tmp/jgabc node scripts/tones/compare_jgabc.mjs
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const jg = require('./jgabc.cjs');
const P = await import('../../site/psalmtone.js');
const R = new URL('../../', import.meta.url).pathname;
// every half-verse of the psalms and canticles in the committed psalter days
const halves = new Set();
for (const f of readdirSync(R + 'data/texts/days')) {
  const d = JSON.parse(readFileSync(R + 'data/texts/days/' + f));
  for (const h of Object.values(d.hours)) for (const s of h) for (const b of s.blocks) if (b.kind === 'psalm')
    for (const st of b.strophes) for (const v of P.versesOf(st)) {
      for (const part of ['mediant', 'termination']) {
        const t = v.filter((l) => l.part === part).map((l) => l.text.replace(/\s*[*†]\s*$/, '')).join(' ');
        if (t) halves.add(part[0] + '|' + t);
      }
    }
}
const norm = (n) => n.replace(/[.']/g, '');
let total = 0, same = 0, sylDiff = 0; const diffs = {};
for (const [tone, def] of Object.entries(P.TONES)) {
  const cads = [['m', def.mediant], ...Object.entries(def.endings).map(([e, s]) => ['t', s, e])];
  for (const [kind, str, e] of cads) {
    const cad = (() => { const g = str.trim().split(/\s+/).map((x) => { const accent = x[0] === "'"; if (accent) x = x.slice(1); const open = /r$/.test(x); if (open) x = x.slice(0, -1); return { notes: x, accent, open }; }); const t = g.findIndex((x) => x.open); return { intonation: g.slice(0, t).map((x) => x.notes), tenor: g[t].notes, groups: g.slice(t + 1) }; })();
    const gabc = kind === 'm' ? str.replace(/^.*?(\S+r\s)/, '$1') : str; // no intonation
    for (const h of halves) {
      if (h[0] !== kind) continue;
      const text = h.slice(2);
      let theirs;
      try { theirs = jg.applyPsalmTone({ text, gabc, clef: 'c4', lang: 'la' }); } catch { continue; }
      const tn = [...theirs.matchAll(/([^\s()]*)\(([^)]*)\)/g)].filter((m) => m[2] && !/^[,;:]/.test(m[2])).map((m) => norm(m[2]));
      const mine = P.pointHalf(P.syllabify(text), cad).map((s) => norm(s.notes));
      total++;
      if (tn.length !== mine.length) { sylDiff++; continue; }
      if (tn.join(' ') === mine.join(' ')) { same++; continue; }
      const key = `${tone}${e ?? ' med'}`;
      (diffs[key] ||= []).push(`${text}\n      jgabc: ${theirs}\n      mine : ${P.syllabify(text).map((s, i) => s.text.trim() + '(' + mine[i] + ')').join(' ')}`);
    }
  }
}
console.log({ total, same, sylDiff, differ: total - same - sylDiff });
for (const [k, v] of Object.entries(diffs).sort((a, b) => b[1].length - a[1].length)) console.log(k, v.length, '\n   ' + v.slice(0, 2).join('\n   '));
