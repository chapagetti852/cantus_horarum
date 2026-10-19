// Group a psalm's printed lines into verses, as jgabc's psalm-tone tool takes them: one
// verse per line, "first half † flex * second half". The verse boundaries come from the
// Nova Vulgata psalter that jgabc ships (data/novavulgata, one verse per line) wherever
// its verse is word for word what iBreviary prints and ends where a printed line ends;
// elsewhere (the Liturgia Horarum sometimes divides or cuts a verse otherwise) the printed
// lines are grouped by their * and †. The words stay the Liturgia Horarum's (iBreviary's
// accents and punctuation); only the Nova Vulgata's diaereses are taken over (Israël),
// as they tell the syllables apart.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { versesOf } from '../../site/psalmtone.js';

const norm = (t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/j/g, 'i').replace(/[^a-z ]+/g, ' ').trim().split(/\s+/).filter(Boolean);

let index = null;
function load(root) {
  if (index) return index;
  const lines = [];
  const take = (text) => {
    for (const l of text.split('\n')) {
      // verse numbers stand at the start of lines and sometimes inside them
      const t = l.replace(/^﻿/, '').replace(/(^|\s)\d+(?=\s)/g, ' ').replace(/\s+/g, ' ').trim();
      if (t.includes('*')) lines.push(t);
    }
  };
  take(readFileSync(join(root, 'data/novavulgata/psalmi.txt'), 'utf8'));
  for (const f of readdirSync(join(root, 'data/novavulgata/cantica'))) take(readFileSync(join(root, 'data/novavulgata/cantica', f), 'utf8'));
  // the doxology as the Liturgia Horarum prints it
  take('Glória Patri, et Fílio, * et Spirítui Sancto.\nSicut erat in princípio, et nunc et semper, * et in sǽcula sæculórum. Amen.');
  index = new Map();
  for (const l of lines) {
    const w = norm(l.replace(/[*†]/g, ' '));
    const k = w.slice(0, 4).join(' ');
    if (!index.has(k)) index.set(k, []);
    index.get(k).push({ w, tokens: l.replace(/[*†]/g, ' ').split(/\s+/).filter((t) => norm(t).length) });
  }
  return index;
}

const joinLines = (ls) => ls.map((l) => l.text.trim()).join(' ').replace(/\s*\*\s*/g, ' * ').replace(/\s*†\s*/g, ' † ').trim();

/** The verse's words, with the Nova Vulgata's diaereses where the words agree otherwise. */
function withDiaereses(verse, nvTokens) {
  let k = 0;
  return verse.replace(/[^\s*†]+/g, (tok) => {
    if (!norm(tok).length) return tok;
    const nv = nvTokens[k++];
    if (!nv || !/[ëïü]/i.test(nv)) return tok;
    const word = nv.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    return tok.replace(/[\p{L}\p{M}]+/u, (w) => (norm(w).join('') === norm(word).join('') ? word : w));
  });
}

/** strophes: [[printed line…]…] -> [[verse…]…], each verse "… † … * …" */
export function versesForStrophes(strophes, root) {
  const idx = load(root);
  const lines = strophes.flatMap((st, s) => st.map((text) => ({ text, s })));
  const words = lines.map((l) => norm(l.text.replace(/[*†]/g, ' ')));
  const out = strophes.map(() => []);
  let i = 0;
  let fromNV = 0, total = 0;
  while (i < lines.length) {
    // the Nova Vulgata verse that starts here and ends at the end of a printed line
    const W = words.slice(i).flat();
    let best = null;
    for (const c of idx.get(W.slice(0, 4).join(' ')) || []) {
      if (c.w.length > W.length || !c.w.every((w, k) => W[k] === w)) continue;
      let n = 0, j = i;
      while (j < lines.length && n < c.w.length) n += words[j++].length;
      if (n === c.w.length && (!best || c.w.length > best.c.w.length)) best = { c, j };
    }
    total++;
    if (best) {
      out[lines[i].s].push(withDiaereses(joinLines(lines.slice(i, best.j)), best.c.tokens));
      i = best.j;
      fromNV++;
      continue;
    }
    const [v] = versesOf(lines.slice(i).map((l) => l.text));
    const k = Math.max(1, v ? v.length : 1);
    out[lines[i].s].push(joinLines(lines.slice(i, i + k)));
    i += k;
  }
  return { strophes: out.filter((x) => x.length), fromNV, total };
}

/** Attach `verses` to every psalm and canticle block of a day's hours. */
export function attachVerses(hours, root, stats = { fromNV: 0, total: 0 }) {
  for (const sections of Object.values(hours || {})) {
    for (const s of sections || []) {
      for (const b of s.blocks || []) {
        let strophes = null;
        if (b.kind === 'psalm' && b.strophes?.length) strophes = b.strophes;
        else if (b.kind === 'text' && b.lines?.some((l) => typeof l === 'string' && /\*\s*$/.test(l))) strophes = [b.lines.filter((l) => typeof l === 'string')];
        if (!strophes) continue;
        const r = versesForStrophes(strophes, root);
        b.verses = r.strophes;
        stats.fromNV += r.fromNV;
        stats.total += r.total;
      }
    }
  }
  return stats;
}
