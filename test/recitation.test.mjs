// Collects, readings and versicles on the common tones reproduce the books' own examples
// (GregoBase 20918-20920: AM 2005 pp. 529, 532, 536; AR II pp. 756, 759).
import test from 'node:test';
import assert from 'node:assert/strict';
import engine from './jgabc.mjs';
import { setRecitationEngine, collectGabc, readingGabc, versicleGabc } from '../site/recitation.js';

setRecitationEngine(engine);
// syllable(notes) pairs, bars and markup left out
const notes = (g) => [...g.replace(/<[^>]+>/g, '').matchAll(/([^\s()]+)\(([a-m]+)\.?\)/g)].map((m) => `${m[1].replace(/[,;:.?]/g, '')}:${m[2]}`).join(' ');

test('collect: flexa, metrum, punctum (AR II p. 759)', () => {
  const g = collectGabc('Da, quǽsumus, omnípotens Deus, hanc tuis fidélibus voluntátem, ut, Christo tuo veniénti iustis opéribus occurréntes, eius déxteræ sociáti, regnum mereántur possidére cæléste.', { amen: false });
  const n = notes(g);
  assert.match(n, /vo:h lun:h tá:h tem:f ut:h/, 'flexa: la after the last accent');
  assert.match(n, /o:h pé:h ri:h bus:h oc:g cur:f rén:h tes:h/, 'metrum: si, la before the accent');
  assert.match(n, /cæ:h lés:h te:d$/, 'punctum: fa after the accent');
});

test('collect conclusion', () => {
  const n = notes(collectGabc('Deus, qui ... Per Dóminum nostrum Iesum Christum, Fílium tuum, qui tecum vivit et regnat in unitáte Spíritus Sancti, Deus, per ómnia sǽcula sæculórum.'));
  assert.match(n, /Fí:h li:h um:h tu:h um:f/);
  assert.match(n, /Sanc:g ti:f De:h us:h/);
  assert.match(n, /sæ:h cu:h ló:h rum:d A:h men:h$/);
});

test('reading: flexa, punctum, conclusion, question (AR II p. 756)', () => {
  const n = notes(readingGabc('Beátus homo qui corrípitur a Deo; increpatiónem ergo Omnipoténtis ne réprobes. Quia ipse vúlnerat et medétur, pércutit, et manus eius sanábunt.'));
  assert.match(n, /a:h De:h o:f/);
  assert.match(n, /ré:h pro:d bes:d/);
  assert.match(n, /et:i ma:i nus:i e:j ius:i sa:i ná:h bunt:h$/);
  assert.match(notes(readingGabc('Quis enim cognóvit sensum Dómini?')), /sen:g sum:g Dó:f mi:g ni:gh$/);
});

test('versicle at the little hours (AM p. 532)', () => {
  assert.match(notes(versicleGabc('Veni, Dómine, et noli tardáre.')), /tar:h dá:h re:f$/);
});
