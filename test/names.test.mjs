// The names put where the books print "N.".
import test from 'node:test';
import assert from 'node:assert/strict';
import { fillPreces, fillScoreName } from '../site/names.js';

const plain = (s) => s.replace(/[]/g, '');
const d = '2026-11-11';
test('the Pope and the bishop in the intercessions, declined', () => {
  assert.equal(plain(fillPreces('Custódi Papam nostrum N., et Epíscopum N.,', { date: d })), 'Custódi Papam nostrum Leónem, et Epíscopum N.,');
  assert.equal(plain(fillPreces('Papæ nostro N. tradidísti,', { date: d })), 'Papæ nostro Leóni tradidísti,');
  assert.equal(plain(fillPreces('pro Papa nostro N. et Epíscopo nostro N.,', { date: d, hk: true })), 'pro Papa nostro Leóne et Epíscopo nostro Stéphano,');
  assert.equal(plain(fillPreces('Prótege, Pastor ætérne, antístitem nostrum N.', { date: d, hk: true })), 'Prótege, Pastor ætérne, antístitem nostrum Stéphanum');
  assert.equal(plain(fillPreces('Papam nostrum N. tuére.', { date: '2025-03-01' })), 'Papam nostrum Francíscum tuére.');
  assert.match(fillPreces('Papam nostrum N.', { date: d }), /Leónem/, 'marked to be red');
  assert.equal(plain(fillPreces('We pray for N., our Pope, and N., our bishop,', { date: d, lang: 'en', hk: true })), 'We pray for Leo, our Pope, and Stephen, our bishop,');
  assert.equal(plain(fillPreces('Preserve our holy father, Pope N., and N., our bishop,', { date: d, lang: 'en' })), 'Preserve our holy father, Pope Leo, and N., our bishop,');
});
test('the saint\'s name in a score of the common', () => {
  const body = '(f3) be(f)á(cf)te(f) {<i>N</i>}.,(g_[uh:l]h) *(kxiji/jkj.) (;) di(j)ví(j\')nae(i)';
  assert.equal(fillScoreName(body, 'O doctor óptime, Ecclésiæ sanctæ lumen, beáte Leo, divínæ legis amátor'), '(f3) be(f)á(cf)te(f) <c>Leo</c>,(g_[uh:l]h) *(kxiji/jkj.) (;) di(j)ví(j\')nae(i)');
  assert.match(fillScoreName(body, 'beáte Alphónse María, divínæ legis'), /<c>Alphónse María<\/c>,/);
  assert.match(fillScoreName(body, 'beáte N., divínæ legis'), /<c>N\.<\/c>/, 'the common itself: N. in red');
  assert.equal(fillScoreName('(c4) Al(f)le(g)lú(h)ia.(g)', 'Allelúia'), '(c4) Al(f)le(g)lú(h)ia.(g)');
});
