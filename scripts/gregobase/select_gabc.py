#!/usr/bin/env python3
"""Copy the GABC files the site needs (every score an OCO entry points to, plus the
common tones) from the GregoBase cache into data/gabc/, which is committed so the
GitHub Actions build does not need the GregoBase dump.

Usage: python3 scripts/gregobase/select_gabc.py data/oco/gregobase-match.json cache/gregobase/gabc data/gabc
"""
import json
import shutil
import sys
from pathlib import Path

COMMON_TONES = [4121, 18178, 7864, 18107, 18108, 4321, 15303, 15301, 15302, 17847, 17848,
                18352, 18353, 18354, 18355, 18356, 18357, 18358, 18359, 18360, 18361, 18362, 18363, 18364, 18365, 18366,
                # invitatory psalm 94 (Liber Hymnarius tones II-VII, IV*, IV**, VI*, VI**, D, E)
                8218, 10397, 15508, 7669, 16356, 10248, 9664, 10035, 15059, 9834, 9707, 9642]


def main():
    match = json.load(open(sys.argv[1], encoding="utf8"))
    src = Path(sys.argv[2])
    dst = Path(sys.argv[3])
    dst.mkdir(parents=True, exist_ok=True)
    ids = {m["gregobase"] for m in match if m.get("gregobase")} | set(COMMON_TONES)
    keep = {f"{i}.gabc" for i in ids}
    for f in dst.glob("*.gabc"):
        if f.name not in keep:
            f.unlink()
    n = 0
    for i in sorted(ids):
        s = src / f"{i}.gabc"
        if s.exists():
            shutil.copyfile(s, dst / s.name)
            n += 1
    print(f"{n} gabc files in {dst} ({len(ids) - n} missing from the cache)")


if __name__ == "__main__":
    main()
