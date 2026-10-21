// Translations are laid under the Latin by psalm number and by the reading's chapter and verse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterVerse, psalmNumber, hourTranslation, sameReading, trVerses, alignPsalm, precesParts, hymnKey, hymnCorresponds } from '../site/translate.js';

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

test('the same reading cut otherwise by each translation', () => {
  assert.equal(sameReading('Tob 4, 14-15a. 16ab. 19', 'Tobit 4:15a, 16a, 18a, 19'), true);
  assert.equal(sameReading('Tob 4, 14-15a. 16ab. 19', '多4:16-17,19-20 (拉丁通行本)'), true);
  assert.equal(sameReading('1 Th 5, 9-10', '1 Thessalonians 5:4-5'), false);
  assert.equal(sameReading('Rom 13, 8. 10', '羅13:8,10'), true);
});

test('translated psalms read into verses and laid under the Latin ones', () => {
  // the Hong Kong doxology is one verse, the Latin's two
  const zh = trVerses(['弟兄們同居共處，*', '多麼美好，多麼幸福！', '願光榮歸於父、及子、及聖神。※', '起初如何，今日亦然，直到永遠。亞孟。'], 'zh').flat();
  assert.equal(zh.length, 3);
  assert.deepEqual(zh[2], ['起初如何，今日亦然，直到永遠。亞孟。']);
  // English: a verse is its mediant line and the next; two English verses can go under one Latin
  const latin = [['Ecce quam bonum et quam iucúndum * habitáre fratres in unum:',
    'sicut unguéntum óptimum in cápite, † quod descéndit in barbam, barbam Aaron, * quod descéndit in oram vestiménti eius;']];
  const en = ['How good and how pleasant it is, *', 'when brothers live in unity!', '',
    'It is like precious oil upon the head *', 'running down upon the beard,', 'running down upon Aaron’s beard, *', 'upon the collar of his robes.'];
  const a = alignPsalm(latin, en, 'en');
  assert.equal(a.mode, 'verse');
  assert.equal(a.under[0].length, 1);
  assert.equal(a.under[1].length, 2);
});

test('intercessions and hymns', () => {
  const p = precesParts(['領：我們同聲向他祈禱：', '眾：主，求你聖化你的眾弟兄。', '領：求你使我們以純潔的心，', '——也讓我們聖化這一天。', '眾：主，求你聖化你的眾弟兄。']);
  assert.equal(p.pairs.length, 1);
  assert.deepEqual(p.pairs[0], ['求你使我們以純潔的心，', '也讓我們聖化這一天。']);
  assert.equal(hymnKey('Christe, qui, splendor et dies,'), 'christe qui splendor');
  const table = { 'caeli deus sanctissime': { en: ['most holy god'], zh: ['至聖的造物真主'] } };
  assert.equal(hymnCorresponds(table, hymnKey('Cæli Deus sanctíssime,'), 'en', 'Most Holy God in heav’n above,'), true);
  assert.equal(hymnCorresponds(table, hymnKey('Cæli Deus sanctíssime,'), 'zh', '至聖的造物真主，'), true);
  assert.equal(hymnCorresponds(table, hymnKey('Cæli Deus sanctíssime,'), 'en', 'Come, friends, praise noble deeds'), false);
});
