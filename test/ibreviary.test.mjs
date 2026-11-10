// iBreviary's pages are not all made alike: the shapes the parser has met.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHour, donorFor, properKey } from '../scripts/texts/ibreviary.mjs';
import { hkKey } from '../scripts/texts/hk.mjs';

const page = (body) => `<html><body><div id="contenuto">${body}</div><div id="menu_bar"></div></body></html>`;
const sec = (t) => `<span class="capolettera_piccolo">${t}</span><br /><br />`;
const rub = (t) => `<span class="rubrica">${t}</span>`;
const psalm = (n) => `${rub(`Psalmus ${n}`)}<br /><br />Versus primus,*<br />et alter.<br /><br />`;
const shape = (secs) => secs.filter((s) => s.title).map((s) => `${s.title}:${s.blocks.map((b) => b.kind[0] + (b.n || '')).join('')}`).join(' ');

test('"Ant. 1" closed inside the PSALMODIA heading (Friday Lauds)', () => {
  const secs = parseHour(page(`<span class="capolettera_piccolo">PSALMODIA<br /><br />Ant. 1</span> Cor mundum crea in me.<br /><br />${psalm(50)}${rub('Ant.')} Cor mundum crea in me.<br /><br />${rub('Ant. 2')} Lætare.<br /><br />${psalm(99)}${rub('Ant.')} Lætare.<br /><br />${sec('LECTIO BREVIS')}${rub('Eph 2, 13')}<br />Nunc autem.<br />`));
  assert.equal(shape(secs), 'PSALMODIA:a1paa2pa LECTIO BREVIS:rt');
});

test('the heading of the psalmody missing or only a rubric after the hymn (feasts, 2 November)', () => {
  const hymn = `${sec('HYMNUS')}Ætérna Christi múnera<br />et mártyrum victórias.<br /><br />`;
  const body = `${rub('Ant. 1')} In omnem terram.<br /><br />${psalm(18)}${rub('Ant.')} In omnem terram.<br /><br />`;
  assert.equal(shape(parseHour(page(`${hymn}${rub('PSALMODIA')}<br /><br />${body}`))), 'HYMNUS:t PSALMODIA:a1pa');
  assert.equal(shape(parseHour(page(`${hymn}${body}`))), 'HYMNUS:t PSALMODIA:a1pa');
  assert.equal(shape(parseHour(page(`${hymn}${sec('PRALMODIA')}${body}`))), 'HYMNUS:t PSALMODIA:a1pa', 'and misspelt (24 June)');
});

test('the middle hour: an antiphon run into the line before it, hours without their headings', () => {
  const lb = (ref) => `${rub('LECTIO BREVIS')}<br />${rub(ref)}<br />Lectio.<br />${rub('℣.')} Versus.<br />`;
  const or = `${rub('ORATIO')}<br />Orémus.<br /><br />Deus, qui.<br />`;
  // "Psalmodia Complementaris" and "Ant. 1" on one line
  const one = parseHour(page(`${sec('PSALMODIA')}Psalmodia Complementaris${rub('Ant. 1')} Deduc me.<br /><br />${psalm(118)}${rub('Ant.')} Deduc me.<br /><br />${sec('AD TERTIAM')}${lb('Rom 5, 1')}${or}`));
  assert.equal(shape(one), 'PSALMODIA:ta1pa AD TERTIAM:rrtvrtt');
  // Sext and None as plain text or rubrics under Terce; the three readings straight after the psalms
  const text = parseHour(page(`${sec('PSALMODIA')}${psalm(118)}${sec('AD TERTIAM')}${lb('Col 1, 12')}AD SEXTAM<br /><br />${lb('Col 1, 16')}${rub('AD NONAM')}<br /><br />${lb('Col 1, 19')}${or}`));
  assert.equal(shape(text), 'PSALMODIA:p AD TERTIAM:rrtv AD SEXTAM:rrtv AD NONAM:rrtvrtt');
  const bare = parseHour(page(`${sec('PSALMODIA')}${psalm(118)}${lb('Gal 4, 4')}${lb('Gal 4, 5')}${lb('Gal 4, 6')}${or}`));
  assert.equal(shape(bare), 'PSALMODIA:p AD TERTIAM:rrtv AD SEXTAM:rrtv AD NONAM:rrtvrtt');
});

test('the Ascension and Corpus Christi on their Thursdays: iBreviary has them on the Sunday', () => {
  assert.deepEqual(donorFor('2027-05-06'), { id: 'ascension_of_the_lord', date: '2027-05-09' });
  assert.equal(properKey('2027-05-05'), 'I Vesp. ascension_of_the_lord@2027-05-09', 'its I Vespers on the Wednesday');
  assert.equal(donorFor('2027-05-09').date, null, 'the seventh Sunday of Easter: no pages anywhere');
  assert.deepEqual(donorFor('2027-05-27'), { id: 'most_holy_body_and_blood_of_christ', date: '2027-05-30' });
  assert.equal(donorFor('2027-05-07'), null);
  // Hong Kong keeps them on the Sunday: those dates' own pages
  assert.equal(hkKey('2027-05-06'), 'easter_time_6_thursday@2027-05-06');
  assert.equal(hkKey('2027-05-09'), 'ascension_of_the_lord@2027-05-09');
  // a fixed feast on a Sunday still takes another year's weekday
  assert.equal(donorFor('2026-11-01').id, 'all_saints');
  assert.equal(donorFor('2026-11-10'), null);
});
