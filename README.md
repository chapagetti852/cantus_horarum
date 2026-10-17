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

`site/psalmtone.js` points each verse to its tone. The tone formulas are written in
jgabc's psalm-tone notation and follow the Antiphonale Romanum II (2009) pp. 738–740
(GregoBase 18352–18366), with the Antiphonale Monasticum 2005 ending names the OCO uses
(`8g`, `2*a`, `4*e`, `Dg`, `per.` …). The engine (a smaller rewrite of jgabc's rules,
which depend on jQuery) splits Latin into syllables, finds the main and secondary
accents from the printed accent marks, groups iBreviary's printed lines into verses
(flex †, mediant *, termination), and fits the intonation, accents, preparatory
syllables and tenor. Each antiphon's own "E u o u a e" picks the ending when the OCO
label disagrees and sets the pitch, so the tone sits where the antiphon is written.
Each psalm is drawn as one score, verse after verse; an option draws only the first
verse in notes and the others as text with cadence accents in bold and preparatory
syllables in italic. Gospel canticles take the intonation on every verse.
`test/psalmtone.test.mjs` checks the table against the E u o u a e of every OCO antiphon.
The pointing follows jgabc's rules: secondary accents every second syllable back from
the main accent and, across words, from the next accent or the end of the half-verse (so
a final monosyllable makes "lí-be-ra me" end as a spondee); a hollow note before an
accent (1 d, 2 d, 4 e) takes a dactyl's accented syllable and moves the cadence one
syllable on; a half-verse too short for intonation and cadence keeps the intonation
("Ma-gní-fi-cat *"). `scripts/tones/compare_jgabc.mjs` points every half-verse of the
psalter with every cadence through both engines: 99.97% of the comparable cases agree;
the rest are syllable divisions chosen on purpose (ad-iú-tor, Is-ra-el, cu-i).

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
