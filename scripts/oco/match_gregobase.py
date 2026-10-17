#!/usr/bin/env python3
"""Match every notated OCO entry to a GregoBase chant.

Strategy, in order of confidence:
  1. source+page+incipit  the OCO cites a book and page (AM 215, ARII 450, PM 31,
                          LHym 4 ...); GregoBase indexes its transcriptions by the
                          same books and pages, so look there and confirm the incipit.
  2. incipit+mode         same first words and the same mode anywhere in GregoBase,
                          preferring modern Solesmes books.
  3. incipit              same first words, any mode (flagged for review).

Usage: python3 scripts/oco/match_gregobase.py data/oco/oco.json data/gregobase/chants.json data/oco/gregobase-match.json
"""
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict

# OCO sigla -> GregoBase source ids (see data/gregobase/sources.json)
SIGLA = {
    "AM": [17, 18, 19],      # Antiphonale monasticum I-III (2005-2007)
    "ARII": [6],             # Antiphonale Romanum II (2009)
    "ARI": [53],             # Antiphonale Romanum I (2020)
    "AR": [9],               # Antiphonale Romanum (1912)
    "PM": [24],              # Psalterium Monasticum (1981)
    "LHym": [15],            # Liber Hymnarius (1983)
    "GS": [8],               # Graduale simplex (1975)
    "GR": [4, 2],            # Graduale Romanum (1974, 1961)
    "NR": [23],              # Nocturnale Romanum (2002)
    "OP": [11, 12, 13],      # Dominican books
    "HG": [27, 28, 29],      # Les Heures Grégoriennes
    "LU": [3],
}
MODERN = {6, 17, 18, 19, 24, 15, 53, 27, 28, 29, 23}


def norm(t):
    t = re.sub(r"⟨[^⟩]*⟩", "", t or "")
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = t.lower().replace("æ", "e").replace("œ", "e").replace("ae", "e").replace("oe", "e")
    t = t.replace("j", "i").replace("v", "u").replace("y", "i").replace("ph", "f").replace("h", "")
    t = re.sub(r"[^a-z ]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def words(t, n):
    return " ".join(norm(t).split()[:n])


def mode_key(m):
    """'8g' -> '8', '2*a' -> '2', 'per.' -> 'per', 'E' -> 'E'."""
    if not m:
        return None
    m = m.strip()
    d = re.match(r"^(\d)", m)
    return d.group(1) if d else m.rstrip(".")


def gb_mode_key(c):
    m = (c.get("mode") or "").strip()
    d = re.match(r"^(\d)", m)
    return d.group(1) if d else (m or None)


def main():
    oco = json.load(open(sys.argv[1], encoding="utf8"))
    chants = json.load(open(sys.argv[2], encoding="utf8"))
    out_path = sys.argv[3]
    by_source_page = defaultdict(list)
    by_incipit = defaultdict(list)
    for c in chants:
        if not c["has_gabc"]:
            continue
        for sid, page in c["sources"]:
            by_source_page[(sid, re.sub(r"\s+", "", page or ""))].append(c)
        full = norm(c["incipit"])
        if full:
            by_incipit[full].append(c)

    results = []
    stats = Counter()
    for e in oco:
        is_hymn = e["kind"] == "hymn" and e.get("lhym")
        if not is_hymn and (e["kind"] not in ("chant", "invitatorium", "resp_brevis") or not e.get("mode")):
            continue
        if is_hymn:
            # hymns: Liber Hymnarius page + incipit (GregoBase source 15), else incipit among hymns
            title = re.sub(r"\(.*?\)", "", e["title"]).strip()
            rec = {"oco_id": e["id"], "page": e["page"], "incipit": title, "mode": None, "gregobase": None, "confidence": None, "candidates": []}
            ntitle = norm(title)
            page = e["lhym"].split()[0].rstrip(",")
            cands = [c for c in by_source_page.get((15, page), []) if ntitle and (norm(c["incipit"]).startswith(" ".join(ntitle.split()[:2])) or ntitle.startswith(" ".join(norm(c["incipit"]).split()[:2])))]
            if cands:
                rec.update(gregobase=cands[0]["id"], confidence="lhym+incipit", candidates=[c["id"] for c in cands])
            else:
                hits = [c for c in by_incipit.get(ntitle, []) + sum((by_incipit.get(" ".join(ntitle.split()[:n]), []) for n in (3, 2)), []) if c["part"] == "hy"]
                if hits:
                    best = sorted(hits, key=lambda c: (not any(s[0] == 15 for s in c["sources"]), c["id"]))[0]
                    rec.update(gregobase=best["id"], confidence="hymn-incipit", candidates=[c["id"] for c in hits][:8])
            stats[rec["confidence"] or "hymn-unmatched"] += 1
            results.append(rec)
            continue
        text = e.get("text") or e.get("title") or ""
        key3, key4 = words(text, 3), words(text, 4)
        mk = mode_key(e.get("mode"))
        rec = {"oco_id": e["id"], "page": e["page"], "incipit": " ".join(text.split()[:6]), "mode": e.get("mode"),
               "gregobase": None, "confidence": None, "candidates": []}

        ntext = norm(text)

        def incipit_ok(c):
            ci = norm(c["incipit"])
            if not ci or not ntext:
                return False
            return ntext.startswith(ci) or ci.startswith(key3) or (len(ci.split()) >= 2 and key3.startswith(" ".join(ci.split()[:3])))

        def incipit_lookup():
            """Every GregoBase chant whose whole incipit is a prefix of our text (longest first)."""
            ws = ntext.split()
            hits = []
            for n in range(min(7, len(ws)), 0, -1):
                hits.extend(by_incipit.get(" ".join(ws[:n]), []))
            return hits

        # 0. antiphonale.net's own transcriptions of the OCO texts (GregoBase version "Verona")
        if not rec["gregobase"]:
            hits = [c for c in incipit_lookup() if c["version"] == "Verona" and (c["part"] in ("an", "rb", "in", None, "") or e["kind"] != "chant")]
            same_mode = [c for c in hits if gb_mode_key(c) == mk]
            pool = same_mode or hits
            if pool:
                # prefer the fullest incipit match
                best = sorted(pool, key=lambda c: (-len(norm(c["incipit"])), c["id"]))[0]
                rec.update(gregobase=best["id"], confidence="verona" if same_mode else "verona-mode?", candidates=[c["id"] for c in pool][:12])
        # 1. source + page
        for src in e.get("sources", []):
            if rec["gregobase"]:
                break
            sids = SIGLA.get(src["sigla"].split()[0])
            if not sids:
                continue
            page = re.sub(r"\s+", "", src["ref"]).rstrip(";")
            for sid in sids:
                cands = [c for c in by_source_page.get((sid, page), []) if incipit_ok(c)]
                if not cands and page.isdigit():
                    # the piece may spill from the previous page
                    cands = [c for c in by_source_page.get((sid, str(int(page) - 1)), []) if incipit_ok(c)]
                if cands:
                    best = sorted(cands, key=lambda c: (gb_mode_key(c) != mk, c["id"]))[0]
                    rec.update(gregobase=best["id"], confidence="source+incipit", candidates=[c["id"] for c in cands])
                    break
            if rec["gregobase"]:
                break
        # 2./3. incipit search
        if not rec["gregobase"] and key3:
            hits = incipit_lookup()
            cands = [c for c in hits if c["part"] in ("an", "rb", "in", None, "") or e["kind"] != "chant"] or hits
            same_mode = [c for c in cands if gb_mode_key(c) == mk]
            pool = same_mode or cands
            if pool:
                best = sorted(pool, key=lambda c: (not any(s[0] in MODERN for s in c["sources"]), c["id"]))[0]
                rec.update(gregobase=best["id"], confidence="incipit+mode" if same_mode else "incipit",
                           candidates=[c["id"] for c in pool][:12])
        stats[rec["confidence"] or "unmatched"] += 1
        results.append(rec)
    json.dump(results, open(out_path, "w", encoding="utf8"), ensure_ascii=False, indent=0)
    print(f"{len(results)} notated entries:", dict(stats))
    print("unmatched sample:", [(r["oco_id"], r["incipit"], r["mode"]) for r in results if not r["gregobase"]][:25])


if __name__ == "__main__":
    main()
