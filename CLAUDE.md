# Cantus Horarum — notes for Claude

Personal web app (one user, Latin only) for singing the Liturgia Horarum (Ordinary Form)
in Gregorian chant according to the Ordo Cantus Officii 2015. Hosted on GitHub Pages
from `main` (`.github/workflows/pages.yml` builds `dist/` with `node scripts/build.mjs`).
Model: Breviarium Gregorianum (breviariumgregorianum.com) but for the OF. Hours: Office
of Readings (no readings, yes responsories), Lauds, Terce, Sext, None, Vespers, Compline.
Read `README.md` first: it explains every pipeline.

## Layout

- `sources/oco.pdf` — the Ordo Cantus Officii *editio cum cantu* (antiphonale.net, v.6 2026).
  The master document: which antiphon/hymn/responsory for every slot, with modes.
  Pages 1–1212 body, 1213–1319 indices. `sources/LHCompl.pdf` — a Compline booklet (reference).
- `scripts/oco/extract_oco.py` → `data/oco/oco.json`, `docs/oco.md` (every piece, by PDF
  font/column). `extract_indices.py` → `data/oco/indices.json`. `docs/oco-sigla.md` = slot codes.
- `scripts/gregobase/import_dump.py` indexes the GregoBase SQL dump
  (`git clone --depth 1 https://github.com/gregorio-project/GregoBase`, file
  `gregobase_online.sql`, CC0) into `data/gregobase/*.json` and a GABC cache in `cache/`
  (git-ignored). `select_gabc.py` copies the scores the site uses into `data/gabc/` (committed).
- `scripts/oco/match_gregobase.py` → `data/oco/gregobase-match.json`. Order of preference:
  GregoBase version "Verona" (antiphonale.net's own OCO transcriptions, ids ~10678–16818,
  headers carry `occasion`/`office-part`), then the book+page the OCO cites
  (AM=17/18/19, ARII=6, PM=24, LHym=15, AR=9), then incipit+mode. `check_antiphonale_net.py`
  cross-checks against `data/antiphonale-net/links.json` (slot code → GregoBase id).
- `scripts/calendar/build.mjs` — romcal 3 (dev) + `@romcal/calendar.general-roman`, Latin
  localisation → `site/data/calendar/YYYY.json` (2025–2032).
- `scripts/texts/window.mjs` — rolling window of daily texts (today−3 … today+35) into
  `cache/texts/days/`; the build copies them to `dist/data/days/`.
- `scripts/texts/ibreviary.mjs` — Latin office texts from ibreviary.com/m2 (POST date to
  opzioni.php, session cookie, then breviario.php?s=…). Run with `NODE_USE_ENV_PROXY=1`
  in cloud sessions. Output `data/texts/days/<date>.json`; `data/texts/psalter-days.json`
  maps psalter week-day → a quiet 2026 Ordinary Time date. The build turns those into
  `dist/data/psalterium.json` keyed `"<psalterWeek>-<dow>"` (0 = Sunday).
- `site/` — plain HTML/CSS/JS, no framework. `app.js` composes an hour, `psalmtone.js`
  points psalm verses to a tone, `chant.js` renders GABC with Exsurge (`site/vendor/exsurge.min.js`, from bbloomf/jgabc, public domain).
  Fonts: Crimson (OFL) in `site/fonts/`.

## Conventions

- Keep the app dependency-free and static; data is precomputed by scripts, committed, and
  copied by `scripts/build.mjs`. Scores are fetched per file from `gabc/<id>.gabc`.
- Mobile first (390 px), legible, serif, rubrics in red. Hymns: first strophe notated,
  rest as text. Antiphon labels show the OCO mode (e.g. `8g`, `2*a`, `4*e` — Solesmes 2005
  tone names).
- Texts from iBreviary and the OCO are copyrighted (LEV); private use only, `noindex`.
- Verify rendering with headless Chromium (Playwright is installed in cloud sessions):
  serve `dist/` and screenshot `#YYYY-MM-DD/<hour>` at width 390.
- Work directly on `main` (the only branch); commit and push there, which deploys Pages.
- Commit messages: plain, what and why. No model names in commits.

## Status / next steps

Working: every hour of every day. Psalms and Gospel canticles pointed to their tones
(`site/psalmtone.js`); propers of seasons, feasts and saints resolved from the OCO index
slot codes (`site/resolve.js`, README "Propers"); daily iBreviary texts in a rolling
window (`scripts/texts/window.mjs`, run daily by the Pages workflow into the git-ignored
`cache/texts/days`); invitatory option (Ps 94 in the Liber Hymnarius tones).
`npm test` (after `node scripts/build.mjs`) checks tones and propers.
To do:
1. Compline on solemnities (Sunday forms); optional memorials as a choice; Saturday
   memorial of Our Lady; feminine/plural variants of the commons.
2. Hong Kong diocesan calendar; English / Cantonese translations line by line (later).
