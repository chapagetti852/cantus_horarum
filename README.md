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
The first verse of each psalm is drawn in notes with the intonation; the others are
text with cadence accents in bold and preparatory syllables in italic (an option draws
every verse). Gospel canticles take the intonation on every verse.
`test/psalmtone.test.mjs` checks the table against the E u o u a e of every OCO antiphon.

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

Status: Lauds, Vespers and Compline of Ordinary Time days work from the psalter, with
the psalms and canticles pointed to their tones (the little hours' psalms too); the
Office of Readings and the little hours are not yet composed; seasons, feasts and the
sanctoral are not yet resolved.

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
