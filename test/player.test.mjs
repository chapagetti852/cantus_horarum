// The player reads GABC into pitches and lengths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { notesOf } from '../site/player.js';

const midi = (body) => notesOf(body).filter((n) => !n.rest).map((n) => n.midi);

test('pitches from staff positions, clefs and flats', () => {
  // c4: j is middle C; f is the F below, h the A
  assert.deepEqual(midi('(c4) Do(j)mi(f)ne(h)'), [60, 53, 57]);
  // a flat on i lasts until the next bar
  assert.deepEqual(midi('(c4) me(ixi)a(i) (;) tu(i)a(i)'), [58, 58, 59, 59]);
  // f3: h is F3
  assert.deepEqual(midi('(f3) Ve(h)ni(j)'), [53, 57]);
  // a clef change mid-piece
  assert.deepEqual(midi('(c4) a(h) (c3) b(h)'), [57, 60]);
});

test('lengths: mora, bars, bivirga, the final note', () => {
  const n = notesOf('(c4) a(h.) b(hvv) (;) c(h)');
  assert.equal(n[0].dur, 2);
  assert.equal(n.filter((x) => !x.rest).length, 4, 'the bivirga is two notes');
  assert.ok(n.some((x) => x.rest), 'the bar breathes');
  assert.ok(n[n.length - 1].dur >= 2, 'the last note is long');
});
