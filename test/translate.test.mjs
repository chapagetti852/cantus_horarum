// Translations are laid under the Latin by psalm number and by the reading's chapter and verse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterVerse, psalmNumber, hourTranslation } from '../site/translate.js';

test('psalm numbers across Latin, English, Chinese', () => {
  assert.equal(psalmNumber('Psalmus 112 (113)', 'la'), 113);
  assert.equal(psalmNumber('Psalmus 5, 2-10. 12-13', 'la'), 5);
  assert.equal(psalmNumber('Psalm 19B', 'en'), 19);
  assert.equal(psalmNumber('聖詠 19(18):8-15 （讚頌天主）', 'zh'), 19);
  assert.equal(psalmNumber('Canticum Eph 1, 3-10', 'la'), 'c');
  assert.equal(psalmNumber('聖歌 弗1:3-10', 'zh'), 'c');
});

test('same office when the readings have the same chapter and verse', () => {
  assert.equal(chapterVerse('2 Th 3, 10b-13'), '3:10');
  assert.equal(chapterVerse('2 Thessalonians 3:10b-13'), '3:10');
  assert.equal(chapterVerse('得後3:10-13'), '3:10');
  const day = { lang: 'zh', hours: { laudes: { reading: { ref: '得後3:10-13' } }, media: { tertia: { reading: { ref: '羅13:8,10' } } } } };
  assert.equal(hourTranslation(day, 'laudes', '2 Th 3, 10b-13').same, true);
  assert.equal(hourTranslation(day, 'laudes', '2 Cor 1, 3-5').same, false);
  assert.equal(hourTranslation(day, 'tertia', 'Rom 13, 8. 10').same, true);
});
