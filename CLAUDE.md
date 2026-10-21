# Cantus Horarum — notes for Claude

Personal web app (one user; Latin texts, English interface) for singing the Liturgia Horarum (Ordinary Form)
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
- The GregoBase dump on GitHub stops in January 2024; `scripts/gregobase/scrape_sources.py`
  tops up `data/gregobase/chants.json` from the live book listings (LHym 15, AM 17-19,
  AR 6/53, antiphonale.net's Antiphonae et Responsoria 61-64/67). Run it before matching.
- `scripts/oco/match_hymni.py`: hymns from the Liber Hymnarius 1983 only, on the page the
  OCO cites ("LHym 283"), incipit deciding between hymns on one page.
- `scripts/oco/read_notation.py` reads the OCO's own notation (Gregorio glyphs) into
  `data/gabc-oco/<oco id>.gabc`; `check_notation.py` compares with GregoBase;
  `choose_scores.py` marks entries to use the reading ("use": "oco": no GregoBase score,
  or the match is another chant); the build serves them as `gabc/oco-<id>.gabc`.
  Pipeline order: scrape_sources → match_gregobase → match_hymni → match_responsoria →
  read_notation → choose_scores → build.
- `scripts/oco/match_responsoria.py` re-matches the short responsories (after
  `match_gregobase.py`); `scripts/gregobase/fetch_gabc.sh <ids>` fetches single GABC
  files from GregoBase into `data/gabc/` when the dump's `cache/` is not at hand.
- `scripts/oco/match_gregobase.py` → `data/oco/gregobase-match.json`. Order of preference:
  GregoBase version "Verona" (antiphonale.net's own OCO transcriptions, ids ~10678–16818,
  headers carry `occasion`/`office-part`), then the book+page the OCO cites
  (AM=17/18/19, ARII=6, PM=24, LHym=15, AR=9), then incipit+mode. `check_antiphonale_net.py`
  cross-checks against `data/antiphonale-net/links.json` (slot code → GregoBase id).
- `scripts/calendar/build.mjs` — romcal 3 (dev) + `@romcal/calendar.general-roman`, Latin
  localisation → `site/data/calendar/YYYY.json` (2025–2032).
- `scripts/texts/window.mjs` — rolling window of daily texts (today−3 … today+35) into
  `cache/texts/days/`; the build copies them to `dist/data/days/`. Sunday solemnities
  take another year's weekday texts (iBreviary gives the Sunday). `translations.mjs`
  fetches English / Chinese for the same window into `cache/texts/tr/`.
- `site/recitation.js` sings readings, collects, versicles on the AM 2005 / AR II common
  tones; `site/print.js` makes PDF pages and booklets through the print dialog.
- `scripts/texts/ibreviary.mjs` — Latin office texts from ibreviary.com/m2 (POST date to
  opzioni.php, session cookie, then breviario.php?s=…). Run with `NODE_USE_ENV_PROXY=1`
  in cloud sessions. Output `data/texts/days/<date>.json`; `data/texts/psalter-days.json`
  maps psalter week-day → a quiet 2026 Ordinary Time date. The build turns those into
  `dist/data/psalterium.json` keyed `"<psalterWeek>-<dow>"` (0 = Sunday).
- `site/` — plain HTML/CSS/JS, no framework. `app.js` composes an hour, `psalmtone.js`
  holds the tones and calls jgabc's own pointing engine (`site/vendor/jgabc/`, as on
  bbloomf.github.io/jgabc/psalmtone.html with Nova Vulgata verses: `scripts/texts/verses.mjs`
  + `data/novavulgata/`), `chant.js` renders GABC with Exsurge (`site/vendor/exsurge.min.js`, from bbloomf/jgabc, public domain).
  Fonts: EB Garamond (OFL) in `site/fonts/`, its Latin language system (`locl` for
  `LAT`, which turns u into v) removed from `ebgaramond-latin.woff2`, since Safari applies it
  under `lang="la"` whatever `font-feature-settings` says.

## Conventions

- Keep the app dependency-free and static; data is precomputed by scripts, committed, and
  copied by `scripts/build.mjs`. Scores are fetched per file from `gabc/<id>.gabc`.
- The UI follows Breviarium Gregorianum (breviariumgregorianum.com) as closely as
  possible: EB Garamond, bar with hour select, date and gear; rank / title / hour heading;
  psalm modes Plenus (all notated) and Compactus (first verse notated, numbered list);
  a ▶ on every score sings it (`site/player.js`, Web Audio, voice range in settings).
- Mobile first (390 px), legible, serif, rubrics in red, notes follow the text colour
  (night mode). Settings live in the header (gear). No grey labels over scores; where a
  score is shown its text is not repeated. Hymns and psalms are each one full score
  (psalms can be switched to "first verse notated, rest pointed text"). Antiphon scores
  stand before and after their psalm. Tone labels (red, "Tonus 8 g") use the Solesmes
  2005 names.
- Short responsories are single pieces of music: the OCO's, matched to GregoBase part
  "rb" by `scripts/oco/match_responsoria.py` (text decides between variants); the
  iBreviary text only where GregoBase has no score.
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
2. Hong Kong diocesan calendar. Translations (English from iBreviary, Chinese from the
   Hong Kong DLC, `scripts/texts/translations.mjs`, `site/translate.js`) are built, verse
   by verse as Breviarium Gregorianum, but shelved (`TRANSLATIONS = false` in `site/app.js`,
   no setting in `index.html`); hymns need judging in `data/hymns/match.json` as new
   ones enter the window (the build lists them), English for those without in
   `data/hymns/en.json`. The
   festive/solemn common tones and the melismatic versicle (AM 2005 pp. 527-539) are not
   on GregoBase yet (`site/recitation.js` has the ferial ones).
