// Collects, readings and versicles on the common tones reproduce the books' own examples
// (GregoBase 20918-20920: AM 2005 pp. 529, 532, 536; AR II pp. 756, 759).
import test from 'node:test';
import assert from 'node:assert/strict';
import engine from './jgabc.mjs';
import { setRecitationEngine, collectGabc, readingGabc, versicleGabc, chapterGabc, luCollectGabc } from '../site/recitation.js';

setRecitationEngine(engine);
// syllable(notes) pairs, bars and markup left out
const notes = (g) => [...g.replace(/<[^>]+>/g, '').matchAll(/([^\s()]+)\(([a-m]+)\.*\)/g)].map((m) => `${m[1].replace(/[,;:.?]/g, '')}:${m[2]}`).join(' ');

test('collect: flexa, metrum, punctum (AR II p. 759)', () => {
  const g = collectGabc('Da, quǽsumus, omnípotens Deus, hanc tuis fidélibus voluntátem, ut, Christo tuo veniénti iustis opéribus occurréntes, eius déxteræ sociáti, regnum mereántur possidére cæléste.', { amen: false });
  const n = notes(g);
  assert.match(n, /vo:h lun:h tá:h tem:f ut:h/, 'flexa: la after the last accent');
  assert.match(n, /o:h pé:h ri:h bus:h oc:g cur:f rén:h tes:h/, 'metrum: si, la before the accent');
  assert.match(n, /cæ:h lés:h te:d$/, 'punctum: fa after the accent');
});

test('collect conclusion (AR II pp. 760-761)', () => {
  const g = collectGabc('Deus, qui ... Per Dóminum nostrum Iesum Christum, Fílium tuum, qui tecum vivit et regnat in unitáte Spíritus Sancti, Deus, per ómnia sǽcula sæculórum.');
  const n = notes(g);
  assert.match(n, /Fí:h li:h um:h tu:h um:f/);
  assert.match(n, /Spí:h ri:h tus:h Sanc:g ti:f De:h us:h per:h/);
  assert.match(g, /Sanc\(g\)ti,\(f\) De\(h\)us,\(h\) \(,\)/, 'no bar after Sancti, a bar after Deus');
  assert.match(n, /sæ:h cu:h ló:h rum:f A:h men:h$/, 'the end falls to la only');
  assert.match(notes(collectGabc('Deus, qui ... Per Christum Dóminum nostrum.')), /Per:h Chris:h tum:h Dó:h mi:h num:h nos:h trum:f A:h men:h$/);
  assert.match(notes(collectGabc('Deus, qui ... Qui vivis et regnas in sǽcula sæculórum.')), /in:h sǽ:h cu:h la:h sæ:h cu:h ló:h rum:f A:h men:h$/);
  assert.match(notes(collectGabc('Deus, qui ... Qui vivis et regnas cum Deo Patre in unitáte Spíritus Sancti, Deus, per ómnia sǽcula sæculórum.')), /Pa:h tre:h in:h u:h ni:h tá:h te:h Spí:h ri:h tus:h Sanc:g ti:f De:h us:h/);
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

test('chapter tone: flex, metrum, full stop (Liber Usualis p. 123)', () => {
  const n = notes(chapterGabc('In diébus illis salvábitur Iuda, et Israël habitábit confidénter, et hoc est nomen quod vocábunt eum: Dóminus iustus noster.'));
  assert.match(n, /con:h fi:h dén:h ter:f/, 'flex: la after the last accent');
  assert.match(n, /vo:h cá:g bunt:f e:h um:h/, 'metrum: si, la before the accent');
  assert.match(n, /ius:h tus:h nos:f ter:ef$/, 'full stop: la on the accent, sol-la at the end');
});

test('chapter tone: flex and metrum alternate in a long sentence', () => {
  const g = chapterGabc('Fidélis sermo: Nam si commórtui sumus, et convivémus; si sustinémus, et conregnábimus; si negábimus, et ille negábit nos; si non crédimus, ille fidélis manet, negáre enim seípsum non potest.');
  const n = notes(g);
  assert.match(n, /il:h le:g ne:f gá:h bit:h nos:h/, 'the last division: metrum');
  assert.match(n, /con:h re:h gná:h bi:f mus:f/, 'before it: flex');
  assert.match(n, /et:h con:g vi:f vé:h mus:h/, 'and before that the metrum again');
});

test('Liber Usualis festal tone for the prayers (p. 98)', () => {
  const n = notes(luCollectGabc('Preces nostras, quǽsumus, Dómine, cleménter exáudi: atque a peccatórum vínculis absolútos, ab omni nos adversitáte custódi. Per Dóminum nostrum Iesum Christum, Fílium tuum, qui tecum vivit et regnat in unitáte Spíritus Sancti, Deus, per ómnia sǽcula sæculórum.'));
  assert.match(n, /cle:h mén:h ter:g ex:f áu:h di:h/, 'metrum at the colon: si, la before the accent');
  assert.match(n, /ab:h so:h lú:h tos:g/, 'flex after it: the last syllable a semitone down');
  assert.match(n, /cus:h tó:h di:h Per/, 'the body ends on the reciting note');
  assert.match(n, /tu:h um:g/, 'conclusion: flex at Fílium tuum');
  assert.match(n, /Sanc:g ti:f De:h us:h/, 'conclusion: metrum at Spíritus Sancti, Deus');
});

test('Liber Usualis ancient simple tone (pp. 101-102)', () => {
  const n = notes(luCollectGabc('Præsta, quǽsumus, omnípotens Deus: ut semper rationabília meditántes, quæ tibi sunt plácita, et dictis exsequámur et factis. Per Christum Dóminum nostrum.', { tone: 'simple' }));
  assert.match(n, /De:h us:g/, 'flex: the last syllable a semitone down');
  assert.match(n, /me:g di:f tán:h tes:h/, 'metrum: si, la before the accent of meditántes');
  assert.match(n, /fac:h tis:f/, 'full stop a third down');
  assert.match(n, /nos:h trum:f A:f men:h$/, 'the short conclusion likewise, Amen la-do');
});

test('versicle on Sundays and feasts: the Liber Usualis first tone (p. 118)', () => {
  const g = versicleGabc('Dirigátur, Dómine, orátio mea.', 'Sicut incénsum in conspéctu tuo.', { festive: true });
  assert.match(g, /me\(h\)a\.\(g'_\/hvGF'Efgf\.\)/, 'the neume on the last syllable');
  assert.match(g, /tu\(h\)o\.\(g'_\/hvGF'Efgf\.\)/, 'and on the response');
});
