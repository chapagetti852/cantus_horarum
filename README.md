# Cantus Horarum

A personal, mobile-first web app for singing the Liturgia Horarum (Ordinary Form) in
Latin Gregorian chant, following the **Ordo Cantus Officii** (editio typica altera, 2015)
as laid out in the *editio cum cantu* (antiphonale.net, v.6, 2026) kept in `sources/oco.pdf`.
It aims at the same experience as [Breviarium Gregorianum](https://breviariumgregorianum.com/)
gives for the Extraordinary Form: pick a date and an hour, get everything on one legible
page with the chant notation, the psalm tones and the pointed psalm texts.

Hours: Office of Readings (without the two readings, with the responsories), Lauds, Terce,
Sext, None, Vespers, Compline. Everything is static and hosted on GitHub Pages.

## How it is built

```
sources/oco.pdf ──► scripts/oco/extract_oco.py ──► data/oco/oco.json      (every antiphon, hymn,
                                                     docs/oco.md             responsory, with mode,
                 ──► scripts/oco/extract_indices.py ► data/oco/indices.json  CAO number, source book)
GregoBase dump  ──► scripts/gregobase/import_dump.py ► data/gregobase/*.json (18 000 scores index)
both            ──► scripts/oco/match_gregobase.py ──► data/oco/gregobase-match.json (OCO entry → GABC)
romcal (Latin)  ──► scripts/calendar/build.mjs ──────► site/data/calendar/YYYY.json
iBreviary (la)  ──► scripts/texts/…  (psalter once, propers in a rolling window; to do)
site/           plain HTML/CSS/JS; Exsurge draws the GABC as SVG in the browser
```

### The Ordo Cantus Officii

The PDF is LuaTeX + Gregorio output, so its text layer is clean and each kind of text is
set in its own font and column. `extract_oco.py` reads the PDF with PyMuPDF and turns it into
one record per piece: part / chapter / day / hour / position (1, 2, 3, B, M, Nunc, H, ℟ br.),
mode, the plain incipit printed above the staff, the full sung text reconstructed from the
syllables under the neumes, the scripture reference, the CAO number and the source book and
page (AM = Antiphonale Monasticum 2005–07, ARII = Antiphonale Romanum II 2009, PM =
Psalterium Monasticum 1981, LHym = Liber Hymnarius 1983, AR = Antiphonale Romanum 1912 …).
`docs/oco.md` is a readable rendering of the same data; `docs/oco-sigla.md` explains the
slot codes used in the PDF's indices (`data/oco/indices.json`: every antiphon, hymn and short
responsory with the day/hour/position it belongs to).

Entries flagged `text_matches_title: false` are the few places where the printed incipit and
the sung text differ (editorial substitutions in the PDF); `untitled` marks pieces whose
incipit line was lost in the PDF layout.

### Chant notation

GregoBase (CC0) publishes its whole database as a MySQL dump in
[gregorio-project/GregoBase](https://github.com/gregorio-project/GregoBase).
`import_dump.py` indexes it and writes every GABC file into `cache/` (not committed).
`match_gregobase.py` links each OCO piece to a score, preferring antiphonale.net's own
transcriptions of the OCO texts (GregoBase version "Verona"), then the book and page the OCO
cites, then incipit and mode. `check_antiphonale_net.py` compares the result with the slot
codes antiphonale.net publishes. Only the GABC files actually used will be copied into the
site.

Notation is drawn in the browser by [Exsurge](https://github.com/frmatthew/exsurge)
(MIT), vendored from [bbloomf/jgabc](https://github.com/bbloomf/jgabc) (public domain).

### Psalm tones

The pointing is jgabc's own engine, the one behind its psalm-tone tool
(https://bbloomf.github.io/jgabc/psalmtone.html, Benjamin Bloomfield, public domain):
`util.js`, `psalmtone.js` and the Hypher Latin hyphenation patterns, vendored in
`site/vendor/jgabc/` (a small shim stands in for jQuery) and called as that page calls
them: intonation on the first verse (every verse of a Gospel canticle), flex, mediant,
termination, accented syllables bold and preparatory ones italic. Every verse of the
Benedictus and the Magnificat takes the ornate mediant, with its intonation, the second half
in the psalm tone, as the Antiphonale Romanum II lays them out ("Mediatio ornata ad canticum
evangelicum", pp. 745-750): jgabc's "Solemn Tone", read against the book, which differs in
three tones (III: the first accent si-mi; IV: the intonation from mi; V: the mediant falling
to la after its accent).

The verses are given to it as the tool gives them with "Nova Vulgata" ticked: one verse
per line, "first half † flex * second half". `scripts/texts/verses.mjs` (run by the
build) groups iBreviary's printed lines into such verses by jgabc's own Nova Vulgata
psalter and canticles (`data/novavulgata/`): where a Nova Vulgata verse is word for word
what iBreviary prints and ends at a printed line's end it gives the boundaries (96% of
verses), elsewhere the * and † of the printed lines do. The words stay the Liturgia
Horarum's; the Nova Vulgata's diaereses (Israël) are taken over.

`site/psalmtone.js` holds the tone table in jgabc's notation, after the Antiphonale
Romanum II (2009) pp. 738–740 (GregoBase 18352–18366), with the Antiphonale Monasticum
2005 ending names the OCO uses (`8g`, `2*a`, `4*e`, `Dg`, `per.` …). Each antiphon's own
"E u o u a e" picks the ending when the OCO label disagrees and sets the pitch, so the tone
sits where the antiphon is written. `test/psalmtone.test.mjs` (with jgabc loaded by
`test/jgabc.mjs`) checks the table against the E u o u a e of every OCO antiphon.

### The page

Modelled on Breviarium Gregorianum (breviariumgregorianum.com): EB Garamond (OFL,
`site/fonts/`), a slim bar with the hour, the date and the settings, the rank in red over
the celebration and the hour, red psalm titles, and the two psalm modes of its settings:
*Plenus* (every verse in notes, numbered) and *Compactus* (the first verse in notes, the
others a numbered list pointed in bold and italic).

### Readings, collects, versicles

Short readings and collects are sung, by the settings "Short reading" and "Collect", on the
Antiphonale Romanum II's tones (the default), on the Liber Usualis', or left as text; the
readings of the Office of Readings stay text.

The Antiphonale Romanum II (2009, "Toni communes" pp. 756-761) has one tone for each, on do:

- The lessons (p. 756; GregoBase 20919): the flexa at a colon or semicolon, falling a third
  after the last accent ("a Dé-o;"), the punctum at a full stop, a fifth down after it
  ("ré-pro-bes."), the question ("sen-sum Dó-mi-ni?"), and the conclusion of the reading
  rising to re and mi ("et ma-nus é-ius sa-ná-bunt."), which the book gives ad libitum.
- The orations (pp. 759-761; GregoBase 20920 has the body only): the flexa in a long first
  part ("vo-lun-tá-tem,"), the metrum, si and la before the last accent
  ("oc-cur-rén-tes,"), the punctum a fifth down ("cæ-lés-te."). The conclusion has its own
  cadences, read from the book: "Fílium tú-um," to la on its last syllable, "Spíritus
  Sánc-ti," si-la, "Deus," on do with a bar, and the end ("sæculó-rum.", "Dóminum nós-trum.")
  to la on its last syllable only; Amen on do.

The intercessions are sung too (setting "Intercessions": full notation, abbreviated
notation, or text; abbreviated as the book writes its tones, p. 758: each member's first word
on the reciting note, hollow notes over the rest of the recitation's words, the cadence in
full, and ℟. for the response sung after the introduction) on the AR II's tone
(p. 758, "De cantu intercessionum"), on do: the introduction with the collects' flexa in its
first part when it is long and their metrum at its end ("ro-gé-mus, di-cén-tes:"); the
response falling sol-la-fa at its end ("et noli tar-dá-re."); each intention with the
metrum at the end of its first part and its second part ending as the response, then the
response.

The Liber Usualis (1961) has its tones as it assigns them in the Office (p. 124):

- The short reading on the tone for the Chapter (p. 123; jgabc's "Chapter"), on do: the flex
  a minor third after the last accent ("confi-dén-ter"), the metrum with si and la before it
  ("vo-cá-bunt é-um"), the full stop with la on the accent, sol after it and sol-la at the end
  ("nós-ter"); the metrum at the colon with the flex before it, and in long sentences flex
  and metrum alternating, the metrum last (pp. 121-123). At Compline, the tone for the short
  lesson: the same flex and metrum, the full stop of the lessons, a fifth down.
- The collect at the Office of Readings, Lauds and Vespers of Sundays, solemnities, feasts and
  memorials: the festal tone (p. 98), on do: the metrum first, at the colon (si, la before
  the last accent: "cle-mén-ter ex-áu-di :"), then the flex at the semicolon or the next
  comma (the last syllable a semitone down: "ab-so-lú-tos,"), the body ending on the
  reciting note; the conclusion with its flex at "Fílium tuum" and metrum at "Spíritus Sancti,
  Deus". At the little hours, at Compline and on ferias the ancient simple tone (p. 101), which
  the book allows in place of the recto tono of the first ferial tone: flex, metrum, the full
  stop a third down, Amen la-do. After the antiphons of Our Lady, the second ferial tone
  (p. 99): recto tono with that full stop.
- The versicles (before the readings of the Office of Readings, at the little hours): on
  Sundays, solemnities, feasts and memorials the Liber Usualis' first tone (p. 118), recto
  tono with the neume si-do-si-la-sol, la-si-la on the last syllable whatever its accent, as
  Albert Bloomfield's gabc-chants (github.com/asbloomf/gabc-chants, Vespers after the LU)
  writes it, `(g'_/hvGF'Efgf.)`; on other days the second, simple tone (the Antiphonale
  Monasticum's, p. 532; GregoBase 20918), falling a third after the last accent.

`site/recitation.js` points each member with jgabc's engine (the cadence written as a
psalm-tone formula); `test/recitation.test.mjs` reproduces the books' examples. Checked
against the chant sheets of the St. Benedict Tridentine Community, Windsor (festal tone,
1962 Missal; copyright Biretta Books, compared, not copied): the collect of the 32nd Sunday
per annum, the 19th after Pentecost's, comes out with the same metrum and flex.

### Singing the scores

Every score has a ▶ (as on Breviarium Gregorianum) that sings it: `site/player.js` reads
the GABC into pitches (staff positions, clef, flats until the next bar) and lengths (equal
notes; mora, episema, liquescence, bars) and plays them with the Web Audio API in a
recorded choir voice (`site/audio/choir/`, one note every three semitones) with a little
church reverberation, the note being sung lit red in the score. Chant has no absolute
pitch: the piece is moved so that its middle lies in the voice chosen in the settings
(gravis, media, acuta); a psalm or canticle is moved by its antiphon (they are one "key
group", `data-key`), since the tone is written at the antiphon's pitch.
`test/player.test.mjs` checks the reading.

### Calendar

[romcal](https://github.com/romcal/romcal) 3 with its General Roman Calendar plugin,
Latin localisation, generates `site/data/calendar/YYYY.json` for 2025–2032: celebrations
with rank, precedence, season and week, psalter week, Sunday and weekday cycles, colours,
optional memorials and the Commons each saint may use.

### The app

`site/` is plain HTML, CSS and JavaScript (no framework, no build step for the app
itself). `scripts/build.mjs` assembles `dist/`: the app, the compact OCO data
(`data/oco.json`), the four-week psalter texts (`data/psalterium.json`), the calendar
files and the GABC scores (`gabc/<GregoBase id>.gabc`, committed under `data/gabc/`).
`app.js` reads the calendar for the chosen date, works out the psalter week and day,
picks the OCO entries for that slot (hymn, antiphons 1–3, short responsory,
Benedictus or Magnificat antiphon, Compline antiphons) and the matching iBreviary
texts, and draws every score with Exsurge at the width of the phone. Hymns show the
first strophe notated and the rest as text.

The Office of Readings has its OCO hymn (the night or the day form, by the clock), the
three antiphons with their psalms and the versicle, then the two readings with their
responsories (as text) when the texts of that very date are present
(`dist/data/days/<date>.json`, copied from `data/texts/days/`). Terce, Sext and None
each have their own hymn, the psalter antiphons common to the three, and their own
short reading, versicle and collect.

### Propers: seasons, feasts, saints

`site/resolve.js` resolves a date and hour to its proper chants through the slot codes of
the OCO indices (`data/oco/indices.json`, shipped as `dist/data/slots.json`): *tempus*
(`1A2`, `A-18/12`, `29D`, `21/11`, `Asc`, the commons `Ap`, `BMV`, `Past` …), *officium*
(`L`, `V`, `1V`, `Ol`, `T` …) and *locus* (`1`–`3`, `B`, `Mb` …). The season's day is
resolved first (Sundays and weekdays of the seasons take what the season provides;
Ordinary Time weekdays keep the psalter), then the celebration of the day from the
calendar is laid over it: solemnities and feasts take every place from their proper or
common, memorials the hymn, the Gospel canticle antiphon and the invitatory (memorials
are only commemorated in Lent and after 16 December). Vespers on the eve of a Sunday or
solemnity that outranks the day are its I Vespers. A celebration's common comes from the
calendar, or from its titles (apostle, martyr, virgin, bishop …) when it gives none.
`test/resolve.test.mjs` checks a set of known days.

### Daily texts

`scripts/texts/window.mjs` keeps iBreviary's texts for every date from three days back
to five weeks ahead in `cache/texts/days/` (not committed). The Pages workflow runs it
every day at 03:00 Hong Kong time, with iBreviary's pages cached between runs, so each
date has its own collect, readings' responsories and proper texts; the 28 committed
psalter days are the fallback (`data/texts/psalter-days.json`: weekdays of Ordinary Time
with no memorial and no solemnity on the morrow, whose office is the plain psalter). Beyond
the window a line under the title says that the reading, responsory, intercessions and
prayer are the psalter's, wherever they are not the day's own (anything but a weekday of
Ordinary Time).

iBreviary's pages are not all made alike, and `parseHour` (`scripts/texts/ibreviary.mjs`,
examples in `test/ibreviary.test.mjs`) reads the shapes met so far: "Ant. 1" closed inside
the heading of the psalmody (Lauds on Fridays); the first antiphon of the middle hour run
into the line before it; the heading of the psalmody missing, misspelt or a mere rubric (the
Office of Readings of feasts, 2 November, 24 June); in the middle hour, the hours' headings
as plain text or missing, the hour's one antiphon after its hymn or before its reading with
the psalms bare (the seasons, feasts), or the whole hour under its heading (solemnities
with the complementary psalmody), and the collect printed once, under None. Some pages hold
the psalmody alone, or nothing: the Vespers of 7 and 31 December in every year (iBreviary has
no First Vespers of the Immaculate Conception or of the Mother of God), a date not filled
yet. `buildDay` then makes the Vespers on the eve of a solemnity from the feast's Second
Vespers with the psalmody of First Vespers where another feast lends it
(`I_VESPERS_PSALMODY`), takes a feast left empty from the same feast in another year, leaves
any other such hour out (the app takes the psalter's) and marks the day `retry`, so the
window makes it again each day. `DAY_FORMAT` is raised when the parser changes, and the
window's days are made again from the cached pages.

iBreviary follows the Italian calendar: the Ascension and Corpus Christi on a Sunday. In
the General Roman Calendar they are Thursdays, so `donorFor` gives the Thursday the pages
of the Sunday after it (its First Vespers, on the Wednesday, from that Saturday); the
Sunday after, where iBreviary has the feast, takes the same Sunday of another year, or
nothing (the seventh Sunday of Easter, which iBreviary never has: the psalter's texts,
with the line that says so). Hong Kong keeps both feasts on the Sunday, as iBreviary does:
`scripts/texts/hk.mjs` gives its days there the dates' own pages.

### Translations

The settings' "Translation (beta)" row offers Latin only, Chinese (Hong Kong), English,
Chinese and English (each under the Latin, Chinese first), and Chinese, else English (English
only where the Hong Kong office gives nothing for that piece) (`TRANSLATION_MODES` in
`site/app.js`; `eachTr` lays out each translation chosen in turn).

On memorials the setting "Memorials" chooses whether the short reading, responsory and
intercessions are the weekday's or the common's. Both are translated: the translated office
of the day when its short reading is the one the Latin sings, else the translated psalter's
weekday (`scripts/texts/psalter_translations.mjs`: the Hong Kong office and iBreviary in
English for the 28 quiet dates of `data/texts/psalter-days.json`, committed in
`data/texts/tr-psalter/`, served as `data/tr/<lang>/psalter.json`).

### Ordo: the Diocese of Hong Kong

The setting "Ordo" chooses the General Roman Calendar or the Diocese of Hong Kong's
(`site/data/calendar-hk/`, from `@romcal/calendar.hong-kong` by `scripts/calendar/build.mjs`,
with the diocese's own keeping where its Ordo and daily office differ from romcal: the Holy
Martyrs and Blesseds of China a feast, the cathedral's dedication a feast, the Lunar New Year
Masses left out, Latin names where romcal has English). iBreviary follows the Italian
calendar, which keeps the Ascension and Corpus Christi on Sunday as Hong Kong does; the
Epiphany differs, so `scripts/texts/hk.mjs` (run by `window.mjs`) writes
`cache/texts/days-hk/<date>.json` for the days that take other pages: the Epiphany on its
Sunday from 6 January (I Vespers from 5 January), the days after it from another year, the
cathedral's dedication from the Lateran's (9 November). The diocese's own memorials take the
date's pages, their antiphons and hymns from the OCO's commons. A first visit from Hong Kong
(its time zone, or a browser in Hong Kong Chinese) opens in Chinese with this calendar.

### Interface

The setting "Interface" sets the app's own words in English, Chinese (Hong Kong) or Latin
(`site/i18n.js`; the office's texts stay Latin). The Chinese takes the Hong Kong Diocesan
Liturgy Commission's terms wherever its daily office uses one: the hours (誦讀日課, 晨禱,
日間祈禱 午前／午時／午後, 晚禱, 第一晚禱, 夜禱), their parts (序經, 讚美詩, 聖詠吟唱, 簡短讀經,
短對答詠, 匝加利亞讚主曲, 聖母謝主曲, 西默盎聖歌, 禱詞, 天主經, 結束禱詞, 結束詞, 對答詠, 聖母
對經), the ranks (節日, 慶日, 紀念, 自由紀念), the psalter's weeks (聖詠集第一周). The
celebration's name is Hong Kong's, the Latin under it: `data/calendar-zh.json`, made by
`scripts/calendar/zh_names.mjs` from the titles of its daily office's pages (its archive,
May 2025 to November 2026, read page by page and matched to romcal's celebration of the
same date: optional memorials by the words of their titles, the solemnities Hong Kong moves to
Sunday by name, its diocesan feasts left out), filled from its Ordo (天主教羅馬禮禮儀日曆,
2022-2026) for the celebrations that fell on Sundays or in Lent; the seasons' weekdays and
Sundays follow its pattern (常年期第三十二周星期五). The Latin interface uses the Liturgia
Horarum's rubrics (Ad Laudes matutinas, Psalmodia, Lectio brevis, Preces…). The interface itself (settings,
headings, rank, messages) is in English; the celebration's name, the season's day and every
text of the office stay Latin.

The option shows a translation under the Latin: English (iBreviary in English) or Chinese
(the Hong Kong Diocesan Liturgy Commission's daily office, 每日日課, catholic-dlc.org.hk,
published a month at a time). `scripts/texts/translations.mjs` fetches both for the same
window as the Latin into `cache/texts/tr/<lang>/` (the Pages workflow runs it after
`window.mjs`), reading each hour into one shape: hymn, psalms with their antiphons,
reading, responsory, Gospel canticle antiphon, intercessions, collect, the readings of the
Office of Readings, the parts of each little hour. It is laid out as Breviarium Gregorianum lays its translations: a
smaller italic paragraph under the Latin (Chinese upright).

The Chinese is the Hong Kong office's text alone, never the app's: where the OCO sings
another antiphon or responsory than the Liturgia Horarum, where a memorial takes the
weekday's reading, responsory and intercessions and Hong Kong the common's (or the other
way round), and where Hong Kong's hymn is a hymn of its own rather than the Latin hymn's
translation, nothing is shown. It is set in Noto Serif TC (OFL), self-hosted in Google
Fonts' unicode-range slices (`site/fonts-zh.css`, `site/fonts/zh/`: a page fetches only
the slices its characters fall in). The PDF embeds the same face
(`site/fonts/pdf/NotoSerifTC-Regular.ttf`, its layout tables left out), downloaded only
for an hour with Chinese in it; jsPDF keeps only the glyphs used.

- Psalms and canticles (the Gospel canticles too) verse by verse. `site/translate.js`
  reads the translated psalm into verses by its own marks (`*` or `※`, `†` `＋`, a blank
  line between strophes; the Hong Kong doxology, one verse there, is split in two as in
  the Latin) and pairs them with the Latin verses in order by their share of the psalm's
  length (Gale and Church's alignment: one or two Latin verses with one or two
  translated): the Hong Kong office keeps the Latin division, the English Grail psalter
  often joins or splits verses. Compactus: each verse's translation under it; Plenus: one
  paragraph of numbered verses after each score. Where the verses cannot be paired the
  translation stands whole after the psalm.
- Antiphons under their score; intercessions intention by intention when they are as many;
  the collect under the collect, before the blessing; each reading of the Office of
  Readings under it, its responsory's after the responsory.
- Hymns: the translated office's hymn only when it is the Latin hymn's translation
  (`data/hymns/match.json`, judged by meaning, strophe by strophe: the English office keeps
  some hymns of its own calendar; Hong Kong translates freely, and has hymns of its own for
  many saints and for some hours; its entries are the hymn's opening, Han characters only,
  long enough to tell it from the others, "旭日初升我們懇切求主" and "旭日初升萬象歡騰"
  being two hymns), as one paragraph with numbered strophes;
  in English, where iBreviary has none, the app's own (`data/hymns/en.json`, keyed by the
  first three words; the OCO's two-word titles find their key there). Where the OCO's hymn
  has no score the text printed, and translated, is iBreviary's. The build names the hymns
  of the window not yet judged.
- What the OCO sings is not always what the Liturgia Horarum prints (another antiphon, or
  the same in other words). iBreviary's English stands only where the sung Latin has the
  same words as iBreviary's Latin and the office is shared (the psalter, or a proper office
  the English calendar keeps too); otherwise the app's own translation in iBreviary's
  manner, `data/translations/en.json`, keyed by the Latin without accents or punctuation
  (`ownKey` in `site/translate.js`; responsories: "\n— " before the versicle; the build
  serves it as `data/tr/own-en.json`). New days entering the window may bring texts
  without one: `node scripts/texts/missing_translations.cjs [from] [to]` (after the build,
  with the window's days and English in `dist/data`) opens every hour in Chromium with
  English on and lists the Latin texts and hymn keys left without English.

Psalms are matched by number (a canticle by chapter and verse, a part of a psalm by the
psalm before it); what is proper to the day only when the short reading (or either reading
of the Office of Readings) is the same chapter with overlapping verses, since iBreviary's
English follows the United States calendar and Hong Kong its own.

### Visitors and version

GoatCounter (open source, no cookies, no personal data) counts visits and their countries:
`site/vendor/goatcounter.js` (its count.js, ISC) posts to
`https://cantushorarum.goatcounter.com/count`, the dashboard of the site code
`cantushorarum`. It counts only on the published site, not on localhost. The foot of the
page shows `v<version> · <commit>` (from `package.json` and git, stamped by the build, also
in `dist/version.json`); `CHANGELOG.md` says what each version changed.

### PDF

The settings have a PDF control: A4, A5 or Letter pages, or a booklet (A5 pages two to an
A4 sheet, half-Letter pages two to a Letter sheet, in saddle-stitch order: print both
sides, flip on the short edge, fold). `site/print.js` composes the hour again into a
column as wide as the page's text, every score drawn one SVG per system
(`createSvgNodeForEachLine`) so pages break between staves, cuts it into atoms (systems,
paragraphs, verses, a heading kept with what follows) and pours them into pages.
`site/pdf.js` then draws each page into a real PDF file with jsPDF and svg2pdf.js
(`site/vendor/pdf/`, MIT): the scores as vector drawings, prepared as bbloomf/jgabc's
`chant-pdf.js` prepares Exsurge's SVG, the text word by word where the browser placed it,
in EB Garamond TrueType subsets (`site/fonts/pdf/`, OFL; they include ℣ and ℟). The
settings then offer Download and, where the browser has a share sheet, Share (on an
iPhone: Print, Save to Files). The print dialog is not used, as iOS Safari ignores a page's
paper size and margins and prints on whatever paper its dialog picks.

### Icons

`scripts/icons/make_icons.py` draws the icon (a clivis and a punctum falling down a
four-line staff, cream on a deep red) and writes every size from one drawing:
`site/icon.svg`, `site/favicon.ico` (16 drawn pixel by pixel, 32, 48), the 180 px
Apple touch icon (full bleed, opaque), and the manifest's 192/512 PNGs, "any" (rounded) and
"maskable" (full bleed). On a 512 grid where 16 units make one pixel at 32 px, the staff
lines are one pixel and the notes five, so the favicon is crisp. The header logo is the
same drawing inline in `index.html`.

### Sources of the scores

Every score shows, small at its top right beside ▶, where its notation comes from: the book
and page ("LH 197", "AM I 215", "A&R III 93", "AR II 738–740" for the psalm tones, "OCO 343"
for notation read from the Ordo's own pages). `site/sources.js` holds the abbreviations
(in order of preference when a chant is in several books); `scripts/build.mjs` heads each
shipped GABC file with `cantus-source:` (and `gregobase-id:`, which links the label to
GregoBase); the help ("Help and sources", in the footer and the settings) spells them out
with the other sources of the app. The PDF has a print size (70–150 %) beside its format.

### Chants of the ordinary

The Antiphonale Romanum II, the book of the Liturgia Horarum, is followed wherever it gives
a piece; the Antiphonale Monasticum 2005 only where it is silent (it is a book of Vespers on
Sundays and feasts). Deus, in adiutorium: the AR II's tone "in dominicis et festis" (p. 737,
the AM's ferial tone too) on every day, its tone "in sollemnitatibus" at Lauds and Vespers of
solemnities. The Pater noster at Lauds and Vespers: the AR II's one tone (pp. 758-759).
The conclusions are sung, Benedicamus Domino at the little hours and the Office of Readings
(AM 2005 p. 546). At Lauds and Vespers an option says whether a priest or deacon presides:
then Dominus vobiscum and the blessing (AR II p. 761), otherwise Dominus nos benedicat (AR
II p. 763, on the collect's tone); then the dismissal, Benedicamus Domino as the AR II gives
it ad libitum "secundum traditionem gregorianam" (pp. 763-765): I the sollemnitates maiores
(Christmas, Epiphany, Ascension; I and II Vespers, the AM's at Lauds), II other solemnities
(the AM's at Lauds), III feasts and the octave of Christmas, IV solemnities and feasts of
Our Lady, V Sundays after the octave of Easter (read from the book, not on GregoBase), VI
Sundays of Advent and Lent, VII Sundays per annum; ferias the AM's. In the octave of Easter
and on Pentecost, Ite in pace with its two Alleluias (p. 762). Deus in adiutorium ends with Alleluia, or in Lent with the Lenten
ending its score carries.

At Sunday II Vespers in Ordinary Time the canticle Salus et gloria (Ap 19) is sung, as the
OCO says, "more responsoriali vetustissimo cum Alleluia": no antiphon, one score with its
Alleluias (`SALUS_ET_GLORIA` in `site/app.js`). The Antiphonale Romanum II prints it in each
psalter week with one of two melodies: weeks I and III (pp. 457, 480, a melody it also
prints in Advent and Eastertide; GregoBase 4145) and weeks II and IV (pp. 469, 491;
GregoBase 4317). (The Klein Graduale's booklets, kleingraduale.nl/LiturgiaHorarum, sing the
first on every Sunday per annum; they give Sunday Lauds, Vespers and Compline for each
Sunday of the three years, after the OCO 1983, useful to check Sunday chants GregoBase lacks.)
Its translation follows it, the verses without their Alleluias. Outside Ordinary Time (Advent, Eastertide, feasts with that canticle)
the AR II sings it the same way, with the p. 480 melody, between the day's antiphon.

The AR II's appendix gives the old Vatican edition's melodies of Pange lingua and Vexilla
regis as alternatives. Pange lingua is a setting (GregoBase 1310, Liber Usualis p. 957, its
spelling brought to the Liber Hymnarius' in `loadGabc`); the Liber Hymnarius' Vexilla regis
(p. 58) is already the Vatican melody.

Hymns: the Liber Hymnarius's score where GregoBase has it; where it has none, the
Antiphonale Romanum II's of the same incipit (`match_hymni.py`; "O lux beata Trinitas",
AR II p. 466).

### Notation read from the OCO itself

The OCO was typeset with Gregorio, so its music is not pictures but glyphs of Gregorio's
greciliae font (6.0.0) on drawn staff lines, with the lyrics as text under them.
`scripts/oco/read_notation.py` reads it back into GABC: the glyphs' code points name the
neumes (`data/oco/gregorio-glyphs.json`, from the release fonts by
`scripts/oco/greciliae_names.py`), names that spell shape and intervals (PesOneNothing,
TorculusTwoOneNothing…); the glyph's height on the staff gives the pitch; Divisio glyphs
the bars; each lyric syllable (a text span of its own) takes the notes from the one under
its vowel to the next syllable's. Pieces start at their initials, run on over lines and
pages, and are lined up with the OCO entries by their opening words: 2,621 of 2,645
pieces, one GABC file each in `data/gabc-oco/`. `scripts/oco/check_notation.py` compares
them with antiphonale.net's own GregoBase transcriptions: 90% identical in pitch, notes
per syllable identical in 99%; the differences are mostly this edition's revisions.
`scripts/oco/choose_scores.py` then uses the OCO's reading wherever GregoBase has no
score or the matched one is another chant (pitch similarity below 0.8): 660 pieces.

### Short responsories

The OCO's short responsories are single pieces; `scripts/oco/match_responsoria.py`
matches them to GregoBase scores of part "rb" (Antiphonale Monasticum and Romanum
first), comparing the full text where one incipit serves several responsories, and
taking a score only when it carries most of the OCO's text; the others are read from the
OCO itself. 155 of 165 have a score; the remaining ten are cross-references
(`docs/responsoria-sine-notis.md`).

### The index's rows and the calendar's days

`scripts/oco/link_index.py` links the rows of the index of antiphons left without an entry
of the OCO's body (abbreviated incipits, "Amen a. d. vobis Non Moyses"; words skipped; a slip
of a letter). In `site/resolve.js`: a row whose place is the year alone ("a", "b", "bc") is
the Gospel antiphon of that year at Lauds and Vespers (Advent III and IV) or the antiphon of a
little hour (the Sundays of Lent); on a Sunday of Advent from 17 December the Benedictus
antiphon is the Sunday's, the Magnificat's the O antiphon of the date, and at First Vespers
a row for a date's Vespers ("A-19/12 V") means the evening's own date; Good Friday and Holy
Saturday are the OCO's 6Q6 and 6Q7 (romcal counts them the first week of the Triduum); the
Saturday of the Easter octave has the First Vespers of the octave Sunday, which keeps the
octave's antiphons ("1P"). The little hours take the one antiphon a row gives for a whole
season ("A", "Q", "N ante Ep"); the psalms of the other hours only what a week or a day
provides. `test/resolve.test.mjs` holds an example of each.

In Eastertide the index's bare "Alleluia" (weeks 2-7: the Office of Readings, Lauds 1 and 3,
Vespers 1 and 2, the little hours, Compline) is the OCO's "Psalmi cum Alleluia (in tonis
diversis)", not one of the seven pieces that begin with the word, to which the index's
extraction links it. The app sings the antiphon Alleluia in the mode of the psalter's
antiphon whose place it takes (`ALLELUIA` in `site/app.js`: the melodies of the Liber
Usualis and the Antiphonale Monasticum, one or more for each mode), so each psalm keeps the
tone the OCO gives it; the ending is the one the Alleluia itself shows.

### Memorials

On memorials in Ordinary Time, Lauds and Vespers take the weekday from the short reading
on (reading, responsory, canticle antiphon unless proper, intercessions), or, by the
option, the common; the collect is always the saint's.

### Responsories of the Office of Readings

Each reading of the Office of Readings has its responsory, proper to the day (iBreviary's
text). `scripts/oco/match_responsoria_prolixa.py` reads the response and the verse of every
responsory on GregoBase in the books of the Office (above all the Nocturnale Romanum,
Hartker 2002, which sets the Liturgia Horarum's; then the Liber Hymnarius, the Antiphonale
Monasticum 2005, Antiphonæ et Responsoria, the Antiphonale Monasticum 1934, the Liber
Usualis, the Liber Antiphonarius, Hartker's antiphoners, then the other books, the Dominican
antiphoners among them, and last the newest transcriptions that cite no book; not the
Dominican Graduale, whose "responsoria" are the graduals of Mass), from the GregoBase dump
(`import_dump.py` into a cache) and keeps their first words in
`data/oco/responsoria-prolixa.json`, the scores in `data/gabc`. The words are kept in a
levelled spelling (cælum / cœlum, Ierusalem / Hierusalem, caritas / charitas…: `fuzzy` in the
script, `fuzzyWords` in `site/responsoria.js`). The app takes the one whose response (its
first five words) and verse (its first four) begin as iBreviary's do, one word of each
allowed to differ ("Devastavit vineam tuam" in the books, "Exterminavit" in the Liturgia
Horarum), the closest first. The same response with another verse is another piece and takes
none. In the window of November and December 2026, 22 of 84 responsories have a score (about
one a day): the Scripture reading's is mostly an old one, the Father's often new in 1971
and set nowhere; seven more have their response on GregoBase with another verse.

After an antiphon its psalm's or canticle's first note stands as a custos after the double
bar, in the antiphon's clef (`withCustos` in `site/app.js`); the player does not sing it.

### Hymns the OCO names only in its index

Some hymns have no entry with a score in the OCO's body, only a row in its index (the
common of pastors, the hymns of Lent, the forms of the small hours and of Compline by
rank). `scripts/oco/match_index_hymns.py` matches each to GregoBase: the Liber Hymnarius on
the page the index cites (the row's qualifier choosing among the forms, "(fer.)", "(mem.)",
"(fest.)", "(dom.)", "(soll.)"), else the same hymn a page or two away, else the
Antiphonale Romanum II or the Liber Usualis (never a hymn marked for another season). The
pastors' hymns keep their three forms (pro Papa, pro Episcopo, pro Presbytero) and the app
takes the saint's. It writes `data/oco/index-hymns.json`; the build puts the score in the
index row (`data/slots.json`, 8th field) for `site/resolve.js`. Nine rows have no score on
GregoBase. A psalter reference "Ut in hebd. II" for the hymn takes all the hymns of that
hour there (Sunday's Office of Readings has one by night, one by day).

Compline in Ordinary Time sings Te lucis in psalter weeks I and III and Christe qui
splendor in weeks II and IV, each in the melody of the day's rank (ferias, memorials,
feasts, Sundays, solemnities: Liber Hymnarius pp. 241-244); Saturday evening is the
Sunday's Compline, of the next week. GregoBase has Te lucis for ferias and memorials with
its first strophe only: the build completes them with the same melody on every strophe of
the Sunday form's text (`completeHymn` in `scripts/build.mjs`), if they scan alike.

### Mutual enrichment

A window in the settings ("Mutual enrichment: Bonus content", with a twinkling pixel spark
and a burst of pixels for each option ticked, the bigger the more are on) adds customs of
the older Roman Office, all off unless ticked (`BONUS` in `site/app.js`, saved as
`settings.bonus`):

- *Fidelium animæ per misericordiam Dei requiéscant in pace. ℟. Amen.* after the
  conclusion of every hour but Compline, recto tono.
- After the antiphon of Our Lady at Compline, its versicle and collect (Breviarium
  Romanum; the Alma's versicle and collect change at I Vespers of Christmas), sung on the
  common tones, and *Divinum auxílium máneat semper nobíscum. ℟. Amen.* (Liber Usualis
  p. 277, recto tono).
- ℟. *Deo grátias* after the short reading, as after the Chapter in the older Office: in
  the score when it is sung (on the punctum of the AR II's lesson tone, or the Chapter's full
  stop, Liber Usualis p. 123), else as text.
- The antiphon of Our Lady by the traditional calendar (rubrics of 1960): Alma Redemptoris
  from Compline of the Saturday before Advent to 1 February, Ave Regina from 2 February to
  Wednesday of Holy Week, none in the Triduum, Regina cæli from Easter to the Friday after
  Pentecost, Salve Regina from I Vespers of the Trinity to the eve of Advent. Without it
  the antiphon follows the present seasons: Regina cæli in Eastertide (as the Liturgia
  Horarum prescribes), Alma in Advent and Christmastide, Ave Regina in Lent, Salve Regina
  in Ordinary Time.

### Office of Readings hymn

The Office of Readings has two hymns in Ordinary Time, one for the night or early morning and
one for the day (Sunday: Mediæ noctis or Salve dies); a proper hymn serves for both. The
setting "Office of Readings hymn" chooses: by the hour (the night's before 7), by day, or by
night. Only the hymn chosen is shown, with no rubric naming the other.

### Invitatory

An option puts the invitatory before Lauds or the Office of Readings: *Domine, labia mea
aperies* (Antiphonale Monasticum 2005 tones), the invitatory antiphon (proper, or the
psalter's one-week cycle) and Psalm 94 (95) in the Liber Hymnarius tone that matches the
antiphon's mode. The antiphon is sung and at once repeated (printed once, with the rubric
"Antiphona repetitur"), then after each strophe (IGLH 34). When it ends with "Veníte,
adorémus" (59 of the 78), only those words are sung after the five strophes and the whole antiphon after the Gloria Patri, as the Liber Hymnarius
allows (2nd ed., 2019, praenotanda: "haec verba tantum repetere licet post unamquamque
stropham … Sed post Gloria Patri, semper repeti debet antiphona integra"); they are cut
from the antiphon's own score (`veniteAdoremus` in `site/app.js`). The tones' strophes end
in a double bar written in several ways by their transcribers; all are read.

Status: every hour of every day is composed: Ordinary Time from the psalter, and the
seasons, feasts and saints from their propers. Not yet: Compline's Sunday form on
solemnities, optional memorials (the feria is said), the Saturday memorial of Our Lady.

### Deploying

The workflow in `.github/workflows/pages.yml` builds `dist/` and deploys it to GitHub
Pages on every push to `main` (Settings → Pages → Source: GitHub Actions).

## Working locally

```sh
pip install pymupdf
python3 scripts/oco/extract_oco.py sources/oco.pdf data/oco
python3 scripts/oco/extract_indices.py sources/oco.pdf data/oco
git clone --depth 1 https://github.com/gregorio-project/GregoBase ../GregoBase
python3 scripts/gregobase/import_dump.py ../GregoBase/gregobase_online.sql data/gregobase cache/gregobase
python3 scripts/oco/match_gregobase.py data/oco/oco.json data/gregobase/chants.json data/oco/gregobase-match.json
npm install && npm run build:calendar
```

## Sources and licences

- Ordo Cantus Officii, editio cum cantu — antiphonale.net (texts © Libreria Editrice
  Vaticana, used privately). GregoBase transcriptions — CC0. jgabc — public domain.
  Exsurge — MIT. romcal — MIT. Liturgia Horarum texts from iBreviary — for private use only.
- Choir voice: "Choir Aahs" of the FluidR3 GM soundfont (Frank Wen), CC BY 3.0, per-note
  MP3s from gleitz/midi-js-soundfonts.
