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
(MIT), vendored from [bbloomf/jgabc](https://github.com/bbloomf/jgabc) (public domain),
whose psalm-tone pointing engine will also be reused.

### Calendar

[romcal](https://github.com/romcal/romcal) 3 with its General Roman Calendar plugin,
Latin localisation, generates `site/data/calendar/YYYY.json` for 2025–2032: celebrations
with rank, precedence, season and week, psalter week, Sunday and weekday cycles, colours,
optional memorials and the Commons each saint may use.

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
