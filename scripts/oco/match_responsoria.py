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

BOOKS = [17, 18, 19, 6, 53]  # AM I-III, AR II, AR I


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
        n = min(len(words), 4)
        cands = [c for c in rb if norm(c["incipit"])[:n] == words[:n]]
        if not cands and n > 2:
            cands = [c for c in rb if norm(c["incipit"])[:2] == words[:2]]
        if not cands:
            # no responsory score: better text than an antiphon with the same incipit
            m = by_oco.get(e["id"])
            if m and m.get("gregobase") and parts.get(m["gregobase"]) not in ("rb", "re"):
                m.update(gregobase=None, confidence="rb-none")
                changed += 1
            continue
        # the same incipit serves several responsories (other verse, alleluias): the text decides
        text = set(norm(e.get("text") or e.get("title")))
        if len(cands) > 1:
            cands = sorted(cands, key=lambda c: (-len(text & lyrics(c["id"])) + len(lyrics(c["id"]) - text) * 0.5, rank(c)))
        else:
            cands = sorted(cands, key=rank)
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
