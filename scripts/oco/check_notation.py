#!/usr/bin/env python3
"""Compare the notation read from the OCO (data/gabc-oco) with the GregoBase scores the
entries are matched to (data/gabc), note by note: the pitch sequence (shapes, bars and
the E u o u a e left aside) and the syllables. Prints the agreement and the worst cases.

Usage: python3 scripts/oco/check_notation.py [confidence-prefix, e.g. verona]
"""
import difflib
import json
import re
import sys
from pathlib import Path


def body(path):
    t = Path(path).read_text(encoding="utf8", errors="replace").split("%%")[-1]
    t = re.sub(r"<alt>.*?</alt>", "", t)
    t = re.split(r"\bE\s*\([^)]*\)\s*u\s*\([^)]*\)\s*o\s*\(", t)[0]  # drop the E u o u a e
    return t


def pitches(t):
    notes = re.findall(r"\(([^)]*)\)", t)
    seq = []
    for n in notes:
        n = re.sub(r"\[[^\]]*\]", "", n)
        if re.fullmatch(r"\s*[cf]b?[1-5]\s*", n):
            continue
        n = re.sub(r"[a-mA-M][xy#]", "", n)  # accidentals are not notes
        # a bivirga or di/tristropha writes one letter for each repeated stroke: fvv, fss, fsss
        n = re.sub(r"([a-mA-M])([vs]{2,3})", lambda m: (m.group(1) + m.group(2)[0]) * len(m.group(2)), n)
        seq += [c.lower() for c in n if c.lower() in "abcdefghijklm"]
    return "".join(seq)


def syllable_count(t):
    return len([n for n in re.findall(r"([^\s()]*)\(([^)]*)\)", t) if re.search(r"[a-m]", n[1], re.I) and re.search(r"\w", n[0])])


def main():
    prefix = sys.argv[1] if len(sys.argv) > 1 else ""
    m = {x["oco_id"]: x for x in json.load(open("data/oco/gregobase-match.json", encoding="utf8"))}
    total = exact = 0
    ratios, worst = [], []
    for f in sorted(Path("data/gabc-oco").glob("*.gabc")):
        oid = int(f.stem)
        x = m.get(oid)
        if not x or not x.get("gregobase") or not str(x.get("confidence", "")).startswith(prefix):
            continue
        g = Path(f"data/gabc/{x['gregobase']}.gabc")
        if not g.exists():
            continue
        a, b = pitches(body(f)), pitches(body(g))
        if not b:
            continue
        total += 1
        r = difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()
        ratios.append(r)
        if a == b:
            exact += 1
        else:
            worst.append((r, oid, x["gregobase"], x.get("confidence"), a[:60], b[:60]))
    worst.sort()
    print(f"{total} pieces compared: {exact} identical in pitch ({exact / max(1, total):.1%}),"
          f" mean similarity {sum(ratios) / max(1, len(ratios)):.3f}")
    for w in worst[:25]:
        print(f"  {w[0]:.2f} oco {w[1]} gb {w[2]} ({w[3]})\n     oco: {w[4]}\n     gb : {w[5]}")


if __name__ == "__main__":
    main()
