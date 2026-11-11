// Resolve a date and hour to the OCO chants proper to it, by the slot codes of the
// OCO indices (docs/oco-sigla.md): tempus (season, day, feast, common), officium
// (hour) and locus (place in the hour). The psalter supplies whatever is not proper.
//
// slots: rows [kind, tempus, officium, locus, ocoIds, lhym, incipit] built from
// data/oco/indices.json by scripts/build.mjs (kind a = antiphon, h = hymn,
// r = short responsory; antiphons without an officium are invitatories).

const MONTH_DAYS = (d) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

// romcal ids of celebrations the OCO names by a code
const NAMED = {
  immaculate_conception_of_the_blessed_virgin_mary: 'Immac', most_holy_trinity: 'Trn',
  most_holy_body_and_blood_of_christ: 'Corp', most_sacred_heart_of_jesus: 'Cord',
  our_lord_jesus_christ_king_of_the_universe: 'Reg', ascension_of_the_lord: 'Asc', pentecost_sunday: 'Pent',
  epiphany_of_the_lord: 'Ep', baptism_of_the_lord: 'Bapt', holy_family_of_jesus_mary_and_joseph: 'Fam',
  joseph_spouse_of_mary: 'Jos', annunciation_of_the_lord: 'Ann', nativity_of_john_the_baptist: 'JBapt',
  peter_and_paul_apostles: 'Petr', transfiguration_of_the_lord: 'Transf', assumption_of_the_blessed_virgin_mary: 'Ass',
  nativity_of_the_blessed_virgin_mary: 'NatND', exaltation_of_the_holy_cross: 'Crux',
  michael_gabriel_and_raphael_archangels: 'Mich', all_saints: 'Oss', presentation_of_the_lord: 'Pres',
  dedication_of_the_lateran_basilica: 'Ded', commemoration_of_all_the_faithful_departed: 'Def',
  // the Diocese of Hong Kong's cathedral: the dedication of a church, as the Lateran
  dedication_of_the_cathedral_of_the_immaculate_conception_hong_kong: 'Ded',
  second_sunday_after_christmas: '2N1', nativity_of_the_lord: 'Nat',
};
// romcal commons -> OCO common codes
const COMMONS = {
  BlessedVirginMary: ['BMV'], Apostles: ['Ap'], Martyrs: ['Mart'], MissionaryMartyrs: ['Mart', 'Mis'],
  VirginMartyrs: ['Virg', 'Mart'], Pastors: ['Past'], Bishops: ['Past'], PopeOrBishop: ['Past'], Missionaries: ['Past', 'Mis'],
  DoctorsOfTheChurch: ['Doct', 'Past'], Virgins: ['Virg'], Saints: ['Vir'], HolyWomen: ['Mul'], Religious: ['Rel', 'Vir'],
  Nuns: ['Rel', 'Virg'], Abbots: ['Rel', 'Vir'], Monks: ['Rel', 'Vir'], MercyWorkers: ['Mis', 'Vir'], Educators: ['Educ', 'Vir'],
};
const TEMPORAL_NAMED = new Set(['Trn', 'Corp', 'Cord', 'Reg', 'Asc', 'Pent', 'Ep', 'Bapt', 'Fam', '2N1', 'Nat']);
export const isSanctoral = (cel) => !/^(advent|christmas|lent|easter|ordinary_time|holy_week|palm_sunday|divine_mercy|sunday_of_the_word|mary_mother_of_god)/.test(cel.id || '')
  && !TEMPORAL_NAMED.has(NAMED[cel.id]) && cel.rank !== 'WEEKDAY' && cel.rank !== 'SUNDAY';
// romcal titles -> OCO common codes, for celebrations the calendar gives no common
const TITLES = {
  APOSTLE: ['Ap'], EVANGELIST: ['Ap'], MARTYR: ['Mart'], THE_FIRST_MARTYR: ['Mart'], VIRGIN: ['Virg'], POPE: ['Past'],
  BISHOP: ['Past'], PRIEST: ['Past'], DOCTOR_OF_THE_CHURCH: ['Doct', 'Past'], ABBOT: ['Rel', 'Vir'], ABBESS: ['Rel', 'Virg'],
  MONK: ['Rel', 'Vir'], RELIGIOUS: ['Rel', 'Vir'], DEACON: ['Vir'], KING: ['Vir'], QUEEN: ['Mul'], EMPEROR: ['Vir'],
};
const precNumber = (c) => Number(/(\d+)$/.exec(c?.prec || '')?.[1] ?? 99);

/**
 * Everything about a celebration that the slot codes can test. mode 'temporal' reads
 * the codes of the season and its days and of feasts of the Lord; 'sanctoral' those of
 * the saint's date and common.
 */
export function context(cel, date, mode = isSanctoral(cel) ? 'sanctoral' : 'temporal') {
  const s = cel.seasons || [];
  // Good Friday and Holy Saturday (the Triduum before Easter Sunday) are, in the OCO's codes,
  // the Friday and the Saturday of the sixth week of Lent ("6Q6", "6Q7"); the calendar counts
  // them the first week of the Triduum, which read as the Friday and Saturday of Easter week
  const triduum = s.includes('PASCHAL_TRIDUUM') && !s.includes('EASTER_TIME');
  const season = s.includes('ADVENT') ? 'A' : s.includes('CHRISTMAS_TIME') ? 'N' : s.includes('LENT') || s.includes('HOLY_WEEK') || triduum ? 'Q'
    : s.includes('EASTER_TIME') ? 'P' : 'D';
  const dm = MONTH_DAYS(date);
  const [d, m] = dm.split('/').map(Number);
  const sanctoral = mode === 'sanctoral';
  const commons = new Set((cel.commons || []).flatMap((c) => COMMONS[c] || []));
  for (const t of cel.titles || []) for (const x of TITLES[t] || []) commons.add(x);
  if (/blessed_virgin_mary|^our_lady|^mary_|immaculate_heart/.test(cel.id || '')) commons.add('BMV');
  if (commons.has('Mart')) commons.add(/_and_|companions/.test(cel.id) ? 'PlM' : 'UnM');
  const plural = /_and_|companions/.test(cel.id || '');
  return {
    id: cel.id, rank: cel.rank, prec: precNumber(cel), season, week: triduum ? 6 : cel.week, dow: cel.dow, dm, sanctoral,
    // the day before: First Vespers are sung on its evening
    eveDm: MONTH_DAYS(new Date(Date.parse(`${date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)),
    named: sanctoral || TEMPORAL_NAMED.has(NAMED[cel.id]) ? NAMED[cel.id] : undefined,
    commons: sanctoral ? commons : new Set(), plural, year: (cel.sunday || 'A').toLowerCase(),
    // the pastor's order, for the hymns of the common of pastors that come in three forms
    order: (cel.titles || []).includes('POPE') ? 'papa' : (cel.titles || []).includes('BISHOP') || (cel.commons || []).includes('Bishops') ? 'episcopus' : 'presbyter',
    before17: season === 'A' && !(m === 12 && d >= 17),
    afterEp: season === 'N' && m === 1 && d >= 6,
    // Easter: before or after the Ascension (romcal weeks 1-7; Ascension is Thursday of week 6)
    beforeAsc: season === 'P' && (cel.week < 6 || (cel.week === 6 && cel.dow < 4)),
  };
}

// ---------------------------------------------------------------- slot codes
const SEASON_NAMES = { A: 'A', Adv: 'A', N: 'N', Q: 'Q', P: 'P', TP: 'P' };
const COMMON_RANK = { Mart: 3, PlM: 3, UnM: 3, Virg: 2, Doct: 1 };
const COMMON_CODES = /^(Ap|BMV|PlM|UnM|Mart|Past|Doct|Virg|Vir|Viro|Mul|Rel|Mis|Educ|Ded|Def)(Pl)?$/;

const inList = (n, spec) => spec.split('.').some((part) => {
  const [a, b] = part.split('-').map(Number);
  return b === undefined ? n === a : n >= a && n <= b;
});

/**
 * Score how well one index tempus string fits a context: 0 when it does not apply,
 * higher for more particular codes (the day itself > a named feast > the day of the
 * season > a common > the season).
 */
export function scoreTempus(tempus, c) {
  const norm = String(tempus || '')
    .replace(/\b(ante|post) (17\/12|Asc|Ep)/gi, '$1$2').replace(/\busque Asc/g, 'usqueAsc')
    .replace(/\bUna ?mart\b/g, 'UnaMart').replace(/\bsoll\. fest\./g, 'sollfest').trim();
  if (!norm) return 0;
  const tokens = norm.split(/\s+/);
  // a date with a season ("Adv 24/12") names that day of the season: the season only qualifies it
  const dated = tokens.some((t) => /^\d+\/\d+$/.test(t));
  const T = !c.sanctoral, S = c.sanctoral;
  let best = 0, qualifiersOk = true, bonus = 0;
  for (let t of tokens) {
    let m, s = 0;
    if ((m = /^(\d+)\/(\d+)(V)?$/.exec(t))) s = `${m[1]}/${m[2]}` === c.dm ? (S || tokens.some((x) => x in SEASON_NAMES) ? 100 : 0) : 0;
    else if (dated && t in SEASON_NAMES) qualifiersOk &&= SEASON_NAMES[t] === c.season;
    // a date within a season ("A-19/12": the O antiphons): at First Vespers the evening's own date
    else if ((m = /^([ANQ]|Ep)-(\d+\/\d+)$/.exec(t))) s = m[2] === (c.evening || c.dm) ? 95 : 0;
    else if ((m = /^(\d)([AQP])(\d)(?:-(\d))?$/.exec(t))) {
      // week, season, day (1 = Sunday); Advent "week 5" = the ferias after 16 December
      const week = c.season === 'A' && !c.before17 && c.dow ? 5 : c.week;
      const wk = c.season === 'Q' && c.week === 0 ? 0 : week;
      s = T && m[2] === c.season && Number(m[1]) === wk && inList(c.dow + 1, m[4] ? `${m[3]}-${m[4]}` : m[3]) ? 90 : 0;
    } else if ((m = /^(\d)-(\d)([PQ])(\d)?(?:-(\d))?$/.exec(t))) {
      s = T && m[3] === c.season && c.week >= Number(m[1]) && c.week <= Number(m[2]) && (!m[4] || inList(c.dow + 1, m[5] ? `${m[4]}-${m[5]}` : m[4])) ? 80 : 0;
    } else if ((m = /^(\d)([PQ])$/.exec(t))) {
      s = T && m[2] === c.season && Number(m[1]) === c.week ? 70 : 0;
      // the Sunday that closes the octave of Easter keeps the octave's antiphons ("1P")
      if (!s && T && c.id === 'divine_mercy_sunday' && t === '1P') s = 70;
    }
    else if ((m = /^0?(\d+)D$/.exec(t))) s = T && c.season === 'D' && c.dow === 0 && Number(m[1]) === c.week ? 90 : 0;
    else if ((m = /^D(\d+(?:\.\d+)*)$/.exec(t))) s = T && c.season === 'D' && c.dow === 0 && inList(c.week, m[1]) ? 85 : 0;
    else if (t === 'D') s = T && c.season === 'D' && c.dow === 0 ? 30 : 0;
    else if (t === 'fer' || t === 'TpA') s = T && c.season === 'D' ? 10 : 0;
    else if ((m = /^\d*([A-Z][A-Za-z]+)$/.exec(t)) && c.named && m[1] === c.named) s = 98;
    else if ((m = /^\d*([A-Z][A-Za-z]+(?:-[A-Z][a-z]+)?)$/.exec(t)) && COMMON_CODES.test(m[1].split('-')[0])) {
      const names = m[1].replace(/Pl$/, '').split('-').map((x) => (x === 'Viro' ? 'Vir' : x));
      // a martyr bishop is first a martyr: the more particular common wins
      const hit = names.filter((n) => c.commons.has(n));
      s = S && hit.length ? 40 + Math.max(...hit.map((n) => COMMON_RANK[n] || 0)) : 0;
      if (s && /Pl$/.test(m[1])) bonus += c.plural ? 5 : -100;
    } else if (t === 'TP' && tokens.length > 1) {
      // with another selector (Ap TP) it qualifies it: Easter only, preferred then
      if (c.season === 'P') bonus += 5; else qualifiersOk = false;
    } else if (t in SEASON_NAMES) s = T && SEASON_NAMES[t] === c.season ? 20 : 0;
    else if (t === 'ante17/12') qualifiersOk &&= c.before17;
    else if (t === 'post17/12') qualifiersOk &&= c.season === 'A' && !c.before17;
    else if (/^(ante|Ante)Asc$/.test(t) || t === 'usqueAsc') qualifiersOk &&= c.beforeAsc;
    else if (t === 'postAsc') qualifiersOk &&= c.season === 'P' && !c.beforeAsc;
    else if (t === 'anteEp') qualifiersOk &&= c.season === 'N' && !c.afterEp;
    else if (t === 'postEp') qualifiersOk &&= c.season === 'N' && c.afterEp;
    else if ((m = /^H(\d)(?:-(\d))?$/.exec(t))) qualifiersOk &&= inList(c.dow + 1, m[2] ? `${m[1]}-${m[2]}` : m[1]);
    else if (t === 'mem.') qualifiersOk &&= c.rank === 'MEMORIAL';
    else if (t === 'fest.') qualifiersOk &&= c.rank === 'FEAST';
    else if (t === 'soll.') qualifiersOk &&= c.rank === 'SOLEMNITY';
    else if (t === 'sollfest') qualifiersOk &&= c.rank === 'SOLEMNITY' || c.rank === 'FEAST';
    else if (t === 'Pl') bonus += c.plural ? 5 : -100;
    else if (t === 'UnaMart') qualifiersOk = false; // feminine forms: not distinguished yet
    else if (t === 'Sab') qualifiersOk = false; // Saturday memorial of Our Lady: not offered yet
    best = Math.max(best, s);
  }
  return qualifiersOk && best > 0 ? Math.max(0, best + bonus) : 0;
}

// ---------------------------------------------------------------- hours and places
const OFFICIUM = {
  lectio: ['Ol'], laudes: ['L', 'L-V', 'L V'], tertia: ['T', 'Hm'], sexta: ['S', 'Hm'], nona: ['N', 'Hm'],
  vesperae: ['2V', 'V', 'L-V', '1-2V', 'L V', 'Ol V', 'Ol 2V'], vesperae1: ['1V', '1-2V', 'V'], completorium: ['C'],
};
const HYMN_OFFICIUM = { ...OFFICIUM, laudes: ['L', 'L V'], vesperae: ['V', '2V', 'L V', 'Ol V', 'Ol 2V'], vesperae1: ['1V', 'V'] };

function locusMatches(locus, place, c, hour) {
  const l = String(locus || '').trim();
  // the year alone ("a", "b", "bc"): the antiphon of that year of the Sunday cycle at the
  // hour's one proper place: the Gospel canticle at Lauds and Vespers (the third and fourth
  // Sundays of Advent), the single antiphon of a little hour (the Sundays of Lent)
  if (/^[abc]+$/.test(l)) {
    const little = hour === 'tertia' || hour === 'sexta' || hour === 'nona';
    return l.includes(c.year) && (little ? place === '1' : place === 'B' || place === 'M') ? 3 : 0;
  }
  if (place === 'B' || place === 'M') {
    const yr = new RegExp(`^${place}${c.year}?$|^${place}[abc]*${c.year}[abc]*$`);
    if (yr.test(l)) return /[abc]/.test(l.slice(1)) ? 3 : 2;
    if (l === `${place} ad lib` || l === `${place}TP` && c.season === 'P' || l === `${place}TpA` && c.season === 'D') return 1;
    if (l === `${place}TQ` && c.season === 'Q') return 1;
    if (l === `${place} ante Asc` && c.beforeAsc || l === `${place} post Asc` && c.season === 'P' && !c.beforeAsc) return 2;
    return 0;
  }
  if (/^[123]$/.test(place)) {
    if (l === place) return 2;
    if (l === `${place}TpA` && c.season === 'D' || l === `${place}exTpA` && c.season !== 'D') return 2;
    if (place === '1' && l === '') return 1; // the single antiphon of a little hour
    return 0;
  }
  return l === place ? 1 : 0;
}

/**
 * Pick the best OCO entry for one place of one hour.
 * kind: 'a' (antiphon at `place`), 'h' (hymn), 'r' (short responsory), 'i' (invitatory).
 */
function pick(slots, oco, c, hour, kind, place) {
  const offs = (kind === 'h' ? HYMN_OFFICIUM : OFFICIUM)[hour] || [];
  // First Vespers: a row for the Vespers of a date ("A-19/12 V") is the evening's own date;
  // one written for First Vespers ("N-25/12 1V") stands under the feast's
  const eve = hour === 'vesperae1' ? { ...c, evening: c.eveDm } : c;
  let best = null;
  for (const row of slots) {
    const [k, tempus, officium, locus, ids, lhym] = row;
    if (k !== (kind === 'i' ? 'a' : kind)) continue;
    if (place === 'Nunc' && !/^Nunc/.test(locus)) continue;
    if (kind === 'i' ? officium !== '' : !offs.includes(officium)) continue;
    const lm = kind === 'a' ? locusMatches(locus, place, c, hour) : 1;
    if (!lm) continue;
    const s = scoreTempus(tempus, officium === 'V' ? eve : c);
    if (!s) continue;
    const entry = entryFor(oco, ids, lhym, kind, row, c);
    if (!entry) continue;
    // at equal particularity, a piece with a score before one without
    // a Sunday of Advent on 17-23 December: the Benedictus antiphon is the Sunday's own, by
    // the year (the date's gives way); at Vespers the O antiphon of the date stands
    const sundays = place === 'B' && /^[abc]+$/.test(String(locus || '').trim()) ? 1000 : 0;
    const score = s * 10 + lm - offs.indexOf(officium) + (entry.gabc ? 5 : 0) + sundays;
    if (best && best.score >= score) continue;
    best = { score, tempusScore: s, entry, tempus };
  }
  return best;
}

function entryFor(oco, ids, lhym, kind, row, c) {
  if (kind === 'h') {
    // a page of the Liber Hymnarius may hold several hymns, and the OCO body sometimes
    // cites another page: the incipit decides
    const inc = String(row[6] || '').replace(/\s*\(.*$|\s+\d$|….*$/g, '').toLowerCase();
    const byInc = (e) => inc && e.title.toLowerCase().startsWith(inc);
    const onPage = oco.byLhym.get(String(lhym)) || [];
    let list = onPage.filter(byInc);
    if (!list.length) list = oco.hymns.filter(byInc);
    if (!list.length) list = onPage;
    // a hymn the OCO names only in its index: the score matched to it (scripts/oco/match_index_hymns.py),
    // the pastors' in the form for a pope, a bishop or a priest
    const own = row[7] && (typeof row[7] === 'object' ? row[7][c?.order || 'presbyter'] : row[7]);
    return list.find((e) => e.gabc) || (own ? { kind: 'hymn', title: row[6], lhym, gabc: own } : null) || list[0] || (row[6] ? { kind: 'hymn', title: row[6], lhym } : null);
  }
  // "Psalmi cum Alleluia (in tonis diversis)", Eastertide: the index's bare "Alleluia" is the
  // antiphon Alleluia in the psalm's own tone (ALLELUIA in site/app.js), not one of the pieces
  // that begin with the word
  if (kind === 'a' && row[6] === 'Alleluia') return { kind: 'chant', alleluia: true, title: 'Alleluia, alleluia, alleluia.', text: 'Allelúia, allelúia, allelúia.', part: 'PROPRIUM DE TEMPORE' };
  const list = (ids || []).map((i) => oco.byId.get(i)).filter(Boolean);
  // the index's links reach every piece with that incipit: keep the right genre
  const isResp = (e) => e.kind === 'resp_brevis' || /br\./.test(e.position || '');
  const want = kind === 'i' ? (e) => e.kind === 'invitatorium'
    : kind === 'r' ? isResp
      : (e) => e.kind !== 'reference' && e.kind !== 'hymn' && e.kind !== 'invitatorium' && !isResp(e);
  // the alleluia form in Eastertide only
  const tp = c?.season === 'P';
  const fits = (e) => want(e) && /allel/i.test(e.title || '') === tp;
  // a piece the OCO prints under several saints with each one's name ("O doctor optime …
  // beate Leo"): the day's own, else the common's ("beate N."), else another saint's, which
  // is marked so that its name is not sung (site/names.js)
  const [d, mo] = String(c?.dm || '').split('/').map(Number);
  const dated = (e) => /^Die \d+\b/.test(e.day || '');
  const today = (e) => dated(e) && e.chapter === MONTHS[mo - 1] && new RegExp(`^Die ${d}\\b`).test(e.day);
  const ordered = [...list.filter(today), ...list.filter((e) => !dated(e)), ...list.filter((e) => dated(e) && !today(e))];
  const found = ordered.find((e) => fits(e) && e.gabc) || ordered.find(fits) || ordered.find((e) => want(e) && e.gabc) || ordered.find(want) || null;
  return found && dated(found) && !today(found) && /\bNA?\./.test(found.title || '') ? { ...found, otherSaint: true } : found;
}
const MONTHS = ['IANUARIUS', 'FEBRUARIUS', 'MARTIUS', 'APRILIS', 'MAIUS', 'IUNIUS', 'IULIUS', 'AUGUSTUS', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

export function indexOco(entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const byLhym = new Map();
  for (const e of entries) if (e.kind === 'hymn' && e.lhym) (byLhym.get(e.lhym) || byLhym.set(e.lhym, []).get(e.lhym)).push(e);
  return { byId, byLhym, hymns: entries.filter((e) => e.kind === 'hymn') };
}

/**
 * Which celebration an hour belongs to: Vespers on the eve of a Sunday or solemnity
 * that outranks today are its I Vespers.
 */
export function celebrationFor(today, tomorrow, hour) {
  // (the Saturday of the Easter octave ranks as the Sunday that closes it: its Vespers are the Sunday's first)
  if (hour === 'vesperae' && tomorrow && (tomorrow.rank === 'SOLEMNITY' || tomorrow.rank === 'SUNDAY')
    && (precNumber(tomorrow) < precNumber(today) || today.id === 'easter_saturday')) {
    return { cel: tomorrow, hour: 'vesperae1', first: true };
  }
  return { cel: today, hour, first: false };
}

/**
 * The proper chants of an hour, by place: {H, 1, 2, 3, B, M, R, I, Nunc} → OCO entry.
 * First the season's day (Sundays and weekdays of the seasons take what the season
 * provides; Ordinary Time weekdays nothing, the psalter serves), then the celebration
 * laid over it: solemnities and feasts take every place from their proper or common,
 * memorials the hymn and the invitatory, their own psalm and Gospel canticle antiphons
 * if they have any, and with `memoriaCommune` the common's canticle antiphon and short
 * responsory too (from the short reading on, the weekday or the common may be said). Memorials in Lent and after 16 December
 * are only commemorated.
 */
export function resolveHour(slots, oco, cel, date, hour, { memoriaCommune = false } = {}) {
  const out = {};
  const T = context(cel, date, 'temporal');
  const bigTemporal = !isSanctoral(cel) && (cel.rank === 'SOLEMNITY' || cel.rank === 'FEAST');
  if (T.season !== 'D' || T.dow === 0 || bigTemporal) {
    // the little hours have one antiphon for a whole season ("A", "Q", "N ante Ep"); the psalms
    // of the other hours only what a week or a day provides
    const little = ['tertia', 'sexta', 'nona'].includes(hour);
    fill(out, slots, oco, T, hour, (kind) => (bigTemporal || (little && T.season !== 'D') ? 20 : kind === 'psalm' ? 70 : T.season === 'D' ? 30 : 20));
  }
  if (isSanctoral(cel)) {
    const S = context(cel, date, 'sanctoral');
    const big = cel.rank === 'SOLEMNITY' || cel.rank === 'FEAST';
    const memorial = cel.rank === 'MEMORIAL' && !(S.season === 'Q' || (S.season === 'A' && !S.before17));
    if (big) fill(out, slots, oco, S, hour, () => 20, true);
    // memorials: from the short reading on, the weekday (proper pieces only) or, by choice, the common
    else if (memorial) {
      fill(out, slots, oco, S, hour, (kind, place) => {
        if (kind === 'psalm') return 100;
        if (place === 'R' || place === 'B' || place === 'M') return memoriaCommune ? 40 : place === 'R' ? 999 : 100;
        return 40;
      }, true);
    }
  }
  return { out, c: T };
}

function fill(out, slots, oco, c, hour, min, override = false) {
  const take = (place, kind, p) => {
    const r = pick(slots, oco, c, hour, kind, p);
    const key = place === 'psalm' ? p : place;
    if (r && r.tempusScore >= min(place === 'psalm' ? 'psalm' : kind, key) && (override || !out[key])) out[key] = r.entry;
  };
  if (['tertia', 'sexta', 'nona'].includes(hour)) take('psalm', 'a', '1');
  else for (const p of ['1', '2', '3']) take('psalm', 'a', p);
  if (hour === 'laudes') take('B', 'a', 'B');
  if (hour === 'vesperae' || hour === 'vesperae1') take('M', 'a', 'M');
  if (hour === 'completorium') take('Nunc', 'a', 'Nunc');
  take('H', 'h');
  if (hour === 'laudes' || hour.startsWith('vesperae')) take('R', 'r');
  if (hour === 'laudes' || hour === 'lectio') take('I', 'i');
}
