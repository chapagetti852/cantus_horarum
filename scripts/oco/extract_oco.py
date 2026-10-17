#!/usr/bin/env python3
"""Extract the Ordo Cantus Officii (editio cum cantu, antiphonale.net) PDF into
structured data.

The PDF is LuaTeX + Gregorio output, so its text layer is clean and every kind
of text is set in a distinct font / column:

  Aster-Reg 15.9 / Aster-Med 13.9 / Aster-RegIta 13.9 / Aster-Med 12.0  headings
  Aster-Med 10.0 at x < 110          day heading ("Dominica", "Die 21: S. Agnetis")
  Aster-Reg 10.0 at x < 100          hour label ("Laudes", "Off. lect.", "I Vesp.")
  Aster-Reg/Ita 10.0 at 115..135     position label ("1", "B", "M", "H", "R/ br.", "TP:")
  Aster-Reg 10.0 at x == 161.6       title line: plain text of the piece (may be cut
                                     at the right margin) -> starts a new entry
  spans just below the title, x>190  references: italic = scripture, roman = CAO; source
  Aster-Med 10.0 at 160..195         mode ("8g", "1f", "E", "per.")
  Aster-Reg 39.9                     the big initial letter
  Aster-Reg 10.0 elsewhere           lyric syllables under the neumes
  greciliae / greextra               the neumes themselves (ignored)
  CMR10                              page number of the Vatican 2015 edition

Usage: python3 scripts/oco/extract_oco.py sources/oco.pdf data/oco
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

import pymupdf

BODY_LAST_PAGE = 1212          # pages after this are indices (handled by extract_indices.py)
PART_NAMES = {"PROPRIUM DE TEMPORE", "PSALTERIUM", "PROPRIUM DE SANCTIS", "COMMUNIA", "OFFICIUM DEFUNCTORUM", "APPENDIX"}
X_HOUR = 100
X_POS_MIN, X_POS_MAX = 112, 140
X_TITLE_MIN, X_TITLE_MAX = 161.45, 161.8
X_MODE_MIN, X_MODE_MAX = 160, 200
RIGHT_MARGIN = 440             # a title span ending beyond this was probably cut off
SRC_RE = re.compile(r"^(CAO|AM|ARII|AR|PM|LHym|LH|OHS|GS|GR|RM|PRM|OCSO|Sol|Mil|OP|NR|AMS|HG|LU|LR|PCB|Trid|Cist|Wor|Hartker|CS|Rom)\s*(I{1,3}\s+)?([\dA-Za-z*,.\- ]*)$")


import unicodedata


def norm(t):
    t = re.sub(r"⟨[^⟩]*⟩", "", t)
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = t.replace("æ", "ae").replace("œ", "oe").replace("Æ", "Ae").replace("Œ", "Oe")
    t = re.sub(r"[^a-z ]", "", t.lower())
    return re.sub(r"\s+", " ", t).strip()


def spans_of(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"]
                if not t.strip():
                    continue
                x0, y0, x1, y1 = s["bbox"]
                out.append({"font": s["font"], "size": round(s["size"], 1), "x0": x0, "x1": x1,
                            "y0": y0, "y1": y1, "text": t})
    out.sort(key=lambda s: (round(s["y0"]), s["x0"]))
    return out


def is_neume(s):
    return "greciliae" in s["font"] or "greextra" in s["font"]


def join_syllables(syls):
    """Join lyric spans into words. Gregorio prints a hyphen when syllables of one
    word are spaced apart, and butts them together (no hyphen) when they touch."""
    words = []
    cur = ""
    prev = None
    for s in syls:
        t = s["text"]
        if prev is not None:
            same_line = abs(s["y0"] - prev["y0"]) < 3
            gap = s["x0"] - prev["x1"]
            if prev["text"].endswith("-"):
                pass  # continue word
            elif same_line and gap < 1.2:
                pass  # continue word (syllables touching)
            else:
                words.append(cur)
                cur = ""
        cur += t[:-1] if t.endswith("-") else t
        prev = s
    if cur:
        words.append(cur)
    text = " ".join(w for w in words if w)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    return text.strip()


class Extractor:
    def __init__(self, pdf_path):
        self.doc = pymupdf.open(pdf_path)
        self.entries = []
        self.ctx = {"part": None, "chapter": None, "sub": None, "group": None, "day": None,
                    "hour": None, "oco2015_page": None}
        self.pending_pos = None      # position label awaiting its entry
        self.pending_pos_y = -1
        self.pending_quals = []      # "TP:", "Vel:", "Pro pluribus sanctis:" ...
        self.pending_rubrics = []    # italic rubric paragraphs preceding the next entry
        self.cur = None              # entry being filled
        self.cur_syls = []
        self.hour_carry = None       # hour label wrapped over two lines ("Laudes &" / "Vesp.")
        self.qual_carry = None       # italic position label wrapped ("Pro pluri-" "bus san-" "ctis:")
        self.rubric_carry = []

    def awaiting_initial(self):
        return self.cur is not None and self.cur.get("notated") and self.cur.get("initial") is None

    # ----- entry lifecycle -------------------------------------------------
    def close_entry(self):
        if self.cur is None:
            return
        e = self.cur
        text = join_syllables(self.cur_syls)
        if e.get("initial") and text:
            # the first syllable lacks its initial letter (set as a drop cap); when the
            # next syllable starts a new capitalised word the initial is a word by itself ("O Sapientia")
            init = e["initial"].replace("*", "")
            text = re.sub(r"^\*\s*", "", text)
            tnorm = norm(e.get("title") or "")
            separate = text[:1].isupper() or tnorm.startswith(init.lower() + " ")
            text = init + (" " if separate else "") + text
        text = text.replace("/greheightstar", "*").replace("\\greheightstar", "*")
        m = re.search(r"\s*E\s*u\s*o\s*u\s*a\s*e\.?\s*$", text)
        if m:
            e["euouae"] = True
            text = text[: m.start()]
        text = text.replace("Ƒ", "℣.").replace("Ɠ", "℟.")
        text = re.sub(r"(?<=[a-z])Ǽ(?=[a-z])", "œ́", text)   # œ́ has no precomposed code point; the font maps it here
        e["text"] = text.strip()
        if e.get("untitled") and text:
            e["title"] = " ".join(text.split()[:6])
        if (e.get("hour") or "").startswith("Inv") and e.get("mode"):
            e["kind"] = "invitatorium"
        if e.get("text") and e.get("title"):
            a = norm(e["title"]).replace(" ", "")
            b = norm(e["text"]).replace(" ", "")
            e["text_matches_title"] = bool(a) and (b.startswith(a) or a.startswith(b) or a[:12] == b[:12])
        if not e.get("text") and not e.get("mode"):
            e["kind"] = e.get("kind") or "reference"
        else:
            e["kind"] = e.get("kind") or ("hymn" if e.get("position") == "H" else "chant")
        self.entries.append(e)
        self.cur = None
        self.cur_syls = []

    REFLIKE = re.compile(r"(\bCAO\b|\b(AM|ARII|AR|PM|LHym|RM|OHS|GS|GR|Sol|Mil|OCSO|PRM|OP|NR)\b|\d)")

    def open_entry(self, page_no, title_spans):
        self.close_entry()
        refs = [s for s in title_spans[1:] if s["x0"] > 270 and (s["font"] == "Aster-RegIta" or self.REFLIKE.search(s["text"]))]
        title_spans = [s for s in title_spans if s not in refs]
        title = " ".join(s["text"].strip() for s in title_spans)
        title = re.sub(r"\s+", " ", title).strip()
        e = {"id": len(self.entries) + 1, "page": page_no, **{k: v for k, v in self.ctx.items()},
             "position": self.pending_pos, "qualifiers": list(self.pending_quals),
             "rubrics": list(self.pending_rubrics), "title": title,
             "title_truncated": title_spans[-1]["x1"] > RIGHT_MARGIN,
             "scripture": None, "cao": None, "sources": [], "mode": None, "initial": None}
        pos = e["position"] or ""
        if pos == "H" or "(LHym" in title:
            e["kind"] = "hymn"
            m = re.search(r"\((LHym|LH)\s*([\d\-, ]+[a-z]?)\)", title)
            if m:
                e["lhym"] = m.group(2).strip()
        elif pos.startswith("Ɠ") or pos.startswith("℟"):
            e["kind"] = "resp_brevis"
            e["position"] = "R br."
        y = title_spans[0]["y0"]
        e["notated"] = e.get("kind") != "hymn" and (any(y + 10 < n["y0"] < y + 52 for n in self.neumes) or (y > 555 and self.next_neumes_top))
        self.cur = e
        self.cur_page = page_no
        self.cur_syls = []
        self.pending_pos = None
        self.pending_quals = []
        self.pending_rubrics = []
        self.title_y = title_spans[0]["y0"]
        for r in refs:
            self.add_ref(r)

    def add_ref(self, s):
        t = s["text"].strip().strip(";").strip().replace("Ƒ", "℣.").replace("Ɠ", "℟.")
        if not t:
            return
        if s["font"] == "Aster-RegIta":
            self.cur["scripture"] = ((self.cur["scripture"] or "") + " " + t).strip()
            return
        for part in re.split(r";\s*", t):
            part = part.strip()
            if not part:
                continue
            m = re.match(r"^CAO\s*(\d{4,6}[a-z]?)$", part)
            if m:
                self.cur["cao"] = m.group(1)
                continue
            if part in ("℟.", "℣.", "cf.", "cf") or re.match(r"^(℟|℣)\.?\s", part):
                self.cur["scripture"] = ((self.cur["scripture"] or "") + " " + part).strip()
                continue
            m = re.match(r"^([A-Za-z]+)\s*(I{1,3}\b)?\s*(.*)$", part)
            if m:
                self.cur["sources"].append({"sigla": m.group(1) + (" " + m.group(2) if m.group(2) else ""),
                                            "ref": m.group(3).strip()})
            else:
                self.cur["sources"].append({"sigla": "?", "ref": part})

    # ----- page walk ---------------------------------------------------------
    def run(self):
        n = min(BODY_LAST_PAGE, self.doc.page_count)
        cache = [None] * (n + 1)
        for pno in range(n):
            if cache[pno] is None:
                cache[pno] = spans_of(self.doc[pno])
            if pno + 1 < n and cache[pno + 1] is None:
                cache[pno + 1] = spans_of(self.doc[pno + 1])
            self.page(pno + 1, cache[pno], cache[pno + 1] if pno + 1 < n else ())
            cache[pno] = None
        self.close_entry()
        return self.entries

    def has_neumes_near(self, y0, y1, x0=0, x1=1000):
        return any(n["y1"] > y0 and n["y0"] < y1 and n["x1"] > x0 and n["x0"] < x1 for n in self.neumes)

    def lyric_line(self, y):
        """A text line is a lyric line when neumes sit 18..52pt above it."""
        return any(y - 52 < n["y0"] < y - 18 for n in self.neumes)

    def page(self, page_no, spans, next_spans=()):
        self.neumes = [s for s in spans if is_neume(s)]
        self.next_neumes_top = any(is_neume(s) and s["y0"] < 160 for s in next_spans)
        spans = [s for s in spans if not is_neume(s)]
        # running heads: section name + page number on the top line
        spans = [s for s in spans if not (s["y0"] < 60 and s["size"] <= 10.5)]
        i = 0
        while i < len(spans):
            s = spans[i]
            f, sz, x, y, t = s["font"], s["size"], s["x0"], s["y0"], s["text"].strip()
            if f == "CMR10" or f == "CMMI10":
                if t.isdigit():
                    self.ctx["oco2015_page"] = int(t)
                i += 1
                continue
            # the drop-cap initial of the open entry ----------------------------
            if sz > 20 and len(t) <= 2 and self.cur is not None:
                if self.cur.get("initial") is not None:
                    # a second drop cap inside one entry means a title line was missed
                    self.open_entry(page_no, [{"text": "", "x0": x, "x1": x, "y0": y, "font": f}])
                    self.cur["untitled"] = True
                self.cur["initial"] = t
                i += 1
                continue
            # headings ---------------------------------------------------------
            if sz > 10.5:
                self.close_entry()
                if sz >= 15 or t in PART_NAMES:
                    self.ctx.update(part=t, chapter=None, sub=None, group=None, day=None, hour=None)
                elif f == "Aster-Med" and sz >= 13:
                    # chapter ("I. TEMPUS ADVENTUS") or sub-chapter ("A. USQUE AD ...")
                    if re.match(r"^[A-Z]\. ", t):
                        self.ctx.update(sub=t, group=None, day=None, hour=None)
                    else:
                        self.ctx.update(chapter=t, sub=None, group=None, day=None, hour=None)
                elif f == "Aster-RegIta" and sz >= 13:
                    self.ctx.update(sub=t, group=None, day=None, hour=None)
                elif sz >= 11.5:
                    self.ctx.update(group=t, day=None, hour=None)
                i += 1
                continue
            # day heading (bold, left column) --------------------------------
            if f == "Aster-Med" and x < 110:
                on_staff = self.awaiting_initial()   # a day label printed on the staff line of the open entry
                if not on_staff:
                    self.close_entry()
                line = [s]
                j = i + 1
                while j < len(spans) and abs(spans[j]["y0"] - y) < 3 and spans[j]["x0"] < 300 \
                        and (spans[j]["font"] == "Aster-Med" or spans[j]["font"] == "Aster-RegIta" or (spans[j]["x0"] > 100 and spans[j]["x0"] < 112)):
                    line.append(spans[j])
                    j += 1
                # an italic "Vel:" immediately left of the heading introduces an alternative memorial
                vel = [z for z in line if z["font"] == "Aster-RegIta" and z["text"].strip().lower().startswith("vel")]
                line = [z for z in line if z not in vel]
                day = " ".join(z["text"].strip() for z in line)
                if vel:
                    self.day_prefix = "Vel:"
                day = re.sub(r"\s+", " ", day).replace("S.", "S. ").replace("S.  ", "S. ").strip()
                if getattr(self, "day_prefix", None):
                    day = self.day_prefix + " " + day
                    self.day_prefix = None
                self.ctx.update(day=day, hour=None)
                if on_staff:
                    self.cur["day"] = day
                i = j
                continue
            # left column: hour labels and rubric paragraphs ------------------
            if x < X_HOUR:
                line = [s]
                j = i + 1
                while j < len(spans) and abs(spans[j]["y0"] - y) < 3 and spans[j]["x0"] < X_HOUR:
                    line.append(spans[j])
                    j += 1
                txt = re.sub(r"\s+", " ", " ".join(z["text"].strip() for z in line)).strip()
                # a full-width italic paragraph starting at the left margin is a rubric
                is_para = f == "Aster-RegIta" and (len(txt) > 24 or (j < len(spans) and abs(spans[j]["y0"] - y) < 3))
                if is_para:
                    para = txt
                    k = j
                    while k < len(spans) and abs(spans[k]["y0"] - y) < 3:
                        para += " " + spans[k]["text"].strip()
                        k += 1
                    self.pending_rubrics.append(re.sub(r"\s+", " ", para).strip())
                    i = k
                    continue
                if f == "Aster-RegIta":
                    if j < len(spans) and spans[j]["font"] == "Aster-Med" and spans[j]["x0"] < 110 and abs(spans[j]["y0"] - y) < 3:
                        self.day_prefix = txt          # "Vel:" introducing an alternative memorial
                    else:
                        self.pending_quals.append(txt)   # "Vel:" etc.
                    i = j
                    continue
                if self.hour_carry:
                    txt = self.hour_carry + " " + txt
                    self.hour_carry = None
                if txt.endswith("&") or txt in ("I & II", "Laudes &"):
                    self.hour_carry = txt
                elif self.awaiting_initial():
                    self.ctx["hour"] = txt
                    self.cur["hour"] = txt
                else:
                    self.close_entry()
                    self.ctx["hour"] = txt
                i = j
                continue
            # position label column ------------------------------------------
            if X_POS_MIN <= x <= X_POS_MAX and sz <= 10.5:
                if f == "Aster-RegIta":
                    # possibly wrapped over several lines: "Pro pluri-" "bus san-" "ctis:"
                    frag = t
                    if self.qual_carry is not None:
                        frag = self.qual_carry + ("" if self.qual_carry.endswith("-") else " ") + t
                        frag = frag.replace("- ", "").replace("-", "") if frag.endswith(":") else frag
                    if frag.endswith(":") or frag.endswith(".") or frag.lower().startswith("vel"):
                        self.qual_carry = None
                        self.pending_quals.append(frag.replace("- ", ""))
                    else:
                        self.qual_carry = frag
                else:
                    if self.awaiting_initial():
                        # label printed on the staff line, after the title: belongs to the open entry
                        self.cur["position"] = t if not self.cur.get("position") else (self.cur["position"] + " " + t)
                    else:
                        self.pending_pos = t if self.pending_pos is None else self.pending_pos + " " + t
                        self.pending_pos_y = y
                i += 1
                continue
            # title line -----------------------------------------------------
            if f in ("Aster-Reg", "Aster-RegIta") and sz <= 10.5 and X_TITLE_MIN <= x <= X_TITLE_MAX \
                    and (s["x1"] - x > 45 or not self.lyric_line(y)):
                line = [s]
                j = i + 1
                while j < len(spans) and abs(spans[j]["y0"] - y) < 1.5:
                    line.append(spans[j])
                    j += 1
                if f == "Aster-RegIta":
                    txt = re.sub(r"\s+", " ", " ".join(z["text"] for z in line)).strip()
                    if self.pending_pos is not None and abs(y - self.pending_pos_y) < 3:
                        # "H  Ut in hebd." : a cross-reference standing in for the piece
                        self.open_entry(page_no, line)
                        self.cur["kind"] = "reference"
                        self.cur["notated"] = False
                    else:
                        # italic rubric at the text column ("Quando officium dicitur noctu...")
                        self.close_entry()
                        self.pending_rubrics.append(txt)
                    i = j
                    continue
                self.open_entry(page_no, line)
                i = j
                continue
            if self.cur is None:
                # stray text (e.g. a rubric continuation); keep as rubric
                self.pending_rubrics.append(t)
                i += 1
                continue
            # references just below the title --------------------------------
            if self.cur.get("initial") is None and x > 185 and f != "Aster-Med" and (
                    (self.cur_page == page_no and 1.5 < y - self.title_y < 30)
                    or (self.cur_page == page_no - 1 and self.title_y > 555 and y < 130)):
                self.add_ref(s)
                i += 1
                continue
            # mode -------------------------------------------------------------
            if f == "Aster-Med" and X_MODE_MIN <= x <= X_MODE_MAX and self.cur.get("mode") is None:
                self.cur["mode"] = t
                i += 1
                continue
            # initial ------------------------------------------------------------
            if sz > 20:
                self.cur["initial"] = t
                i += 1
                continue
            # a reference fragment printed after the initial (long title pushed it down)
            if not self.cur_syls and x > 150 and self.cur.get("notated") and (
                    f == "Aster-RegIta" or re.search(r"\d|\bCAO\b|^cf\.?$", t)):
                self.add_ref(s)
                i += 1
                continue
            # lyrics -----------------------------------------------------------
            if not self.cur.get("notated") and self.cur.get("initial") is None:
                # text after a non-notated entry (cross-reference, hymn incipit) is a stray label or rubric
                if y - self.title_y > 3 or self.cur_page != page_no:
                    self.pending_rubrics.append(t)
                else:
                    self.cur["title"] = (self.cur["title"] + " " + t).strip()
                i += 1
                continue
            if f == "Aster-RegIta" and (re.match(r"^T\.?\s?[PQAN]\.?:?$", t) or len(t) > 4):
                # inline markers such as "T.P." (Easter addition follows) or a short rubric
                self.cur_syls.append({**s, "text": "⟨" + t + "⟩"})
            else:
                self.cur_syls.append(s)
            i += 1


def to_markdown(entries):
    out = ["# Ordo Cantus Officii (editio cum cantu, v.6 2026) — extracted text", ""]
    last = {}
    for e in entries:
        for k in ("part", "chapter", "sub", "group", "day"):
            if e.get(k) and e[k] != last.get(k):
                level = {"part": 2, "chapter": 3, "sub": 4, "group": 5, "day": 6}[k]
                out.append("#" * level + " " + e[k])
                out.append("")
                for kk in list(last):
                    pass
            last[k] = e.get(k)
        for r in e.get("rubrics", []):
            out.append(f"> _{r}_")
            out.append("")
        head = " · ".join(x for x in [e.get("hour"), e.get("position"), " ".join(e.get("qualifiers", []))] if x)
        ref = "; ".join(x for x in [e.get("scripture"), f"CAO {e['cao']}" if e.get("cao") else None,
                                     *(f"{sr['sigla']} {sr['ref']}".strip() for sr in e.get("sources", []))] if x)
        mode = f" **{e['mode']}**" if e.get("mode") else ""
        text = e.get("text") or e.get("title")
        out.append(f"- [{e['id']}] p.{e['page']} {head}{mode}: {text}" + (f"  \n  _{ref}_" if ref else ""))
    return "\n".join(out) + "\n"


def main():
    pdf = sys.argv[1] if len(sys.argv) > 1 else "sources/oco.pdf"
    outdir = Path(sys.argv[2] if len(sys.argv) > 2 else "data/oco")
    outdir.mkdir(parents=True, exist_ok=True)
    ex = Extractor(pdf)
    entries = ex.run()
    (outdir / "oco.json").write_text(json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf8")
    Path("docs").mkdir(exist_ok=True)
    Path("docs/oco.md").write_text(to_markdown(entries), encoding="utf8")
    kinds = Counter(e["kind"] for e in entries)
    print(f"{len(entries)} entries: {dict(kinds)}")
    print("text/title mismatches:", sum(1 for e in entries if e.get("text_matches_title") is False),
          " untitled:", sum(1 for e in entries if e.get("untitled")))
    print("with mode:", sum(1 for e in entries if e.get("mode")), " with CAO:", sum(1 for e in entries if e.get("cao")),
          " truncated titles:", sum(1 for e in entries if e.get("title_truncated")),
          " empty text with mode:", sum(1 for e in entries if e.get("mode") and not e.get("text")))


if __name__ == "__main__":
    main()
