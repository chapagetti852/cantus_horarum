#!/usr/bin/env python3
"""Decide, for every OCO entry the notation reader produced (data/gabc-oco), whether the
app shows that reading or the matched GregoBase score: the reading where GregoBase has
none, or where the matched score's pitches differ so much from the OCO's (similarity
below 0.8) that it is another chant; GregoBase's engraving otherwise (it carries
episemas and morae the reader leaves out). Writes "use": "oco" into
data/oco/gregobase-match.json.

Usage: python3 scripts/oco/choose_scores.py
"""
import difflib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import check_notation as C  # noqa: E402

path = Path("data/oco/gregobase-match.json")
matches = json.load(open(path, encoding="utf8"))
by_oco = {m["oco_id"]: m for m in matches}
oco = {e["id"]: e for e in json.load(open("data/oco/oco.json", encoding="utf8"))}
counts = {"none": 0, "other chant": 0, "gregobase kept": 0}
for m in matches:
    m.pop("use", None)
for f in sorted(Path("data/gabc-oco").glob("*.gabc")):
    oid = int(f.stem)
    m = by_oco.get(oid)
    if m is None:
        e = oco.get(oid, {})
        m = {"oco_id": oid, "page": e.get("page"), "incipit": e.get("title"), "mode": e.get("mode")}
        matches.append(m)
        by_oco[oid] = m
    g = Path(f"data/gabc/{m.get('gregobase')}.gabc") if m.get("gregobase") else None
    if not g or not g.exists():
        m["use"] = "oco"
        counts["none"] += 1
        continue
    a, b = C.pitches(C.body(f)), C.pitches(C.body(g))
    r = difflib.SequenceMatcher(None, a, b, autojunk=False).ratio() if a and b else 0
    if r < 0.8:
        m["use"] = "oco"
        m["oco_similarity"] = round(r, 2)
        counts["other chant"] += 1
    else:
        counts["gregobase kept"] += 1
json.dump(matches, open(path, "w", encoding="utf8"), ensure_ascii=False, indent=0)
print(counts)
