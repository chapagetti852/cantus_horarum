#!/usr/bin/env python3
"""Read the notation of the Ordo Cantus Officii back into GABC.

The OCO (sources/oco.pdf) was typeset with Gregorio: every note is a glyph of the
greciliae font (Gregorio 6.0.0) placed on drawn staff lines, the lyrics are Aster text
under the staff. The embedded font keeps Gregorio's private-use code points, and the
release font names them (CClef, Punctum, PesOneNothing, TorculusTwoOneNothing …),
names that spell each neume's shape and intervals. So for each piece:

  staff lines (drawings) -> step size and the bottom line;
  glyph origin -> pitch (a note's centre lies a fixed distance above its origin);
  glyph name -> the neume's notes (intervals One..Five), liquescence, bars, clef;
  lyric characters -> syllables (split at hyphens and spaces), the initial in front;
  each syllable takes the notes from the one nearest its centre up to the next
  syllable's first note.

Pieces are told apart by their initials and lined up with the OCO entries of the
page (data/oco/oco.json) in order, checking the opening words. Output: one GABC file
per entry, data/gabc-oco/<oco id>.gabc.

Usage: python3 scripts/oco/read_notation.py sources/oco.pdf data/oco/gregorio-glyphs.json [first-last pages]
  data/oco/gregorio-glyphs.json: glyph names by code point (scripts/oco/greciliae_names.py).
"""
import io
import json
import re
import sys
import unicodedata
from pathlib import Path

import fitz  # pymupdf
from fontTools.ttLib import TTFont

NUM = {"One": 1, "Two": 2, "Three": 3, "Four": 4, "Five": 5}
NOTE_CENTRE = 66.5 / 1000  # a note head's centre above the glyph origin, in em
PITCH = "abcdefghijklm"


def nums(s):
    return [NUM[w] for w in re.findall(r"One|Two|Three|Four|Five", s)]


def decode(name):
    """A glyph name -> (kind, data). kind: notes | clef | bar | flat | natural | skip."""
    if name in ("CClef", "CClefChange"):
        return "clef", "c"
    if name in ("FClef", "FClefChange"):
        return "clef", "f"
    if name.startswith(("DivisioMaiorDottedBacking", "Custos", "HEpisema", "Bracket", "Linea")):
        return "skip", None
    if name.startswith("DivisioMinima"):
        return "bar", ","
    if name.startswith("DivisioMinor"):
        return "bar", ";"
    if name.startswith("DivisioMaior"):
        return "bar", ":"
    if name.startswith("Virgula"):
        return "bar", "`"
    if name.startswith("Flat"):
        return "flat", None
    if name.startswith("Natural"):
        return "natural", None
    if name.startswith("Sharp"):
        return "skip", None
    liq = ""
    if "Deminutus" in name:
        liq = "~"
    elif name.endswith("Ascendens") and not name.startswith("Ascendens"):
        liq = "<"
    elif name.endswith("Descendens") and not name.startswith("Descendens"):
        liq = ">"
    debilis = "InitioDebilis" in name
    core = re.sub(r"(Nothing|Deminutus|Ascendens|Descendens|InitioDebilis|Longqueue|Openqueue|Nobar|\.\w+)", "", name)
    n = nums(core)
    fam = re.sub(r"(One|Two|Three|Four|Five|Up|Down|LineBL|LineTR)", "", core)
    # (relative pitch, modifier) per note
    if fam in ("Punctum", "LeadingPunctum", "UpperPunctum", "PunctumAuctus"):
        notes = [(0, "")]
    elif fam in ("PunctumInclinatum", "DescendensPunctumInclinatum", "AscendensPunctumInclinatum"):
        notes = [(0, "I")]
    elif fam == "Virga":
        notes = [(0, "v")]
    elif fam == "VirgaReversa":
        notes = [(0, "V")]
    elif fam in ("Quilisma",):
        notes = [(0, "w")]
    elif fam in ("Stropha", "StrophaAucta", "StrophaAuctaLongtail"):
        notes = [(0, "s")]
    elif fam in ("DescendensOriscus", "AscendensOriscus", "Oriscus", "LeadingOriscus", "UpperOblatusAscendensOriscus"):
        notes = [(0, "o")]
    elif fam in ("Pes", "PesQuadratum") and n:
        notes = [(0, ""), (n[0], "")]
    elif fam in ("PesQuassus", "UpperPesQuassus") and n:
        notes = [(0, "o"), (n[0], "")]
    elif fam in ("QuilismaPes", "QuilismaPesQuadratum") and n:
        notes = [(0, "w"), (n[0], "")]
    elif fam in ("Flexus",) and n:
        notes = [(0, ""), (-n[0], "")]
    elif fam in ("FlexusOriscus", "FlexusOriscusInusitatus") and n:
        notes = [(0, "o"), (-n[0], "")]
    elif fam in ("Torculus", "TorculusLiquescens") and len(n) >= 2:
        notes = [(0, ""), (n[0], ""), (n[0] - n[1], "")]
    elif fam == "TorculusQuilisma" and len(n) >= 2:
        notes = [(0, "w"), (n[0], ""), (n[0] - n[1], "")]
    elif fam == "TorculusResupinus" and len(n) >= 3:
        notes = [(0, ""), (n[0], ""), (n[0] - n[1], ""), (n[0] - n[1] + n[2], "")]
    elif fam == "TorculusResupinusQuilisma" and len(n) >= 3:
        notes = [(0, "w"), (n[0], ""), (n[0] - n[1], ""), (n[0] - n[1] + n[2], "")]
    elif fam == "Porrectus" and len(n) >= 2:
        notes = [(0, ""), (-n[0], ""), (-n[0] + n[1], "")]
    elif fam == "PorrectusFlexus" and len(n) >= 3:
        notes = [(0, ""), (-n[0], ""), (-n[0] + n[1], ""), (-n[0] + n[1] - n[2], "")]
    elif fam == "Scandicus" and len(n) >= 2:
        notes = [(0, ""), (n[0], ""), (n[0] + n[1], "")]
    elif fam == "Salicus" and len(n) >= 2:
        notes = [(0, ""), (n[0], "o"), (n[0] + n[1], "")]
    elif fam == "Ancus" and len(n) >= 2:
        notes = [(0, ""), (-n[0], "I"), (-n[0] - n[1], "I")]
    else:
        return "unknown", name
    return "notes", {"notes": notes, "liq": liq, "debilis": debilis}


def letter(pos, upper=False):
    if pos < 0 or pos >= len(PITCH):
        pos = max(0, min(len(PITCH) - 1, pos))
    c = PITCH[pos]
    return c.upper() if upper else c


class Page:
    def __init__(self, doc, pno, names):
        self.p = doc[pno]
        self.pno = pno + 1
        self.names = names
        self.fonts = {}
        for f in self.p.get_fonts():
            if "greciliae" in f[3] or "greextra" in f[3]:
                _, _, _, buf = doc.extract_font(f[0])
                order = TTFont(io.BytesIO(buf)).getGlyphOrder()
                self.fonts[f[3].split("+")[-1]] = order

    def glyph_name(self, font, ch):
        order = self.fonts.get(font)
        if not order or ord(ch) >= len(order):
            return None
        nm = order[ord(ch)]
        if nm.startswith("uni"):
            return self.names.get(font, {}).get(hex(int(nm[3:], 16)), nm)
        return nm

    def staves(self):
        """Groups of four (or five) horizontal staff lines: [{'lines': [y…], 'x0', 'x1'}]."""
        hs = []
        for d in self.p.get_drawings():
            for it in d["items"]:
                if it[0] == "l" and abs(it[1].y - it[2].y) < 0.1 and abs(it[2].x - it[1].x) > 40:
                    hs.append((round(it[1].y, 2), min(it[1].x, it[2].x), max(it[1].x, it[2].x)))
        hs.sort()
        out, cur = [], []
        for y, x0, x1 in hs:
            if cur and (y - cur[-1][0] > 12 or abs(x1 - cur[-1][2]) > 2):
                out.append(cur)
                cur = []
            cur.append((y, x0, x1))
        if cur:
            out.append(cur)
        staves = []
        for g in out:
            if len(g) < 4:
                continue
            ys = [y for y, _, _ in g]
            staves.append({"lines": ys, "x0": min(x for _, x, _ in g), "x1": max(x for _, _, x in g),
                           "step": (ys[-1] - ys[0]) / (len(ys) - 1) / 2})
        return staves

    def chars(self):
        out = []
        k = 0
        for b in self.p.get_text("rawdict")["blocks"]:
            for l in b.get("lines", []):
                for s in l["spans"]:
                    k += 1  # each lyric syllable is a span of its own
                    for c in s["chars"]:
                        out.append({"c": c["c"], "x": c["origin"][0], "y": c["origin"][1], "bbox": c["bbox"],
                                    "font": s["font"], "size": s["size"], "span": k})
        return out


def read_page(doc, pno, names):
    pg = Page(doc, pno, names)
    staves = pg.staves()
    chars = pg.chars()
    def nearest_staff(c):
        """The staff a glyph belongs to: the one whose middle is nearest (systems can be close)."""
        cands = [t for t in staves if t["lines"][0] - 30 < c["y"] < t["lines"][-1] + 25 and t["x0"] - 25 < c["x"] < t["x1"] + 5]
        return min(cands, key=lambda t: abs(c["y"] - (t["lines"][0] + t["lines"][-1]) / 2)) if cands else None

    systems = []
    for i, st in enumerate(staves):
        top, bottom = st["lines"][0], st["lines"][-1]
        nxt = staves[i + 1]["lines"][0] if i + 1 < len(staves) else bottom + 60
        lyric_lo, lyric_hi = bottom + 4, min(nxt - 8, bottom + 26)
        glyphs, lyrics, initial, annotation = [], [], None, None
        for c in chars:
            if c["font"] in ("greciliae", "greextra"):
                name = pg.glyph_name(c["font"], c["c"])
                if c["font"] == "greciliae" and nearest_staff(c) is st and st["x0"] - 25 < c["x"] < st["x1"] + 5:
                    glyphs.append({"name": name, "x": c["x"], "y": c["y"], "size": c["size"], "w": c["bbox"][2] - c["bbox"][0]})
                elif c["font"] == "greextra" and lyric_lo < c["y"] < lyric_hi and st["x0"] - 60 < c["x"] < st["x1"] + 5:
                    sym = {"StarHeight": "*", "StarSix": "*", "RBar": "<sp>R/</sp>", "VBar": "<sp>V/</sp>"}.get((name or "").split(".")[0])
                    if sym:
                        lyrics.append({"c": sym, "x": c["x"], "x1": c["bbox"][2], "size": 10, "sym": True})
            elif c["font"].startswith("Aster"):
                if c["size"] > 20 and top - 10 < c["y"] < bottom + 30 and c["x"] < st["x0"] + 2:
                    initial = c["c"]
                elif lyric_lo < c["y"] < lyric_hi and st["x0"] - 60 < c["x"] < st["x1"] + 5 and c["size"] < 14:
                    lyrics.append({"c": c["c"], "x": c["x"], "x1": c["bbox"][2], "size": c["size"], "span": c["span"], "y": c["y"]})
                elif c["font"] == "Aster-Med" and top - 22 < c["y"] < top and c["x"] < st["x0"] + 30:
                    annotation = (annotation or "") + c["c"]
        glyphs.sort(key=lambda g: g["x"])
        # the lyric line is the commonest baseline in the band (not a rubric or the next title)
        if lyrics:
            from collections import Counter
            base = Counter(round(c.get("y", 0)) for c in lyrics if not c.get("sym")).most_common(1)
            if base:
                b0 = base[0][0]
                lyrics = [c for c in lyrics if c.get("sym") or abs(c.get("y", b0) - b0) <= 3]
        lyrics.sort(key=lambda c: c["x"])
        systems.append({"staff": st, "glyphs": glyphs, "lyrics": lyrics, "initial": initial,
                        "annotation": annotation, "y": top})
    return systems


SIGNS = {"Ƒ": "<sp>V/</sp>", "Ʀ": "<sp>R/</sp>", "Ɍ": "<sp>R/</sp>", "*": "*"}


def syllables(lyrics, initial):
    """Lyric spans -> [{'text', 'x0', 'x1', 'word_start', 'sym'}]. Gregorio sets each syllable
    as a span of its own; a hyphen at its end, or a next syllable touching it, means the
    word goes on."""
    spans = []
    for c in lyrics:
        if spans and c.get("span") == spans[-1]["span"] and not c.get("sym"):
            spans[-1]["chars"].append(c)
        else:
            spans.append({"span": c.get("span"), "chars": [c], "sym": c.get("sym", False)})
    out = []
    joined = False
    for sp in spans:
        text = "".join(c["c"] for c in sp["chars"])
        hyphen = text.endswith("-")
        text = text.rstrip("-").strip()
        x0, x1 = sp["chars"][0]["x"], sp["chars"][-1]["x1"]
        if not text:
            continue
        sym = sp["sym"] or text in SIGNS
        if text in SIGNS:
            text = SIGNS[text]
        touching = out and x0 - out[-1]["x1"] < 0.6 and not out[-1]["sym"] and not sym
        # the vowel's centre: Gregorio sets a syllable's vowel under its first note
        vow = [c for c in sp["chars"] if re.match(r"[aeiouyáéíóúýæǽœëAEIOUYÁÉÍÓÚÆŒ]", c["c"])]
        vx = ((vow[0]["x"] + vow[0]["x1"]) / 2) if vow else (x0 + x1) / 2
        if vow and len(vow) > 1 and vow[1]["x"] - vow[0]["x1"] < 0.5:  # diphthong
            vx = (vow[0]["x"] + vow[1]["x1"]) / 2
        out.append({"text": text, "x0": x0, "x1": x1, "vx": vx, "word_start": not (joined or touching), "sym": sym})
        joined = hyphen
    # the PDF's text boxes sometimes break after the vowel: "Li|ngua", "Sa|ncto". A word-inner
    # syllable that begins n/m/r/l + consonant gives that letter back (Lin-gua, San-cto)
    for a, b in zip(out, out[1:]):
        if b["word_start"] or a["sym"] or b["sym"]:
            continue
        m = re.match(r"([nmrl])([bcdfghjklmnpqrstvwxz])", b["text"], re.I)
        if m and re.search(r"[aeiouyáéíóúýæǽœ]$", a["text"], re.I):
            a["text"] += m.group(1)
            b["text"] = b["text"][1:]
    if initial and out:
        first = out[0]["text"]
        V = "aeiouyáéíóúýæǽœAEIOUYÁÉÍÓÚÆŒ"
        if first[0].isupper():
            # "O Adonai": the initial is a word of its own
            out.insert(0, {"text": initial, "x0": out[0]["x0"] - 1, "x1": out[0]["x0"] - 1, "vx": -1e9,
                           "word_start": True, "sym": False})
        elif initial in V and first[0] not in V and any(ch in V for ch in first):
            # U-nus, A-ve: the initial is a syllable of its own, sung on the first note
            out.insert(0, {"text": initial, "x0": out[0]["x0"] - 1, "x1": out[0]["x0"] - 1, "vx": -1e9,
                           "word_start": True, "sym": False})
            out[1]["word_start"] = False
        else:
            out[0]["text"] = initial + first
    return out


def system_gabc(sys_, clef_hint):
    st = sys_["staff"]
    bottom, step = st["lines"][-1], st["step"]
    nlines = len(st["lines"])
    elems, clef = [], clef_hint
    flat_next = None
    for g in sys_["glyphs"]:
        kind, data = decode(g["name"] or "")
        centre = g["y"] - NOTE_CENTRE * g["size"]
        pos = 3 + round((bottom - centre) / step)  # 'd' = bottom line
        if kind == "clef":
            # the clef glyph's centre is its line (one step above the note convention)
            line = round((bottom - (centre - step)) / step / 2) + 1
            clef = f"{data}{max(1, min(nlines, line))}"
            if elems or clef_hint is None:
                elems.append({"x": g["x"], "clef": clef})
            continue
        if kind == "flat":
            flat_next = letter(pos) + "x"
            continue
        if kind == "natural":
            flat_next = letter(pos) + "y"
            continue
        if kind == "bar":
            elems.append({"x": g["x"], "bar": data, "w": g["w"]})
            continue
        if kind != "notes":
            continue
        s = ""
        for k, (rel, mod) in enumerate(data["notes"]):
            p = pos + rel
            if mod == "I":
                s += letter(p, True)
            else:
                s += letter(p) + mod.replace("V", "V")
        if data["debilis"]:
            s = "-" + s
        s += data["liq"]
        if flat_next:
            s = flat_next + s
            flat_next = None
        elems.append({"x": g["x"], "w": g["w"], "notes": s})
    # two major bars close together = final double bar
    merged = []
    for e in elems:
        if merged and e.get("bar") == ":" and merged[-1].get("bar") in (":", "::") and e["x"] - merged[-1]["x"] < 6:
            merged[-1]["bar"] = "::"
            continue
        merged.append(e)
    return merged, clef


def piece_gabc(systems):
    """Systems of one piece -> GABC body."""
    out = []
    clef = None
    for si, sys_ in enumerate(systems):
        elems, clef = system_gabc(sys_, clef if si else None)
        syls = syllables(sys_["lyrics"], sys_["initial"] if si == 0 else None)
        if si == 0:
            out.append(f"({clef})")
        # the asterisk stands where it is printed: an empty syllable there
        for sy in syls:
            if sy["text"] == "*":
                elems.append({"x": sy["x0"], "star": True, "w": 0})
        elems.sort(key=lambda e: e["x"])
        notes_idx = [i for i, e in enumerate(elems) if "notes" in e]
        # each text syllable's first note: the note nearest its centre, after the previous one's
        texts_for, last, pending = {}, -1, ""
        for sy in syls:
            if sy["sym"] or not re.search(r"\w", sy["text"]):
                if sy["text"].startswith("<sp>"):
                    pending += sy["text"] + ". "
                continue
            centre = sy.get("vx", (sy["x0"] + sy["x1"]) / 2)
            cand = [i for i in notes_idx if i > last]
            if not cand:
                continue
            if si == 0 and last == -1:
                best = cand[0]  # the first syllable (after the initial) begins with the first note
            else:
                best = min(cand, key=lambda i: abs(elems[i]["x"] + elems[i]["w"] / 2 - centre))
            texts_for[best] = (pending + sy["text"], sy["word_start"] or bool(pending))
            pending = ""
            last = best
        pieces, cur = [], None
        for i, e in enumerate(elems):
            if i in texts_for:
                if cur:
                    pieces.append(cur)
                text, ws = texts_for[i]
                cur = {"text": text, "ws": ws, "notes": [e["notes"]]}
            elif "notes" in e:
                if cur is None:
                    cur = {"text": "", "ws": True, "notes": []}
                cur["notes"].append(e["notes"])
            else:
                if cur:
                    pieces.append(cur)
                    cur = None
                if e.get("star"):
                    pieces.append({"text": "*", "ws": True, "bar": ""})
                elif "bar" in e:
                    pieces.append({"text": "", "ws": True, "bar": e["bar"]})
                elif "clef" in e and i > 0:
                    pieces.append({"text": "", "ws": True, "bar": e["clef"]})
        if cur:
            pieces.append(cur)
        for pc in pieces:
            if "bar" in pc:
                out.append(f" {pc['text']}({pc['bar']})")
            else:
                out.append(f"{' ' if pc['ws'] else ''}{pc['text']}({'/'.join(pc['notes'])})")
    return re.sub(r"\s+", " ", "".join(out)).strip()


def norm(t):
    t = unicodedata.normalize("NFD", t or "")
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower().replace("æ", "ae").replace("œ", "oe").replace("j", "i")
    return re.sub(r"[^a-z]+", "", t)


def lyrics_of(body):
    return norm(re.sub(r"\([^)]*\)|<[^>]+>|\\\w+", "", body))


def main():
    pdf, names_path = sys.argv[1], sys.argv[2]
    pages = None
    if len(sys.argv) > 3:
        a, _, b = sys.argv[3].partition("-")
        pages = range(int(a), int(b or a) + 1)
    names = json.load(open(names_path))
    doc = fitz.open(pdf)
    oco = json.load(open("data/oco/oco.json", encoding="utf8"))
    notated = [e for e in oco if e.get("kind") in ("chant", "invitatorium", "resp_brevis") and e.get("title")]
    by_page = {}
    for e in notated:
        by_page.setdefault(e["page"], []).append(e)
    outdir = Path("data/gabc-oco")
    outdir.mkdir(parents=True, exist_ok=True)
    report = {"pieces": 0, "matched": 0, "unmatched": []}
    # pieces start at an initial; systems without one continue the piece before,
    # also over a page break
    pieces = []
    for pno in (pages or range(1, 1213)):
        for s in read_page(doc, pno - 1, names):
            if s["initial"]:
                pieces.append({"page": pno, "systems": [s], "annotation": s["annotation"]})
            elif pieces:
                pieces[-1]["systems"].append(s)
    taken = set()
    for pc in pieces:
        body = piece_gabc(pc["systems"])
        report["pieces"] += 1
        words = lyrics_of(body)
        best = None
        # the entry of this page (or the next or previous: a piece may start at the foot of
        # a page) whose words the piece begins with
        for tries in ((pc["page"],), (pc["page"] + 1, pc["page"] - 1)):
            for pg_ in tries:
                for e in by_page.get(pg_, []):
                    if e["id"] in taken:
                        continue
                    for t in (norm(e.get("text") or ""), norm(e["title"])):
                        k = min(12, len(t), len(words))
                        if k >= 6 and words[:k] == t[:k]:
                            best = e
                            break
                    if best:
                        break
                if best:
                    break
            if best:
                break
        if best is None:
            report["unmatched"].append({"page": pc["page"], "start": words[:40]})
            continue
        taken.add(best["id"])
        report["matched"] += 1
        head = (f"name:{best['title'].split('*')[0].strip()};\noffice-part:{best.get('kind')};\nmode:{best.get('mode') or ''};\n"
                f"annotation:{pc['annotation'] or best.get('mode') or ''};\nbook:Ordo Cantus Officii, p. {pc['page']};\noco-id:{best['id']};\n%%\n")
        (outdir / f"{best['id']}.gabc").write_text(head + body + "\n", encoding="utf8")
    json.dump(report, open(outdir / "_report.json", "w"), ensure_ascii=False, indent=1)
    print(f"{report['pieces']} pieces read, {report['matched']} lined up with OCO entries, {len(report['unmatched'])} not", file=sys.stderr)


if __name__ == "__main__":
    main()
