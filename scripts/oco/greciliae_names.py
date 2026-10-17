#!/usr/bin/env python3
"""Write data/oco/gregorio-glyphs.json: code point -> glyph name for the greciliae and
greextra fonts of Gregorio 6.0.0 (the version the OCO was typeset with), read from the
release's fonts:
  curl -L -o g.tar.bz2 https://github.com/gregorio-project/gregorio/releases/download/v6.0.0/gregorio-6.0.0.tar.bz2
  tar xjf g.tar.bz2
  python3 scripts/oco/greciliae_names.py gregorio-6.0.0/fonts data/oco/gregorio-glyphs.json
"""
import json
import sys
from fontTools.ttLib import TTFont

fonts, out = sys.argv[1], sys.argv[2]
data = {}
for name in ("greciliae", "greextra"):
    cmap = TTFont(f"{fonts}/{name}.ttf").getBestCmap()
    data[name] = {hex(cp): g for cp, g in sorted(cmap.items())}
json.dump(data, open(out, "w"), indent=0)
print({k: len(v) for k, v in data.items()})
