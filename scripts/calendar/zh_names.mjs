#!/usr/bin/env node
// The celebrations' names in Chinese, as the Hong Kong Diocesan Liturgy Commission's daily
// office (每日日課, catholic-dlc.org.hk) names them, for the Chinese interface: every page of
// Lauds (LH1_<date>.htm) opens with the day's title, "十一月十一日 聖瑪爾定主教．都爾（紀念）
// （牧者通用）晨禱", or a weekday with its optional memorials, "常年期第十三周星期一 或 羅馬教會
// 初期殉道烈士（自由紀念）（聖詠集第一周）". The name (without the date, the rank, the psalter's
// week, the common) is matched to the romcal celebration of that date (site/data/calendar):
// the day's own, then the optional memorials in the order Hong Kong gives them.
//
// Left out: Hong Kong's own celebrations ("香港教區：…", not in the general calendar the app
// follows), and a day whose kind differs (Hong Kong keeps the Ascension, the Epiphany and
// Corpus Christi on Sunday: a weekday or Sunday of the general calendar against a feast, or
// the reverse). Those moved solemnities are named in MOVED below, from the same pages.
//
// Usage: node scripts/calendar/zh_names.mjs [pages dir, default cache/dlc] -> data/calendar-zh.json
// (the pages of 2025-05 to 2026-11 were read; run it again on newer ones to add to the table)
// (the pages: cache/dlc/<date>/LH1.htm, as scripts/texts/translations.mjs caches them; the
// archive online reaches back about eighteen months, so the table is kept and only added to)
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dlcLines } from '../texts/translations.mjs';

const dir = process.argv[2] || 'cache/dlc';
const out = existsSync('data/calendar-zh.json') ? JSON.parse(readFileSync('data/calendar-zh.json', 'utf8')) : {};
// the solemnities Hong Kong moves to Sunday, by their names on its pages
const MOVED = { epiphany_of_the_lord: '主顯節', ascension_of_the_lord: '耶穌升天節', most_holy_body_and_blood_of_christ: '基督聖體聖血節' };
// Hong Kong's slips, set as it names the like elsewhere ("教宗聖保祿六世", "教宗聖西斯篤二世")
const FIX = { pius_x_pope: '教宗聖比約十世', easter_time_4_thursday: '復活期第四周星期四', bonaventure_of_bagnoregio_bishop: '聖文德主教（聖師）', most_sacred_heart_of_jesus: '耶穌聖心節' };
// celebrations the daily office's archive has not shown (on a Sunday, in Lent, at another
// date in Hong Kong), as Hong Kong's Ordo prints them (天主教羅馬禮禮儀日曆, ordo_2022-2023 to
// ordo_2025-2026.pdf, catholic-dlc.org.hk/c-ordo.htm), and the Vespers page's title of Holy
// Thursday evening
const ORDO = {
  ambrose_of_milan_bishop: '聖安博主教（聖師）',
  augustine_zhao_rong_priest_and_companions_martyrs: '聖趙榮司鐸及同伴（殉道）',
  bede_the_venerable_priest: '聖伯達司鐸（聖師）',
  casimir_of_poland: '聖加西彌祿',
  chair_of_saint_peter_the_apostle: '建立聖伯多祿宗座',
  conversion_of_saint_paul_the_apostle: '聖保祿宗徒歸化',
  cyril_of_jerusalem_bishop: '聖濟利祿主教．耶路撒冷（聖師）',
  frances_of_rome_religious: '聖方濟加．羅馬（會士）',
  gregory_of_narek_abbot: '聖額我略．納謙院長（聖師）',
  gregory_vii_pope: '教宗聖額我略七世',
  holy_innocents_martyrs: '諸聖嬰孩（殉道）',
  irenaeus_of_lyon_bishop: '聖依勒內主教（殉道、聖師）',
  jerome_emiliani: '聖熱羅尼莫．艾明廉',
  joachim_and_anne_parents_of_mary: '聖若亞敬及聖亞納（聖母雙親）',
  john_baptist_de_la_salle_priest: '聖若翰喇沙司鐸',
  john_of_avila_priest: '聖若望．亞維拉司鐸（聖師）',
  john_of_god_duarte_cidade_religious: '聖若望由天主者（會士）',
  john_of_kanty_priest: '聖若望．甘迪司鐸',
  john_of_the_cross_priest: '聖十字若望司鐸（聖師）',
  josephine_bakhita_virgin: '聖若瑟芬．柏姬達（貞女）',
  juan_diego_cuauhtlatoatzin: '聖若望．迪達谷（高樂多）',
  mary_magdalene_de_pazzi_virgin: '聖瑪達肋納巴斯（貞女）',
  patrick_of_ireland_bishop: '聖博德主教',
  perpetua_of_carthage_and_felicity_of_carthage_martyrs: '聖伯爾都亞及聖斐尼絲（殉道）',
  peter_canisius_priest: '聖伯多祿．加尼修司鐸（聖師）',
  peter_damian_bishop: '聖伯多祿．達彌盎主教（聖師）',
  pius_v_pope: '教宗聖比約五世',
  polycarp_of_smyrna_bishop: '聖玻里加主教（殉道）',
  sylvester_i_pope: '教宗聖西物斯德一世',
  thomas_becket_bishop: '聖多瑪斯．百克主教（殉道）',
  turibius_of_mogrovejo_bishop: '聖多利玻主教',
  francis_of_paola_hermit: '聖方濟各保拉隱修士',
  isidore_of_seville_bishop: '聖依西多祿主教（聖師）',
  stanislaus_of_szczepanow_bishop: '聖達尼老主教（殉道）',
  vincent_ferrer_priest: '聖味增爵斐洛司鐸',
  monday_after_epiphany: '主顯節後星期一',
  tuesday_after_epiphany: '主顯節後星期二',
  advent_december_21: '將臨期：十二月二十一日',
  // the days before the Epiphany (on 6 January in the general calendar): Hong Kong's
  // "聖誕期平日" with the date, as its Advent days "將臨期：十二月十七日"
  christmas_time_january_2: '聖誕期平日：一月二日',
  christmas_time_january_3: '聖誕期平日：一月三日',
  christmas_time_january_4: '聖誕期平日：一月四日',
  christmas_time_january_5: '聖誕期平日：一月五日',
  thursday_of_the_lords_supper: '逾越節三日慶典聖周四黃昏：主的晚餐',
};
// days Hong Kong names after its own Epiphany (on the Sunday): the app's follow 6 January
const SKIP = /^christmas_time_january_\d+$/;
// the seasons' weekdays and Sundays follow Hong Kong's pattern ("常年期第三十二周星期五",
// "將臨期第一主日"): the app makes them (celebrationZh in site/app.js), its pages having slips
const PATTERN = /^(advent|lent|easter_time|ordinary_time)_\d+_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/;
const cals = {};
const calendar = (y) => (cals[y] ??= existsSync(`site/data/calendar/${y}.json`) ? JSON.parse(readFileSync(`site/data/calendar/${y}.json`, 'utf8')) : {});

const RANKS = /^(紀念|慶日|節日|自由紀念)$/;
/** One celebration's name: what precedes the rank, with its qualifiers ("（殉道）"), without the psalter, the common or the weekday it falls on. */
function clean(part) {
  let s = part.replace(/^香港教區：/, '');
  const keep = [];
  for (const m of s.matchAll(/（([^）]*)）/g)) {
    const q = m[1];
    if (RANKS.test(q) || /聖詠集|通用|周星期|主日$|^為|主保|香港|八日慶|期第|^使徒$/.test(q)) continue;
    keep.push(m[0]);
  }
  const name = s.replace(/（[^）]*）/g, '').replace(/（[^）]*$/, '').replace(/\s+/g, '').trim();
  return name ? name + keep.join('') : '';
}
const ROLES = [['主教', /bishop/], ['司鐸', /priest/], ['貞女', /virgin/], ['殉道', /martyr/], ['院長', /abbot|abbess/], ['會士', /religious/], ['教宗', /pope/], ['執事', /deacon/], ['聖師', /doctor/], ['隱修', /monk|hermit/], ['國王', /king|emperor/]];
const score = (zh, id) => ROLES.reduce((a, [w, re]) => a + (zh.includes(w) === re.test(id) ? 1 : -1), 0);
/** Pairs [i of zh, j of romcal] with the best agreement of their titles (in order when they tie). */
function pairUp(zh, cels) {
  const n = Math.min(zh.length, cels.length);
  if (!n) return [];
  if (zh.length === 1 && cels.length === 1) return [[0, 0]];
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, k) => perms([...a.slice(0, k), ...a.slice(k + 1)]).map((p) => [x, ...p])));
  let best = null, bestScore = -Infinity;
  for (const p of perms([...cels.keys()])) {
    const sc = zh.slice(0, n).reduce((a, z, i) => a + score(z, cels[p[i]].id), 0);
    if (sc > bestScore) { bestScore = sc; best = p; }
  }
  return zh.slice(0, n).map((_, i) => [i, best[i]]);
}
const temporalZh = (s) => /期|主日|星期|聖周|八日慶期|聖灰|^十二月/.test(s) && !/節$/.test(s);
// a weekday or Sunday of a season, as Hong Kong names it ("常年期第三十一主日", "…周星期五")
const plainDayZh = (s) => /周星期|期第.{1,3}主日/.test(s);
const temporalLa = (c) => c.rank === 'WEEKDAY' || c.rank === 'SUNDAY';

// Hong Kong's spellings vary a little from year to year (．・‧ between names, a rare slip):
// the name it gives most often, else the later; the separator always "．"
const seen = {};
let pages = 0, order = 0;
const set = (id, name) => {
  if (!id || !name || SKIP.test(id) || PATTERN.test(id)) return;
  name = name.replace(/^[。，、\s]+/, '');
  name = name.replace(/[・‧･·]/g, '．');
  const c = (seen[id] ??= new Map());
  c.set(name, (c.get(name) || 0) + 1);
  // a later sighting counts a little more, to break ties
  c.set(name, c.get(name) + order / 1e6);
};
for (const date of readdirSync(dir).sort()) {
  const f = join(dir, date, 'LH1.htm');
  if (!existsSync(f)) continue;
  const lines = dlcLines(readFileSync(f));
  const at = lines.findIndex((l) => /晨禱/.test(l));
  if (at < 0) continue;
  pages++; order++;
  const title = lines.slice(2, at + 1).join(' ').replace(/^.{1,4}月.{1,4}日\s*/, '').replace(/\s*晨禱.*$/, '');
  const parts = title.split(/\s*或\s*/).map((p) => p.trim()).filter((p) => p && !/^星期六特敬聖母/.test(p.replace(/（.*$/, '')));
  const day = calendar(date.slice(0, 4))[date] || [];
  if (!day.length || !parts.length) continue;
  const [first, ...optional] = parts;
  const main = day[0];
  for (const [id, n] of Object.entries(MOVED)) if (clean(first) === n) set(id, n);
  // the day's celebration: the same kind of day in both calendars (a season's day for a
  // season's day; a feast, or the Easter octave, for a celebration that is not a plain weekday)
  const name = clean(first);
  const same = temporalLa(main) ? temporalZh(name) : !plainDayZh(name);
  if (!MOVED[main.id] && same) set(main.id, name);
  // the optional memorials, paired by the words of their titles (Hong Kong's order is not
  // always romcal's): 主教 bishop, 司鐸 priest, 貞女 virgin, 殉道 martyr...
  const rest = day.slice(1).filter((c) => c.rank === 'OPTIONAL_MEMORIAL');
  const opts = optional.filter((p) => !/^香港教區/.test(p)).map(clean);
  for (const [i, j] of pairUp(opts, rest)) set(rest[j].id, opts[i]);
}
const differing = [];
for (const [id, c] of Object.entries(seen)) {
  const best = [...c].sort((a, b) => b[1] - a[1])[0][0];
  if (c.size > 1) differing.push(`${id}: ${[...c.keys()].join(' / ')} -> ${best}`);
  out[id] = best;
}
for (const [id, n] of Object.entries(ORDO)) if (!out[id] || /^christmas_time_january/.test(id)) out[id] = n;
Object.assign(out, FIX);
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync('data/calendar-zh.json', JSON.stringify(sorted, null, 1) + '\n');
console.log(`${pages} pages, ${Object.keys(sorted).length} celebrations named`);
if (differing.length) console.log(`names differing between years:\n  ${differing.join('\n  ')}`);
