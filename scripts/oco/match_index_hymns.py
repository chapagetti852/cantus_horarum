#!/usr/bin/env python3
"""Scores for the hymns the OCO names only in its index (the common of pastors, the hymns
of Lent, the small hours' variants...), which have no entry with a score in its body.

For each such index row: the GregoBase score of the Liber Hymnarius (source 15) on the
page the index cites, the incipit deciding; a page with several forms of one hymn chooses
by the row's own qualifier ("(fer.)", "(mem.)", "(fest.)", "(dom.)", "(soll.)"); the
pastors' hymns keep their three forms (pro Papa, pro Episcopo, pro Presbytero) for the app
to choose by the saint. Without one on the page, the same hymn a page or two away (the
second part of a hymn printed again), else the same incipit in the Antiphonale Romanum II
(source 6) or the Liber Usualis (source 3).

Writes data/oco/index-hymns.json: {"<incipit>|<page>": id or {"papa", "episcopus", "presbyter"}};
prints the ids not yet in data/gabc (fetch them with scripts/gregobase/fetch_gabc.sh).

Usage: python3 scripts/oco/match_index_hymns.py
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def norm(t):
    t = unicodedata.normalize("NFD", t or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    t = t.replace("æ", "ae").replace("œ", "oe").replace("j", "i").replace("v", "u")
    return re.sub(r"[^a-z ]+", " ", t).split()


def page_no(p):
    m = re.match(r"\d+", str(p or ""))
    return int(m.group(0)) if m else None


# the row's qualifier -> the words GregoBase gives the same form
QUALIFIER = {"fer.": "feriis", "mem.": "memoriis", "fest.": "festis", "dom.": "dominicis", "soll.": "sollemnitatibus|solemnitatibus"}
# rows GregoBase has no score of: the second part of the Stabat mater (it has the sequence
# whole, p. 434, or its first part)
SKIP = {"Stabat mater 2"}
ORDERS = {"papa": "papa", "episcopus": "episcopo", "presbyter": "resbytero"}  # "Pro resbytero" is spelt so once


def main():
    index = json.load(open(ROOT / "data/oco/indices.json", encoding="utf8"))["hymni"]
    oco = json.load(open(ROOT / "data/oco/oco.json", encoding="utf8"))
    matches = {m["oco_id"]: m for m in json.load(open(ROOT / "data/oco/gregobase-match.json", encoding="utf8"))}
    chants = json.load(open(ROOT / "data/gregobase/chants.json", encoding="utf8"))
    scored_pages = set()
    for e in oco:
        if e.get("kind") == "hymn" and e.get("lhym") and (matches.get(e["id"]) or {}).get("gregobase"):
            scored_pages.add(page_no(e["lhym"]))
    hymns = [c for c in chants if c.get("has_gabc") and c.get("part") in ("hy", None)]
    on = lambda book: [(c, page_no(p)) for c in hymns for s, p in c["sources"] if s == book]
    lh, arii, lu = on(15), on(6), on(3)
    have = {p.stem for p in (ROOT / "data/gabc").glob("*.gabc")}
    out, missing, unmatched = {}, set(), []
    for row in index:
        page = page_no(row.get("lhym"))
        if page is None or page in scored_pages:
            continue
        if row["incipit"] in SKIP:
            unmatched.append(row["incipit"])
            continue
        qual = (re.search(r"\((fer|mem|fest|dom|soll)\.\)", row["incipit"]) or [None, None])[1]
        inc = norm(re.sub(r"\(.*?\)|\s\d+$|….*$", "", row["incipit"]))[:3]
        after = norm(row["incipit"].split("…")[1]) if "…" in row["incipit"] else []  # "Pange lingua… prœlium"
        def same(c, inc=inc, after=after):
            w = norm(re.sub(r"\(.*?\)|\[.*?\]", "", c["incipit"]).replace("...", " "))
            n = min(len(inc), len(w))
            if n < 2 or w[:n] != inc[:n]:
                return False
            return not after or any(x.replace("oe", "e").replace("ae", "e") == after[0].replace("oe", "e").replace("ae", "e") for x in w)
        cands = [c for c, p in lh if p == page and same(c)]
        if qual and len(cands) > 1:
            cands = [c for c in cands if re.search(QUALIFIER[qual + "."], c["incipit"], re.I)] or cands
        if not cands:
            cands = [c for c, p in lh if p and abs(p - page) <= 2 and same(c) and not re.search(r"\b1\b", c["incipit"])]
        if not cands:
            # another book's hymn of that incipit, unless it is marked for another day ("(T. Nativitatis)")
            plain = lambda c: "(" not in c["incipit"]
            cands = [c for c, _ in arii if same(c) and plain(c)] or [c for c, _ in lu if same(c) and plain(c)]
        if not cands:
            unmatched.append(row["incipit"])
            continue
        key = f"{row['incipit']}|{row['lhym']}"
        forms = {o: c["id"] for o, w in ORDERS.items() for c in cands if re.search(w, c["incipit"], re.I)}
        if len(forms) == 3:
            out[key] = forms
        else:
            out[key] = sorted(cands, key=lambda c: (bool(re.search(r"\(", c["incipit"])) and not qual, c["id"]))[0]["id"]
        for i in (forms.values() if len(forms) == 3 else [out[key]]):
            if str(i) not in have:
                missing.add(i)
    path = ROOT / "data/oco/index-hymns.json"
    json.dump(out, open(path, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"{len(out)} index hymns matched, {len(unmatched)} without a score: {'; '.join(unmatched)}")
    print("not yet in data/gabc:", " ".join(str(i) for i in sorted(missing)))


if __name__ == "__main__":
    main()
