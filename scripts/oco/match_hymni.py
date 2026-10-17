#!/usr/bin/env python3
"""Match the OCO's hymns to the Liber Hymnarius (Solesmes 1983, GregoBase source 15).
The OCO cites each hymn by its Liber Hymnarius page ("Martyr Dei (LHym 283)"): the
GregoBase score of that book on that page is taken, the incipit deciding between hymns
on the same page; without one there, the same incipit elsewhere in the book (nearest
page). The general matcher could take a hymn from another book with the same incipit.
Updates data/oco/gregobase-match.json; prints the ids not yet in data/gabc.

Usage: python3 scripts/oco/match_hymni.py data/oco/oco.json data/gregobase/chants.json data/oco/gregobase-match.json
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

LH = 15


def norm(t):
    t = unicodedata.normalize("NFD", t or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    t = t.replace("æ", "ae").replace("œ", "oe").replace("j", "i").replace("v", "u")
    return re.sub(r"[^a-z ]+", " ", t).split()


def page_no(p):
    m = re.match(r"\d+", str(p))
    return int(m.group(0)) if m else None


def main():
    oco = json.load(open(sys.argv[1], encoding="utf8"))
    chants = json.load(open(sys.argv[2], encoding="utf8"))
    path = Path(sys.argv[3])
    matches = json.load(open(path, encoding="utf8"))
    by_oco = {m["oco_id"]: m for m in matches}
    lh = [(c, page_no(p)) for c in chants if c.get("has_gabc") for s, p in c["sources"] if s == LH]
    have = {int(p.stem) for p in Path("data/gabc").glob("*.gabc")}
    changed = found = 0
    missing = set()
    for e in oco:
        if e.get("kind") != "hymn":
            continue
        inc = norm(re.sub(r"\(.*", "", e.get("title") or ""))[:2]
        if not inc:
            continue
        page = page_no(e.get("lhym"))
        same = lambda c: norm(c["incipit"])[:len(inc)] == inc
        cands = [c for c, p in lh if page is not None and p == page and same(c)]
        if not cands:
            near = sorted(((abs((p or 0) - (page or 0)), c) for c, p in lh if same(c)), key=lambda x: (x[0], x[1]["id"]))
            cands = [c for _, c in near[:1]]
        if not cands:
            continue
        best = sorted(cands, key=lambda c: (0 if (c.get("version") or "").startswith("Solesmes") else 1, c["id"]))[0]
        found += 1
        m = by_oco.get(e["id"])
        if m is None:
            m = {"oco_id": e["id"], "page": e.get("page"), "incipit": e.get("title"), "mode": e.get("mode")}
            matches.append(m)
            by_oco[e["id"]] = m
        if m.get("gregobase") != best["id"]:
            changed += 1
        m.update(gregobase=best["id"], confidence="lhym-page" if page is not None else "lhym-incipit")
        if best["id"] not in have:
            missing.add(best["id"])
    json.dump(matches, open(path, "w", encoding="utf8"), ensure_ascii=False, indent=0)
    print(f"{found} hymns matched in the Liber Hymnarius, {changed} changed; not yet in data/gabc:", file=sys.stderr)
    print(" ".join(str(i) for i in sorted(missing)))


if __name__ == "__main__":
    main()
