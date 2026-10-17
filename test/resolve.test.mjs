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
});
