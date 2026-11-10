#!/usr/bin/env python3
"""Scores for the responsories of the Office of Readings.

The Office of Readings follows each reading with a responsory proper to the day (iBreviary
gives its text). GregoBase has most of them: above all the Nocturnale Romanum (Hartker,
2002; source 23), which sets the responsories of the Liturgia Horarum, then the Liber
Hymnarius, the Antiphonale Monasticum 2005, Antiphonæ et Responsoria, the Antiphonale
Monasticum 1934, the Liber Usualis, the Liber Antiphonarius and Hartker's antiphoners.

For every responsory (part "re") on GregoBase this reads the words of its response and of
its verse from the GABC and keeps their first words, in a spelling that levels the books'
habits (cælum / cœlum, Jerusalem / Hierusalem, charitas, quotidie, nunquam, doubled letters:
`fuzzy` here, `fuzzyWords` in site/responsoria.js, the same rules). The app takes the score
whose response and verse begin as iBreviary's do. Writes data/oco/responsoria-prolixa.json:
[[id, response words, verse words], ...] in the books' order of preference (those above, then
the other books, then transcriptions that cite none), and copies the scores into data/gabc.
The Dominican Graduale (source 14) is left out: its "responsoria" are the graduals of Mass.

Usage: python3 scripts/oco/match_responsoria_prolixa.py <gregobase gabc cache dir>
(the cache from scripts/gregobase/import_dump.py, or any directory of <id>.gabc)
"""
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# books in order of preference
BOOKS = [23, 15, 17, 18, 19, 61, 62, 63, 64, 67, 7, 3, 48, 59, 60]
R_WORDS, V_WORDS = 6, 4
NOT_OFFICE = {14}  # Graduale O.P.: graduals


def plain(t):
    t = unicodedata.normalize("NFD", t or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    t = t.replace("æ", "ae").replace("œ", "oe").replace("j", "i")
    return re.sub(r"[^a-z ]+", " ", t).split()


def fuzzy(t):
    """Words in a levelled spelling, as fuzzyWords in site/responsoria.js."""
    t = unicodedata.normalize("NFD", t or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    t = t.replace("æ", "e").replace("œ", "e").replace("ae", "e").replace("oe", "e")
    t = t.replace("j", "i").replace("y", "i").replace("ph", "f").replace("h", "").replace("v", "u")
    t = re.sub(r"[^a-z ]+", " ", t)
    t = re.sub(r"(.)\1+", r"\1", t)
    t = re.sub(r"ti(?=[aeou])", "ci", t).replace("mqu", "nqu").replace("quoti", "coti")
    return [w for w in t.split() if w != "aleluia"]


def lyrics(body):
    """The sung words of a GABC body: syllables joined into words, signs and notes left out."""
    t = re.sub(r"<sp>[^<]*</sp>\.?|<v>[^<]*</v>", " | ", body)  # ℣, ℟ and the like: a break
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"\([^)]*\)", "", t)  # the notes: syllables of a word stay joined
    t = t.replace("{", "").replace("}", "")  # the centring marks of some transcriptions
    t = re.sub(r"[*+†]", " ", t)
    return t


def split_rv(body):
    """The response (up to the verse) and the verse."""
    m = re.search(r"<sp>V/</sp>", body)
    if not m:
        return lyrics(body), ""
    rest = body[m.end():]
    end = re.search(r"<sp>(V|R)/</sp>|Gl[óo]\(", rest)  # the verse ends at the next sign or the Gloria
    return lyrics(body[:m.start()]), lyrics(rest[:end.start()] if end else rest)


def main():
    cache = Path(sys.argv[1])
    chants = json.load(open(ROOT / "data/gregobase/chants.json", encoding="utf8"))
    rank = {b: i for i, b in enumerate(BOOKS)}
    cands = []
    for c in chants:
        if c.get("part") != "re" or not c.get("has_gabc") or c.get("duplicateof"):
            continue
        if any(s in NOT_OFFICE for s, _ in c["sources"]):
            continue
        books = [s for s, _ in c["sources"] if s in rank]
        # the other books after those preferred; transcriptions that cite no book yet last
        cands.append((min(rank[b] for b in books) if books else len(BOOKS) + (0 if c["sources"] else 1), c["id"]))
    cands.sort()
    out, seen, missing = [], set(), 0
    gabc_dir = ROOT / "data/gabc"
    for _, cid in cands:
        src = cache / f"{cid}.gabc"
        if not src.exists():
            src = gabc_dir / f"{cid}.gabc"
        if not src.exists():
            missing += 1
            continue
        txt = src.read_text(encoding="utf8", errors="replace")
        body = re.split(r"^%%\s*$", txt, flags=re.M)[-1]
        r, v = split_rv(body)
        rw, vw = fuzzy(r)[:R_WORDS], fuzzy(v)[:V_WORDS]
        if len(rw) < 4 or len(vw) < 3:
            continue
        key = (" ".join(rw), " ".join(vw))
        if key in seen:  # the same responsory in a book further down
            continue
        seen.add(key)
        out.append([cid, key[0], key[1]])
        if not (gabc_dir / f"{cid}.gabc").exists():
            shutil.copyfile(src, gabc_dir / f"{cid}.gabc")
    path = ROOT / "data/oco/responsoria-prolixa.json"
    path.write_text("[\n" + ",\n".join(json.dumps(x, ensure_ascii=False) for x in out) + "\n]\n", encoding="utf8")
    print(f"{len(out)} responsories ({missing} without a GABC at hand) -> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
