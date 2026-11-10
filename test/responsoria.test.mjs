// The responsories of the Office of Readings find their GregoBase score by their first words,
// whatever the books' spelling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fuzzyWords, findResponsory } from '../site/responsoria.js';

const list = JSON.parse(readFileSync(new URL('../data/oco/responsoria-prolixa.json', import.meta.url), 'utf8'));

test('spelling is levelled', () => {
  assert.deepEqual(fuzzyWords('Cœlum et Hierúsalem, allelúia.'), fuzzyWords('cælum et Ierusalem'));
  assert.deepEqual(fuzzyWords('charitátem quotídie nunquam'), fuzzyWords('caritatem cotidie numquam'));
  assert.deepEqual(fuzzyWords('Jesus prophéta'), ['iesus', 'profeta']);
});

test('responsories of the Liturgia Horarum on GregoBase', () => {
  // First Sunday of Advent (Nocturnale Romanum)
  assert.ok(findResponsory(list, 'Aspíciens a longe, ecce vídeo Dei poténtiam veniéntem, et nébulam totam terram tegéntem.', 'Quique terrígenæ et fílii hóminum, simul in unum dives et pauper.'));
  assert.ok(findResponsory(list, 'Roráte, cæli, désuper, et nubes pluant iustum;', 'Emítte Agnum, Dómine, dominatórem terræ,'));
  // the same response with another verse is another piece: no score
  assert.equal(findResponsory(list, 'Aspíciens a longe, ecce vídeo Dei poténtiam veniéntem', 'Tu es qui ventúrus es'), null);
  assert.equal(findResponsory(list, 'Verbum', 'In princípio'), null);
});
