// Hymns sung in full on the melody of their first strophe (site/hymns.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import './jgabc.mjs';
import { tuneOf, fitStrophe, fullHymn, joinStrophes, incipitKey, strophesOf } from '../site/hymns.js';

// Certum tenentes (Liber Hymnarius): its first strophe only, as GregoBase gives it
const certum = `(f3) Cer(f)tum(e) te(f)nén(h)tes(g) ór(f)di(f)nem,(e'_) (,)
pi(f)o(e) pos(f)cá(h)mus(g) péc(f)to(e)re(e.h.) (;)
ho(h)ra(j) di(i)é(j)i(h) tér(i)ti(hg)a(f'_) (,)
tri(e)næ(f) vir(h)tú(hi)tis(hg) gló(f)ri(ef)am,(f.) (::)`;

test('the first strophe\'s melody: a note group a syllable, its lines', () => {
  const t = tuneOf(certum);
  assert.equal(t.clef, 'f3');
  assert.deepEqual(t.lines, [8, 8, 8, 8]);
  assert.equal(t.final, 'f');
});

test('the other strophes set to it, elisions on one note, the Amen on its formula', () => {
  const t = tuneOf(certum);
  const g = fitStrophe(t, ['Hoc gradiénte órdine,', 'ornávit cuncta spléndide', 'regni cæléstis cónditor', 'ad nostra ætérna prǽmia.'], 3);
  assert.match(g, /^3\. Hoc\(f\)/);
  assert.match(g, /nos\(f\)tr<e>a<\/e>~æ\(h\)tér\(hi\)/, 'nostra ætérna: one syllable, the a elided');
  assert.match(g, /\(::\)$/);
  const last = fitStrophe(t, ['Deo Patri sit glória', 'eiúsque soli Fílio', 'cum Spíritu Paráclito,', 'in sempitérna sǽcula. Amen.'], 4);
  assert.match(last, /A\(fgf\)men\.\(ef\.\.\) \(::\)$/);
  assert.equal(fitStrophe(t, ['Too short a line', 'and another'], 2), null, 'what does not scan stays text');
});

test('the whole hymn, iBreviary\'s split Amen line put back', () => {
  const strophes = joinStrophes([
    ['Certum tenéntes órdinem,', 'pio poscámus péctore', 'hora diéi tértia', 'trinæ virtútis glóriam,'],
    ['Deo Patri sit glória', 'eiúsque soli Fílio', 'cum Spíritu Paráclito,'],
    ['in sempitérna sǽcula. Amen.'],
  ]);
  assert.equal(strophes.length, 2);
  const r = fullHymn(certum, strophes);
  assert.equal(r.rest.length, 0);
  assert.equal((r.gabc.match(/\(::\)/g) || []).length, 2);
  assert.equal(strophesOf(r.gabc).length, 2);
});

test('a score and a text are the same hymn by their first words', () => {
  assert.equal(incipitKey('LÆ(eed)ti(c) co(eg)lén(ggf)tes(dc)'), 'laeti colentes');
  assert.equal(incipitKey('Læti coléntes fámulum (LHym 326)'), 'laeti colentes');
  assert.notEqual(incipitKey('Fortem viríli péctore'), incipitKey('Læti coléntes'));
});
