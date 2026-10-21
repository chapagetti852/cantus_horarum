#!/usr/bin/env node
// Translations of the daily office, shown under the Latin (an option in the settings):
//   en — iBreviary in English (the ICEL / Grail texts, United States calendar),
//   zh — the Hong Kong Diocesan Liturgy Commission's daily office, 每日日課
//        (catholic-dlc.org.hk, the Taiwan bishops' translation adapted for Hong Kong;
//        published a month at a time, one page per date and hour, in Big5).
// Both are read into one shape per hour, so the page can lay each piece under its Latin:
//   { hymn: [lines], psalms: [{ ant, ref, lines }], reading: { ref, lines },
//     responsory: [lines], gospel: { ant }, preces: [lines], oratio: [lines],
//     versicle: [lines], lectiones: [{ head, ref, title, lines, responsory }] }
// The little hours ("media") have hymns and their own parts under tertia / sexta / nona.
// For private use only, as the Latin texts.
//
// Usage:  node scripts/texts/translations.mjs [daysBack=3] [daysAhead=35] [outDir=cache/texts/tr]
//         -> <outDir>/<lang>/<date>.json, for the same window as window.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IBreviary, HOURS, parseHour } from './ibreviary.mjs';

// The shape of the files written: 2 adds the Gospel canticles' own text (gospel.lines).
const FORMAT = 2;

// ------------------------------------------------------------------ English (iBreviary)

const plain = (b) => (b.kind === 'text' ? b.lines.map((l) => (typeof l === 'string' ? l : l.text)) : []);
const isEm = (b) => b.kind === 'text' && b.lines.every((l) => typeof l !== 'string' && l.em);
const sec = (secs, re) => secs.find((s) => re.test(s.title || ''));
const NOISE = /^(Alternate Hymn|Psalmody|Go to the|Tune:|Text:|Music:|DISMISSAL)/;

/** Lines of a run of text blocks; "—" rubrics mark the response that follows. */
function runLines(blocks, { stop = null } = {}) {
  const out = [];
  let dash = false;
  for (const b of blocks) {
    if (stop && stop(b)) break;
    if (b.kind === 'rubric') { if (b.text === '—') dash = true; continue; }
    if (b.kind === 'antiphon') { out.push(b.text); continue; }
    if (b.kind !== 'text' || isEm(b)) continue;
    const ls = plain(b).filter((l) => l && !NOISE.test(l));
    if (!ls.length) continue;
    if (dash) { ls[0] = `— ${ls[0]}`; dash = false; }
    out.push(...ls);
  }
  return out;
}

function enHymn(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.kind === 'rubric' && b.text === 'Or:' && out.length) break;
    if (b.kind !== 'text' || isEm(b)) continue;
    const ls = plain(b);
    if (ls.some((l) => /^(Tune:|Text:|Music:|Psalmody)/.test(l))) { if (out.length) break; continue; }
    if (ls.length === 1 && /^Alternate Hymn$/.test(ls[0])) continue;
    out.push(...ls, '');
  }
  return out.slice(0, -1);
}

function enPsalms(blocks) {
  const items = [];
  let cur = null, skip = false, titled = false;
  for (const b of blocks) {
    if (b.kind === 'antiphon') {
      if (cur && !cur.lines.length && !cur.ref) { cur.ant = b.text; continue; }
      if (cur && cur.ant && sameText(cur.ant, b.text) && cur.lines.length) continue; // its repetition
      cur = { ant: b.text, ref: null, lines: [] }; items.push(cur); titled = false; skip = false; continue;
    }
    if (!cur) continue;
    if (b.kind === 'psalm') { // the parser's own reading of a psalm in parts
      if (b.ref || b.part) cur.ref = [cur.ref, b.ref, b.part].filter(Boolean).join(' ');
      for (const st of b.strophes) { if (cur.lines.length) cur.lines.push(''); cur.lines.push(...st); }
      continue;
    }
    if (b.kind === 'rubric') {
      if (/^(Psalm|Canticle)\b/.test(b.text) && b.text !== 'Psalm Prayer') { cur.ref = cur.ref ? `${cur.ref}; ${b.text}` : b.text; titled = false; continue; }
      if (b.text === 'Psalm Prayer') { skip = true; continue; }
      if (/^[IVX]+$/.test(b.text)) { cur.ref = cur.ref ? `${cur.ref} ${b.text}` : b.text; continue; }
      if (!titled && b.text !== '—') { titled = true; continue; } // the psalm's title
      continue;
    }
    if (b.kind !== 'text' || isEm(b)) continue;
    if (skip) { skip = false; continue; }
    const ls = plain(b).filter((l) => !NOISE.test(l) && l !== '- Menu -');
    if (ls.length) { if (cur.lines.length) cur.lines.push(''); cur.lines.push(...ls); }
  }
  return items.filter((x) => x.lines.length);
}
const sameText = (a, b) => a.replace(/\W/g, '').toLowerCase() === b.replace(/\W/g, '').toLowerCase();

function enReading(blocks) {
  const ref = blocks.find((b) => b.kind === 'rubric')?.text || null;
  const lines = blocks.filter((b) => b.kind === 'text' && !isEm(b)).flatMap(plain).filter((l) => !NOISE.test(l));
  return lines.length ? { ref, lines } : null;
}

function enOratio(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.kind === 'rubric') { if (out.length) break; continue; }
    if (b.kind !== 'text') continue;
    const ls = plain(b);
    if (ls.length === 1 && /^Let us pray\.?$/.test(ls[0])) continue;
    out.push(...ls);
  }
  return out;
}

function enLectiones(blocks) {
  const out = [];
  let cur = null, mode = 'head';
  for (const b of blocks) {
    if (b.kind === 'rubric' && /^(FIRST|SECOND) READING$/.test(b.text)) { cur = { head: b.text, ref: null, title: null, lines: [], responsory: [] }; out.push(cur); mode = 'head'; continue; }
    if (!cur) continue;
    if (b.kind === 'rubric' && /^RESPONSORY$/i.test(b.text)) { mode = 'resp'; continue; }
    if (mode === 'resp') { if (b.kind === 'rubric' && b.text === '—') cur.responsory.push('—'); else if (b.kind === 'text') cur.responsory.push(...plain(b)); continue; }
    if (b.kind === 'rubric') { if (!cur.ref && /\d/.test(b.text)) cur.ref = b.text; else if (!cur.title) cur.title = b.text; continue; }
    if (b.kind === 'text') { const ls = plain(b); if (!cur.lines.length && !cur.ref && ls.length === 1) cur.source = ls[0]; else cur.lines.push(...ls); }
  }
  for (const l of out) l.responsory = l.responsory.reduce((a, x) => (x === '—' ? (a.dash = true, a) : (a.push(a.dash ? `— ${x}` : x), a.dash = false, a)), []);
  return out;
}

export function englishHour(hour, secs) {
  const h = {};
  const hymn = sec(secs, /^HYMN$/), ps = sec(secs, /^PSALMODY$/);
  if (hour === 'media') {
    h.hymn = {};
    const names = { tertia: /Terce/, sexta: /Sext/, nona: /None/ };
    if (hymn) {
      for (const [k, re] of Object.entries(names)) {
        const at = hymn.blocks.findIndex((b) => b.kind === 'rubric' && re.test(b.text));
        if (at >= 0) h.hymn[k] = enHymn(hymn.blocks.slice(at + 1));
      }
    }
    for (const [k, re] of Object.entries(names)) {
      const s = secs.find((x) => re.test(x.title || ''));
      if (!s) continue;
      const rd = s.blocks.findIndex((b) => b.kind === 'rubric' && /\d/.test(b.text));
      const pr = s.blocks.findIndex((b) => b.kind === 'text' && /^Let us pray/.test(plain(b)[0] || ''));
      h[k] = {
        reading: rd >= 0 ? enReading(s.blocks.slice(rd, pr > rd ? s.blocks.findIndex((b, i) => i > rd && b.kind === 'text' && plain(b).length <= 2 && i > rd + 1) : undefined)) : null,
        oratio: pr >= 0 ? enOratio(s.blocks.slice(pr)) : [],
      };
    }
  } else if (hymn) h.hymn = enHymn(hymn.blocks);
  if (ps) {
    h.psalms = enPsalms(ps.blocks);
    // the versicle after the last antiphon (Office of Readings)
    const last = ps.blocks.map((b) => b.kind).lastIndexOf('antiphon');
    if (hour === 'lectio' && last >= 0) { const v = runLines(ps.blocks.slice(last + 1)); if (v.length) h.versicle = v; }
  }
  const rd = sec(secs, /^READING$/);
  if (rd) h.reading = enReading(rd.blocks);
  const rs = sec(secs, /^RESPONSORY$/);
  if (rs) {
    // iBreviary sets the response and the verse together first, then the responsory in full
    const first = rs.blocks.find((b) => b.kind === 'text');
    const rest = rs.blocks.slice(rs.blocks.indexOf(first) + 1);
    const later = rest.filter((b) => b.kind === 'text').flatMap(plain).join(' ');
    const skip = first && plain(first).length > 1 && plain(first).every((l) => later.includes(l)) ? [first] : [];
    h.responsory = runLines(rs.blocks.filter((b) => !skip.includes(b)), { stop: (b) => b.kind === 'rubric' && /antiphon for the Gospel/i.test(b.text) });
  }
  const gc = sec(secs, /^GOSPEL CANTICLE$/);
  if (gc) {
    const a = gc.blocks.find((b) => b.kind === 'antiphon');
    // the canticle itself, a strophe per block, to lay verse by verse under the Latin
    const lines = gc.blocks.filter((b) => b.kind === 'text' && !isEm(b)).flatMap((b) => ['', ...plain(b).map((l) => l.replace(/^My \+ /, 'My '))]).slice(1);
    if (a || lines.length) h.gospel = { ant: a?.text || null, lines };
  }
  const pc = sec(secs, /^INTERCESSIONS$/);
  if (pc) h.preces = runLines(pc.blocks);
  const or = sec(secs, /^CONCLUDING PRAYER$/);
  if (or) h.oratio = enOratio(or.blocks);
  const lc = sec(secs, /^READINGS$/);
  if (lc) h.lectiones = enLectiones(lc.blocks);
  return h;
}

// ------------------------------------------------------------------ Chinese (Hong Kong DLC)

const DLC = 'http://catholic-dlc.org.hk/';
const ZH_PAGES = { laudes: 1, media: 2, vesperae: 3, lectio: 4, completorium: 5 };

/** A DLC page as text lines (Big5; Word's HTML, its comments and styles left out). */
export function dlcLines(buf) {
  const s = new TextDecoder('big5').decode(buf);
  const body = s.replace(/<(script|style|xml)[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const t = body.replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/h\d>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)));
  return t.split('\n').map((l) => l.replace(/[　\s]+/g, ' ').trim()).filter(Boolean);
}

const ANT = /^對經[一二三四五]?[：:](.*)$/;
const PSALM_HEAD = /^(聖詠|聖歌|讚美曲|頌歌)\s*\S/;

function zhPsalms(lines) {
  const items = [];
  let cur = null;
  for (const l of lines) {
    const a = ANT.exec(l);
    if (a) {
      const ant = a[1].trim();
      if (cur && !cur.lines.length) { cur.ant = ant; continue; }
      if (cur && cur.ant === ant) { cur = null; continue; } // its repetition closes the psalm
      cur = { ant, ref: null, lines: [] }; items.push(cur); continue;
    }
    if (!cur) continue;
    if (PSALM_HEAD.test(l) && !cur.lines.length) { cur.ref = l; continue; }
    if (/^[壹貳參叁肆伍]$/.test(l)) { cur.ref = cur.ref ? `${cur.ref} ${l}` : l; continue; }
    if (/^「.*」/.test(l) && !cur.lines.length) continue; // the psalm's sentence
    cur.lines.push(l);
  }
  return items.filter((x) => x.lines.length);
}

const between = (lines, from, to) => {
  const a = lines.findIndex((l) => from.test(l));
  if (a < 0) return [];
  const rest = lines.slice(a + 1);
  const b = rest.findIndex((l) => to.test(l));
  return b < 0 ? rest : rest.slice(0, b);
};
const GOSPEL = /讚主曲|謝主曲|西默盎/;
const zhReading = (lines, start = 0) => {
  const at = lines.findIndex((l, i) => i >= start && /^簡短讀經/.test(l));
  if (at < 0) return null;
  const ref = lines[at].replace(/^簡短讀經\s*/, '').trim() || null;
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((l) => /^(短對答詠|對答詞|結束禱詞|匝加利亞|聖母讚主曲|西默盎)/.test(l));
  return { ref, lines: end < 0 ? rest : rest.slice(0, end) };
};
const zhOratio = (ls) => ls.filter((l) => !/^(請大家祈禱|請眾祈禱|領：請大家祈禱)/.test(l) && !/^(眾|答)[：:]\s*亞孟/.test(l));

export function chineseHour(hour, lines) {
  const h = {};
  const END = /^(聖詠吟唱|夜間或清晨用|日間用)$/;
  if (hour === 'media') {
    h.hymn = {};
    const parts = { tertia: /^午前/, sexta: /^午時/, nona: /^午後/ };
    // the hymns come first under 午前 / 午時 / 午後, the parts of each hour after the psalmody
    const psAt = lines.findIndex((l) => l === '聖詠吟唱');
    const head = psAt < 0 ? lines : lines.slice(0, psAt), tail = psAt < 0 ? [] : lines.slice(psAt + 1);
    for (const [k, re] of Object.entries(parts)) h.hymn[k] = between(head, re, /^(午前|午時|午後|聖詠吟唱)/);
    const firstPart = tail.findIndex((l) => /^午前$/.test(l));
    h.psalms = zhPsalms(firstPart < 0 ? tail : tail.slice(0, firstPart));
    for (const [k, re] of Object.entries(parts)) {
      const own = between(tail, new RegExp(`${re.source}$`), /^(午前|午時|午後)$/);
      h[k] = { reading: zhReading(own), versicle: between(own, /^對答詞/, /^結束禱詞/), oratio: zhOratio(between(own, /^結束禱詞/, /^結束詞/)) };
    }
    return h;
  }
  if (hour === 'lectio') {
    h.hymn = between(lines, /^夜間或清晨用/, /^(日間用|聖詠吟唱)/);
    if (!h.hymn.length) h.hymn = between(lines, /^讚美詩/, END);
  } else h.hymn = between(lines, /^讚美詩$/, END);
  const psalmody = between(lines, /^聖詠吟唱$/, /^(簡短讀經|誦讀一|短對答詠)/);
  h.psalms = zhPsalms(psalmody);
  if (hour === 'lectio') {
    // the versicle closes the psalmody: 領：… 眾：…
    const lastAnt = psalmody.map((l) => ANT.test(l)).lastIndexOf(true);
    const tailVs = psalmody.slice(lastAnt + 1).filter((l) => /^(領|眾|答)[：:]/.test(l));
    if (tailVs.length) h.versicle = tailVs;
    h.lectiones = [];
    for (const [head, re] of [['誦讀一', /^誦讀一$/], ['誦讀二', /^誦讀二$/]]) {
      const ls = between(lines, re, /^(誦讀二|結束禱詞|讚美頌|謝主頌)/);
      if (!ls.length) continue;
      const r = ls.findIndex((l) => /^(短)?對答詠/.test(l));
      const body = r < 0 ? ls : ls.slice(0, r);
      const title = body.find((l) => /^（.*）$/.test(l)) || null;
      h.lectiones.push({ head, ref: body[0] || null, title, lines: body.slice(1).filter((l) => l !== title), responsory: r < 0 ? [] : ls.slice(r + 1) });
    }
  } else {
    h.reading = zhReading(lines);
    h.responsory = between(lines, /^短對答詠$/, /(讚主曲|謝主曲|西默盎|^\(路)/);
    const gAt = lines.findIndex((l) => GOSPEL.test(l));
    if (gAt >= 0) {
      const a = lines.slice(gAt).find((l) => ANT.test(l));
      // the canticle: after its reference "(路1:46-55)", up to the antiphon's repetition
      const from = lines.findIndex((l, i) => i > gAt && /^\(路/.test(l));
      const to = from < 0 ? -1 : lines.findIndex((l, i) => i > from && (ANT.test(l) || /^(結束禱詞|禱詞)$/.test(l)));
      h.gospel = { ant: a ? ANT.exec(a)[1].trim() : null, lines: from < 0 ? [] : lines.slice(from + 1, to < 0 ? undefined : to) };
    }
    const pr = between(lines, /^禱詞$/, /^(天主經|結束禱詞)$/);
    if (pr.length) h.preces = pr;
  }
  h.oratio = zhOratio(between(lines, /^結束禱詞$/, /^(結束詞|聖母對經)/));
  return h;
}

async function fetchDlc(iso, n, cacheDir = 'cache/dlc') {
  const file = join(cacheDir, iso, `LH${n}.htm`);
  if (existsSync(file)) return readFileSync(file);
  const url = `${DLC}LH${n}_${iso.replace(/-/g, '')}.htm`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) return null; // not yet published (a month at a time)
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(join(cacheDir, iso), { recursive: true });
  writeFileSync(file, buf);
  await new Promise((r) => setTimeout(r, 800));
  return buf;
}

export async function buildEnglish(iso, ib) {
  const day = { date: iso, lang: 'en', source: 'iBreviary (English)', hours: {} };
  for (const hour of Object.keys(HOURS)) day.hours[hour] = englishHour(hour, parseHour(await ib.page(iso, hour)));
  return day;
}

export async function buildChinese(iso) {
  const day = { date: iso, lang: 'zh', source: '天主教香港教區禮儀委員會 每日日課', hours: {} };
  for (const [hour, n] of Object.entries(ZH_PAGES)) {
    const buf = await fetchDlc(iso, n);
    if (!buf) return null;
    day.hours[hour] = chineseHour(hour, dlcLines(buf));
  }
  return day;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const back = Number(process.argv[2] ?? 3), ahead = Number(process.argv[3] ?? 35);
  const outDir = process.argv[4] ?? 'cache/texts/tr';
  const isoOf = (d) => d.toISOString().slice(0, 10);
  const today = new Date(`${isoOf(new Date())}T12:00:00Z`);
  const want = [];
  for (let n = -back; n <= ahead; n++) want.push(isoOf(new Date(today.getTime() + n * 86400000)));
  const ib = new IBreviary({ lang: 'en' });
  for (const lang of ['en', 'zh']) {
    const dir = join(outDir, lang);
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) if (f.endsWith('.json') && !want.includes(f.slice(0, 10))) unlinkSync(join(dir, f));
    let made = 0, missing = 0;
    for (const d of want) {
      const file = join(dir, `${d}.json`);
      // made again from the cached pages when the shape has changed since (FORMAT)
      if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).v === FORMAT) continue;
      try {
        const day = lang === 'en' ? await buildEnglish(d, ib) : await buildChinese(d);
        if (!day) { missing++; continue; }
        writeFileSync(file, JSON.stringify({ v: FORMAT, ...day }));
        made++;
      } catch (e) { missing++; console.error(`${lang} ${d}: ${e.message}`); }
    }
    console.log(`${lang}: ${made} made, ${missing} not available`);
  }
}
