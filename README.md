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
termination, accented syllables bold and preparatory ones italic. The first verse of the
Benedictus and the Magnificat takes the solemn mediant (jgabc's "Solemn Tone"), the others
the simple one with the intonation repeated.

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

Short readings, collects and the versicles of the little hours are sung on the common
tones of the Antiphonale Monasticum 2005 (vol. I) and the Antiphonale Romanum II (2009),
as GregoBase transcribes them (20918-20920): `site/recitation.js` splits the text at its
punctuation and points each member with jgabc's engine, the cadence written as a
psalm-tone formula. Collects (AM p. 536, AR II p. 759, *tonus ferialis*): on do, flexa
to la after the last accent, metrum (si, la before the accent) at the principal division,
punctum to fa; the conclusion likewise ("Fílium tuum" flexa, "Spíritus Sancti, Deus"
metrum). Readings (AM p. 529, AR II p. 756): flexa at a colon or semicolon, punctum at a
full stop, the question (si, la, si) and the conclusion rising to re with mi on the last
accent but one. Versicles at the little hours (AM p. 532): on do, falling to la after the
last accent. An option shows them as text instead. `test/recitation.test.mjs` checks the
books' examples. Only the ferial forms are on GregoBase; the festive or solemn forms and
the melismatic versicle before the readings of the Office of Readings are still to come.

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
psalter days are the fallback.

### Translations

An option shows a translation under the Latin: English (iBreviary in English) or Chinese
(the Hong Kong Diocesan Liturgy Commission's daily office, 每日日課, catholic-dlc.org.hk,
published a month at a time). `scripts/texts/translations.mjs` fetches both for the same
window as the Latin into `cache/texts/tr/<lang>/` (the Pages workflow runs it after
`window.mjs`), reading each hour into one shape: hymn, psalms with their antiphons,
reading, responsory, Gospel canticle antiphon, intercessions, collect, the readings of the
Office of Readings, the parts of each little hour. `site/translate.js` lays each piece
under its Latin only when it is the same text: psalms by number (canticles by place), and
what is proper to the day only when the short reading (or the first reading of the Office
of Readings) has the same chapter and verse, since iBreviary's English follows the United
States calendar and Hong Kong its own. Short pieces stand open, psalms, hymns and long
readings fold.

### PDF

The settings have a PDF control: A4, A5 or Letter pages, or a booklet (A5 pages two to an
A4 sheet, half-Letter pages two to a Letter sheet, in saddle-stitch order: print both
sides, flip on the short edge, fold). `site/print.js` composes the hour again into a
column as wide as the page's text, every score drawn one SVG per system
(`createSvgNodeForEachLine`) so pages break between staves, cuts it into atoms (systems,
paragraphs, verses, a heading kept with what follows), pours them into pages and opens
the print dialog, where "Save as PDF" makes the file.

### Chants of the ordinary

Deus, in adiutorium takes its tone from the day (Antiphonale Monasticum 2005: ferial on
weekdays and memorials, festive on Sundays and feasts, solemn at Lauds and Vespers of
solemnities). The Pater noster at Lauds and Vespers is sung (AM 2005 pp. 533–534,
ferial or festive). The conclusions are sung, Benedicamus
Domino at the little hours and the Office of Readings (AM 2005 p. 546). At Lauds and
Vespers an option says whether a priest or deacon presides: then Dominus vobiscum and
the blessing (AR II p. 761), otherwise Dominus nos benedicat (recited on the formula of
that blessing, as the books give no score); then Benedicamus Domino of the day's rank
(AR II pp. 764–765). Deus in adiutorium ends with Alleluia, or in Lent with the Lenten
ending its score carries.

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

### Memorials

On memorials in Ordinary Time, Lauds and Vespers take the weekday from the short reading
on (reading, responsory, canticle antiphon unless proper, intercessions), or, by the
option, the common; the collect is always the saint's.

### Invitatory

An option puts the invitatory before Lauds or the Office of Readings: *Domine, labia mea
aperies* (Antiphonale Monasticum 2005 tones), the invitatory antiphon (proper, or the
psalter's one-week cycle) and Psalm 94 (95) in the Liber Hymnarius tone that matches the
antiphon's mode, the antiphon repeated after each strophe.

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
