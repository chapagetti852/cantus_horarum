// Propers resolved from the OCO index slot codes, on dates whose chants are known.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolveHour, indexOco, celebrationFor } from '../site/resolve.js';

const built = existsSync('dist/data/slots.json');
const load = (f) => JSON.parse(readFileSync(`dist/data/${f}`, 'utf8'));
const next = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

function propers(date, hour) {
  const slots = load('slots.json'), oco = indexOco(load('oco.json'));
  const cal = { ...load('calendar/2026.json'), ...load('calendar/2027.json') };
  const { cel, hour: h, first } = celebrationFor(cal[date][0], cal[next(date)][0], hour);
  return { cel, out: resolveHour(slots, oco, cel, first ? next(date) : date, h).out };
}
const incipit = (e) => (e?.title || '').split(/[,.:]/)[0];

test('resolved propers', { skip: !built && 'run the build first' }, () => {
  assert.deepEqual(propers('2026-10-19', 'laudes').out, {}, 'Ordinary Time weekday: the psalter');
  assert.equal(incipit(propers('2026-11-01', 'laudes').out.B), 'Te gloriosus apostolorum chorus');
  assert.equal(incipit(propers('2026-11-29', 'laudes').out['1']), 'In illa die stillabunt montes dulcedinem');
  assert.match(propers('2026-12-18', 'vesperae').out.M.title, /^O Adonai/);
  const kingEve = propers('2026-11-21', 'vesperae');
  assert.equal(kingEve.cel.id, 'our_lord_jesus_christ_king_of_the_universe', 'I Vespers of the solemnity');
  assert.match(kingEve.out.M.title, /^Dabit illi/);
  assert.match(propers('2026-11-30', 'vesperae').out.H.title, /^Exsultet cælum/, 'common of apostles from the title');
  assert.match(propers('2026-11-21', 'laudes').out.B.title, /^Beata es/, 'memorial: proper Benedictus antiphon');
  assert.equal(propers('2026-11-21', 'laudes').out['1'], undefined, 'memorial: psalter antiphons');
  assert.match(propers('2026-12-25', 'tertia').out['1'].title, /^Natus est nobis/);
  // the Sundays of Advent and Lent whose antiphons the index gives by the year alone
  assert.match(propers('2026-12-13', 'laudes').out.B.title, /^Miserunt Iudæi/, 'Advent III, year B');
  assert.match(propers('2026-12-13', 'vesperae').out.M.title, /^Ego vox clamantis/);
  assert.match(propers('2026-12-20', 'laudes').out.B.title, /^Quomodo fiet istud/, 'Advent IV on 20 December: the Sunday\'s Benedictus antiphon');
  assert.match(propers('2026-12-20', 'vesperae').out.M.title, /^O Clavis David/, 'and the O antiphon of the date');
  assert.match(propers('2026-12-19', 'vesperae').out.M.title, /^O Radix Iesse/, 'First Vespers: the O antiphon of the evening');
  assert.match(propers('2027-03-07', 'tertia').out['1'].title, /^Sic Deus dilexit/, 'Lent IV, year B, at Terce');
  assert.match(propers('2026-12-24', 'vesperae').out.M.title, /^Dum ortus fuerit/, 'First Vespers of Christmas: the feast\'s own');
  // the Triduum: Good Friday and Holy Saturday are the OCO's 6Q6 and 6Q7, not Easter week
  assert.match(propers('2027-03-26', 'vesperae').out['1'].title, /^Attendite, universi populi/, 'Good Friday Vespers');
  assert.match(propers('2027-03-27', 'laudes').out['1'].title, /^Plangent eum/, 'Holy Saturday Lauds');
  assert.match(propers('2027-03-27', 'vesperae').out.M.title, /^Nunc clarificatus est/);
  // the octave day of Easter: First Vespers on the Saturday, the octave's antiphons
  const octave = propers('2027-04-03', 'vesperae');
  assert.equal(octave.cel.id, 'divine_mercy_sunday');
  assert.match(octave.out.M.title, /^Post dies octo/);
  assert.match(octave.out['1'].title, /^Venerunt ad monumentum/);
  // the little hours' one antiphon for a whole season
  assert.match(propers('2026-12-02', 'tertia').out['1'].title, /^Prophetæ prædicaverunt/, 'Advent, Terce');
  assert.match(propers('2026-12-06', 'nona').out['1'].title, /^Ecce ancilla Domini/, 'Advent Sunday, None');
  assert.match(propers('2027-03-10', 'tertia').out['1'].title, /^Advenerunt nobis/, 'Lent, Terce');
  assert.match(propers('2026-12-29', 'tertia').out['1'].title, /^Erat Ioseph et Maria/, 'Christmas before Epiphany');
  assert.equal(propers('2026-12-02', 'laudes').out['1'], undefined, 'not the psalms of Lauds: the psalter\'s there');
  // Eastertide weekdays: "Psalmi cum Alleluia", not a piece that begins with the word
  const paschal = propers('2027-04-14', 'laudes').out;
  assert.equal(paschal['1'].alleluia, true);
  assert.equal(paschal['3'].alleluia, true);
  assert.match(paschal['2'].title, /^De sub pede Agni/, 'the canticle keeps its own antiphon');
  assert.equal(propers('2027-04-14', 'tertia').out['1'].alleluia, true);
  assert.equal(propers('2027-04-14', 'completorium').out['1'].alleluia, true);
  assert.equal(propers('2027-04-18', 'laudes').out['1'].alleluia, undefined, 'Sundays have their own');
  // an index row that abbreviates its incipit ("Amen a. d. vobis Non Moyses")
  assert.match(propers('2027-08-01', 'laudes').out.B.title, /^Amen,? amen dico vobis: Non Moyses/);
});
