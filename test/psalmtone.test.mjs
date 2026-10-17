// Psalm-tone pointing: syllables, verse grouping, and every OCO antiphon's
// "E u o u a e" reproduced by the tone table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { syllabify, versesOf, pointVerse, toneContext, parseMode } from '../site/psalmtone.js';

const syl = (t) => syllabify(t).map((s) => s.text.trim()).join('|');

test('Latin syllables', () => {
  assert.equal(syl('Verba mea áuribus pércipe, Dómine;'), 'Ver|ba|me|a|áu|ri|bus|pér|ci|pe,|Dó|mi|ne;');
  assert.equal(syl('eius quia Dei Iesus adiutórium ádiuvet'), 'e|ius|qui|a|De|i|Ie|sus|ad|iu|tó|ri|um|ád|iu|vet');
  assert.equal(syl('sanctus lingua exáudi Israel'), 'san|ctus|lin|gua|ex|áu|di|Is|ra|el');
});

test('mode labels', () => {
  assert.deepEqual(parseMode('8g'), { tone: '8', ending: 'g' });
  assert.deepEqual(parseMode('2*a'), { tone: '2*', ending: 'a' });
  assert.deepEqual(parseMode('2*-4d'), { tone: '2*', ending: 'd' });
  assert.deepEqual(parseMode('1d2'), { tone: '1', ending: 'd2' });
  assert.deepEqual(parseMode('Cc2'), { tone: 'C', ending: 'c2' });
  assert.deepEqual(parseMode('7at'), { tone: '7', ending: 'a' });
  assert.deepEqual(parseMode('per.'), { tone: 'per.', ending: '' });
  assert.equal(parseMode(null), null);
});

test('verses span several printed lines', () => {
  const v = versesOf(['Quóniam non est in ore eórum véritas,*', 'cor eórum fóvea;', 'sepúlcrum patens est guttur eórum,*', 'mólliunt linguas suas.',
    'proptérea memor ero tui*', 'de terra Iordánis et Hermónim,', 'de monte Misar.', 'Abýssus abýssum ínvocat', 'in voce cataractárum tuárum;*', 'omnes gurgites tui.']);
  assert.deepEqual(v.map((x) => x.map((l) => l.part[0]).join('')), ['mt', 'mt', 'mtt', 'mmt']);
});

// pitches only; a flat written before its note ("ixi") counts once
const pitches = (n) => (n.replace(/([a-m])x\1/gi, '$1').match(/[a-m]/gi) || []).join('').toLowerCase();

// Tests the table with the OCO label alone (the app also lets the E u o u a e choose).
// Some matched scores are another chant of a different mode, so the check is per
// label: for every label with a few antiphons, most must agree note for note. Bare
// mode numbers carry no ending, and the OCO's 2*d / 2*f are sung to tone D's endings.
test('terminations reproduce the antiphons\' E u o u a e', { skip: !existsSync('dist/data/oco.json') && 'run the build first' }, () => {
  const oco = JSON.parse(readFileSync('dist/data/oco.json', 'utf8'));
  const gloria = [{ text: 'et in sǽcula sæculórum. Amen.', part: 'termination' }];
  const byLabel = {};
  for (const e of oco) {
    if (!e.gabc || !parseMode(e.mode) || e.kind === 'hymn' || /^(\d\**|2\*[df])$/.test(e.mode)) continue;
    const path = `data/gabc/${e.gabc}.gabc`;
    if (!existsSync(path)) continue;
    const src = readFileSync(path, 'utf8');
    const eu = /E\(([^)]*)\)\s*u\(([^)]*)\)\s*o\(([^)]*)\)\s*u\(([^)]*)\)\s*a\(([^)]*)\)\s*e\.?\(([^)]*)\)/.exec(src);
    if (!eu) continue;
    const got = pointVerse(gloria, toneContext(e.mode, src, { identify: false }))[0].syllables.slice(-6).map((s) => pitches(s.notes)).join(' ');
    const want = eu.slice(1).map(pitches).join(' ');
    const l = (byLabel[e.mode] ||= { n: 0, ok: 0, bad: [] });
    l.n++;
    if (got === want) l.ok++; else l.bad.push(`${e.gabc}: ${got} ≠ ${want}`);
  }
  const total = Object.values(byLabel).reduce((a, l) => a + l.n, 0);
  assert.ok(total > 1000, `only ${total} antiphons checked`);
  const failing = Object.entries(byLabel).filter(([, l]) => l.n >= 4 && l.ok / l.n < 0.7);
  assert.deepEqual(failing.map(([k, l]) => `${k} ${l.ok}/${l.n} (${l.bad.slice(0, 2).join('; ')})`), []);
});

test('the E u o u a e chooses the ending when there is one', { skip: !existsSync('dist/data/oco.json') && 'run the build first' }, () => {
  const oco = JSON.parse(readFileSync('dist/data/oco.json', 'utf8'));
  let n = 0, found = 0;
  for (const e of oco) {
    if (!e.gabc || e.kind === 'hymn' || !existsSync(`data/gabc/${e.gabc}.gabc`)) continue;
    const src = readFileSync(`data/gabc/${e.gabc}.gabc`, 'utf8');
    const eu = /E\(([^)]*)\)\s*u\(([^)]*)\)\s*o\(([^)]*)\)\s*u\(([^)]*)\)\s*a\(([^)]*)\)\s*e\.?\(([^)]*)\)/.exec(src);
    if (!eu || !parseMode(e.mode)) continue;
    n++;
    const got = pointVerse(gloria(), toneContext(e.mode, src))[0].syllables.slice(-6).map((s) => pitches(s.notes)).join(' ');
    if (got === eu.slice(1).map(pitches).join(' ')) found++;
  }
  assert.ok(found / n > 0.97, `${found}/${n}`);
});
function gloria() { return [{ text: 'et in sǽcula sæculórum. Amen.', part: 'termination' }]; }
