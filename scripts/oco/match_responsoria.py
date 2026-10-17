#!/usr/bin/env python3
"""Match the OCO's short responsories (responsoria brevia) to GregoBase scores of
responsories: the general matcher can take an antiphon with the same incipit. Only
GregoBase chants of part "rb" are considered, those of the Antiphonale Monasticum
(2005-2007) and Antiphonale Romanum (2009, 2020) first. Updates
data/oco/gregobase-match.json and prints the GregoBase ids whose GABC is not yet in
data/gabc (fetch them with scripts/gregobase/fetch_gabc.sh).

Usage: python3 scripts/oco/match_responsoria.py data/oco/oco.json data/gregobase/chants.json data/oco/gregobase-match.json
"""
import json
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

BOOKS = [61, 62, 63, 64, 67, 17, 18, 19, 6, 53]  # antiphonale.net (the OCO's own), AM I-III, AR II, AR I


def norm(t):
    t = unicodedata.normalize("NFD", t or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    t = t.replace("æ", "ae").replace("œ", "oe").replace("j", "i")
    return re.sub(r"[^a-z ]+", " ", t).split()


CACHE = Path("cache/gregobase/rb")


def lyrics(gid):
    """Words of a GregoBase score (fetched once into cache/gregobase/rb)."""
    f = CACHE / f"{gid}.gabc"
    if not f.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        subprocess.run(["curl", "-sfL", f"https://gregobase.selapa.net/download.php?id={gid}&format=gabc&elem=1", "-o", str(f)])
        time.sleep(0.5)
    body = f.read_text(encoding="utf8", errors="replace").split("%%")[-1] if f.exists() else ""
    body = re.sub(r"\([^)]*\)|<[^>]*>|\[[^]]*\]", "", body)
    return set(norm(body))


def main():
    oco = json.load(open(sys.argv[1], encoding="utf8"))
    chants = json.load(open(sys.argv[2], encoding="utf8"))
    match_path = Path(sys.argv[3])
    matches = json.load(open(match_path, encoding="utf8"))
    by_oco = {m["oco_id"]: m for m in matches}
    parts = {c["id"]: c.get("part") for c in (chants if isinstance(chants, list) else chants.values())}
    rb = [c for c in (chants if isinstance(chants, list) else chants.values()) if c.get("part") == "rb" and c.get("has_gabc")]

    def rank(c):
        books = [s[0] for s in c.get("sources", [])]
        best = min((BOOKS.index(b) for b in books if b in BOOKS), default=len(BOOKS))
        return (best, 0 if (c.get("version") or "").startswith("Solesmes") else 1, c["id"])

    changed = found = 0
    missing = set()
    have = {int(p.stem) for p in Path("data/gabc").glob("*.gabc")}
    for e in oco:
        if "br." not in (e.get("position") or "") or e.get("kind") == "reference":
            continue
        words = norm((e.get("title") or "").split("*")[0])
        if not words:
            continue
        # GregoBase incipits are often shorter than the OCO's: compare as many words as both have
        def opens(c):
            inc = norm(c["incipit"])[:4]
            return len(inc) >= 2 and words[:len(inc)] == inc
        cands = [c for c in rb if opens(c)]
        # the same incipit serves several responsories (other verse, alleluias): the text
        # decides, and a score that does not carry most of the OCO's words is not taken
        text = set(norm(e.get("text") or e.get("title")))
        scored = []
        for c in cands:
            words_c = lyrics(c["id"])
            share = len(text & words_c) / max(1, len(text))
            scored.append((share, -len(words_c - text), rank(c), c))
        scored.sort(key=lambda x: (-x[0], -x[1], x[2]))
        cands = [x[3] for x in scored if x[0] >= 0.6]
        if not cands:
            # no responsory score: better text than another piece
            m = by_oco.get(e["id"])
            if m and m.get("gregobase"):
                m.update(gregobase=None, confidence="rb-none")
                changed += 1
            continue
        best = cands[0]
        found += 1
        m = by_oco.get(e["id"])
        if m is None:
            m = {"oco_id": e["id"], "page": e.get("page"), "incipit": e.get("title"), "mode": e.get("mode")}
            matches.append(m)
            by_oco[e["id"]] = m
        if m.get("gregobase") != best["id"]:
            changed += 1
        m.update(gregobase=best["id"], confidence="rb-incipit", candidates=[c["id"] for c in cands][:6])
        if best["id"] not in have:
            missing.add(best["id"])
    json.dump(matches, open(match_path, "w", encoding="utf8"), ensure_ascii=False, indent=0)
    print(f"{found} short responsories matched, {changed} changed; not yet in data/gabc:", file=sys.stderr)
    print(" ".join(str(i) for i in sorted(missing)))


if __name__ == "__main__":
    main()
