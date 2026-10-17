#!/usr/bin/env python3
"""Extract the three indices at the end of the Ordo Cantus Officii PDF:

  INDEX HYMNORUM            incipit | tempus/dies/festum | officium | LHym page
  INDEX ANTIPHONARUM        incipit | tempus/dies/festum | officium | locus
  INDEX RESPONSORIORUM BR.  incipit | tempus/dies/festum | officium

The codes are explained in the PDF's "Sigla in indicibus adhibita" (p. 1209-1212),
reproduced in docs/oco-sigla.md.

Usage: python3 scripts/oco/extract_indices.py sources/oco.pdf data/oco
"""
import json
import re
import sys
from pathlib import Path

import pymupdf

FIRST_INDEX_PAGE = 1213


def rows_of(page):
    spans = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if s["text"].strip():
                    x0, y0, x1, y1 = s["bbox"]
                    spans.append({"font": s["font"], "x0": x0, "x1": x1, "y": y0, "text": s["text"].strip()})
    spans.sort(key=lambda s: (s["y"], s["x0"]))
    rows = []
    for s in spans:
        if rows and abs(rows[-1][0]["y"] - s["y"]) < 2.5:
            rows[-1].append(s)
        else:
            rows.append([s])
    return rows


def main():
    pdf = sys.argv[1] if len(sys.argv) > 1 else "sources/oco.pdf"
    outdir = Path(sys.argv[2] if len(sys.argv) > 2 else "data/oco")
    doc = pymupdf.open(pdf)
    out = {"hymni": [], "antiphonae": [], "responsoria_brevia": []}
    current = None
    for pno in range(FIRST_INDEX_PAGE - 1, doc.page_count):
        for row in rows_of(doc[pno]):
            if row[0]["y"] < 60:            # running head
                continue
            text = " ".join(s["text"] for s in row)
            if text.startswith("INDEX HYMNORUM"):
                current = "hymni"; continue
            if text.startswith("INDEX ANTIPHONARUM"):
                current = "antiphonae"; continue
            if text.startswith("INDEX RESPONSORIORUM"):
                current = "responsoria_brevia"; continue
            if current is None or text in ("Tempus", "Dies", "Festum", "Festum Officium Locus", "Festum Officium LHym", "Festum Officium"):
                continue
            if all(s["font"] == "Aster-Reg" and s["x0"] > 200 for s in row):
                continue                     # column headings
            # a sub-heading such as "AD INVITATORIUM" (single bold/roman span, centred)
            if len(row) == 1 and row[0]["x0"] > 120:
                continue
            incipit = " ".join(s["text"] for s in row if s["x0"] < 240 and s["font"] == "Aster-Reg")
            tempus = " ".join(s["text"] for s in row if s["font"] == "Aster-Med")
            officium = " ".join(s["text"] for s in row if s["font"] == "Aster-RegIta")
            rest = [s for s in row if s["font"] == "Aster-Reg" and s["x0"] >= 240]
            locus = " ".join(s["text"] for s in rest)
            if not incipit:
                # continuation line (long "tempus" list wrapped): attach to previous
                if out[current] and (tempus or locus):
                    prev = out[current][-1]
                    prev["tempus"] = (prev["tempus"] + " " + tempus).strip()
                    key = "lhym" if current == "hymni" else "locus"
                    if key in prev:
                        prev[key] = (prev[key] + " " + locus).strip()
                continue
            incipit = re.sub(r"\s+", " ", incipit).replace("... ", "… ").strip()
            rec = {"incipit": incipit, "tempus": tempus, "officium": officium, "page": pno + 1}
            if current == "hymni":
                rec["lhym"] = locus
            elif current == "antiphonae":
                rec["locus"] = locus
            out[current].append(rec)
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "indices.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf8")
    for k, v in out.items():
        print(k, len(v), "rows; sample:", v[:2])


if __name__ == "__main__":
    main()
