#!/usr/bin/env python3
"""Link the rows of the OCO's index of antiphons that have no entry of its body yet.

data/oco/indices.json gives every row the ids of the body's entries with that incipit
("oco_ids"); the app resolves the propers through them (site/resolve.js). Some rows were
left without: the index abbreviates ("Amen a. d. vobis Non Moyses" for "Amen, amen dico
vobis: Non Moyses"), skips words ("Lux perpetua… tuis et æternitas", "Simile est enim…
negotiatori"), begins a word later ("Clarificatus est" for "Nunc clarificatus est") or has a
slip of the pen ("In prasepio", "Simon loannis"). Without a link the Gospel antiphon of such
a Sunday or feast was not found at all. This fills the rows still empty, leaving the others
as they are: an entry is the row's when its title begins with the row's words (a letter or
two apart allowed in long words), the words after "…" following in order.

Usage: python3 scripts/oco/link_index.py   (rewrites data/oco/indices.json; prints what it linked)
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def words(t):
    t = unicodedata.normalize("NFD", t or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    t = t.replace("æ", "ae").replace("œ", "oe").replace("j", "i")
    return re.sub(r"[^a-z…]+", " ", t).split()


def close(a, b):
    """The same word, or a slip of one letter in a word of five or more."""
    if a == b:
        return True
    if min(len(a), len(b)) < 5 or abs(len(a) - len(b)) > 1:
        return False
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1] <= 1


def fits(row, title):
    """Does `title` (words) begin as the index row (words, "…" for words skipped)?"""
    head, _, tail = " ".join(row).partition("…")
    head, tail = head.split(), tail.replace("…", " ").split()
    if len(title) < len(head) or not all(close(a, b) for a, b in zip(head, title)):
        return False
    at = len(head)
    for w in tail:  # the words after the gap, in order
        at = next((k + 1 for k in range(at, len(title)) if close(w, title[k])), None)
        if at is None:
            return False
    return True


def candidates(incipit):
    w = words(incipit.replace("a. d.", "amen dico").replace("…", " … "))
    yield w
    if w[:2] == ["amen", "dico"]:
        yield ["amen"] + w                      # "Amen, amen dico vobis"
    if "…" in w and w.index("…") >= 3:
        yield w[:w.index("…") - 1] + w[w.index("…"):]   # the word before the gap is the index's own


def main():
    path = ROOT / "data/oco/indices.json"
    ind = json.load(open(path, encoding="utf8"))
    oco = json.load(open(ROOT / "data/oco/oco.json", encoding="utf8"))
    titles = [(e["id"], words(e.get("title")), words(e.get("text"))) for e in oco if e.get("kind") in ("chant", "invitatorium", "reference")]
    linked = 0
    for row in ind["antiphonae"]:
        if row.get("oco_ids") or row["incipit"].startswith("- cum"):
            continue
        ids = []
        for cand in candidates(row["incipit"]):
            ids = [i for i, t, x in titles if fits(cand, t) or fits(cand, x)]
            if ids:
                break
        if not ids:  # the index begins a word later than the chant
            cand = words(row["incipit"])
            if len(cand) >= 2 and "…" not in cand:
                ids = [i for i, t, x in titles if fits(cand, t[1:]) or fits(cand, x[1:])]
        if ids:
            row["oco_ids"] = ids
            linked += 1
            print(f'{row["tempus"]:10} {row["officium"]:4} {row["locus"]:10} {row["incipit"]} -> {ids}')
    path.write_text(json.dumps(ind, ensure_ascii=False, indent=1), encoding="utf8")
    left = [r["incipit"] for r in ind["antiphonae"] if not r.get("oco_ids") and not r["incipit"].startswith("- cum")]
    print(f"{linked} rows linked; still without: {'; '.join(left)}")


if __name__ == "__main__":
    main()
