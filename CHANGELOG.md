# Changelog

The version is in `package.json` (semantic versioning: MAJOR.MINOR.PATCH) and is shown at the
foot of the page with the commit it was built from. Each user-visible change bumps it and
gets an entry here: PATCH for a fix, MINOR for something new.

## 1.6.0 — 2026-11-07

- Hymns with a score where they had only text: Sunday's Office of Readings in weeks II and
  IV (Salve dies), the common of pastors (Christe pastorum caput, Inclitus rector, Vir celse,
  Dum sacerdotum, Hi sacerdotes, Sacrata nobis, in the form for a pope, a bishop or a
  priest), and the other hymns the OCO names only in its index (51 in all).
- Compline in Ordinary Time: Te lucis or Christe qui splendor by the psalter week, in the
  melody of the day's rank (Sunday, solemnity, feast, memorial, feria), Saturday evening
  being the Sunday's; fully notated with the Liber Hymnarius text.
- Mutual enrichment: ℟. Deo gratias after the short reading.
- iBreviary's rubrics on the invitatory ("Quando sequens psalmus adhibitus est ad
  Invitatorium…") are left out: the app places the invitatory itself, always with Ps 94.

## 1.5.0 — 2026-11-07

- Settings "Short reading" and "Collect": text, or sung. The short reading on the tone of
  the Antiphonale Romanum II (tonus lectionis) or on the Liber Usualis' tone for the
  Chapter; the collect on the Antiphonale Romanum II's tonus orationis. The readings of the
  Office of Readings stay text.

## 1.4.1 — 2026-11-07

- Compline in the Triduum and the octave of Easter: the antiphon the OCO puts in place of
  the responsory (Christus factus est, longer each day; then Hæc dies), not In manus tuas.
- "obœ́diens", "prœ́lia" and the like no longer print as "obǼdiens" in scores read from the OCO.

## 1.4.0 — 2026-11-07

- "Mutual enrichment" in the settings: bonus content from the older Roman Office, each
  marked *ex more, ad libitum* in the hour: Fidelium animæ at the end of the hours;
  after the antiphon of Our Lady at Compline its versicle, collect and Divinum auxilium;
  the antiphon of Our Lady by the traditional calendar (Alma to 1 February, Ave Regina
  to Wednesday of Holy Week, none in the Triduum, Regina cæli to the Friday after
  Pentecost).
- Without that option the antiphon of Our Lady follows the present seasons: Salve Regina
  in all of Ordinary Time (it was Alma in January and Ave Regina in February).

## 1.3.1 — 2026-11-07

- Invitatory: the antiphon is printed once, with the rubric "Antiphona repetitur", not twice.

## 1.3.0 — 2026-11-07

- Invitatory: the antiphon is sung twice before the psalm, as the General Instruction
  (no. 34) has it. When it ends with "Veníte, adorémus", only those words are sung after
  each strophe and the whole antiphon after the Gloria Patri (Liber Hymnarius, 2019).
- Invitatory in modes IV, IV* and IV**: the psalm is now cut into its strophes with the
  antiphon between them; it ran on as one piece.

## 1.2.1 — 2026-11-07

- Salus et gloria in psalter weeks I and IV: the Antiphonale Romanum II melody of p. 480,
  as the Klein Graduale's Sunday booklets sing it, instead of week II's.
- "O lux beata Trinitas" (Sunday Vespers, weeks II and IV) is sung from the Antiphonale
  Romanum II (p. 466), the Liber Hymnarius's score not being on GregoBase.

## 1.2.0 — 2026-11-07

- Sunday Vespers in Ordinary Time: the canticle Salus et gloria (Ap 19) is sung with its
  Alleluias as one score from the Antiphonale Romanum II, as the OCO prescribes, instead of
  the text with an antiphon. Weeks II and III have their own setting; weeks I and IV,
  not yet on GregoBase, sing week II's.
- Scores no longer print "℟.." and "℣.." with a doubled full stop.

## 1.1.0 — 2026-11-06

- Sound: the ▶ now plays with the iPhone's ringer switch on silent (the page plays as
  media: `navigator.audioSession` on iOS 17+, unmute.js before that), and wakes the audio
  after a call or a locked screen.
- Version number at the foot of the page.
- Visitor counts (number of visitors, their countries) with GoatCounter: open source,
  no cookies, no personal data.
- English translation (beta) in the settings, laid out as Breviarium Gregorianum: psalms
  verse by verse, antiphons, hymns, readings, responsories, intercessions and collect
  under the Latin. iBreviary's English where the OCO sings the Liturgia Horarum's text;
  the app's own translation in the same manner where the OCO's text differs (279
  antiphons and responsories of the coming weeks) and for hymns iBreviary has no English for.
- Christ the King: its hymn at II Vespers as at I Vespers (the index gave it to I Vespers
  only).
- Hymns without a Liber Hymnarius score on GregoBase no longer borrow another hymn's score
  that begins alike ("O lux beata Trinitas" had the score of "O lux beata Caelitum",
  "Pange lingua … certaminis" that of the Corpus Christi hymn); their text is shown.

## 1.0.0 — 2026-11-05

Every hour of every day of the General Roman Calendar in chant after the Ordo Cantus
Officii 2015: psalms pointed to their tones, propers of seasons, feasts and saints, daily
iBreviary texts; ▶ on every score; PDF pages and booklets with a print size; the source
of every score and a help page; icons for every platform.
