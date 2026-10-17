#!/usr/bin/env python3
"""Turn the GregoBase MySQL dump (gregobase_online.sql from
https://github.com/gregorio-project/GregoBase, CC0) into JSON we can search.

Writes:
  data/gregobase/chants.json   one record per chant without the GABC body
                               (id, incipit, office-part, mode, mode_var, version,
                                cantusid, sources [[source_id, page], ...], tags)
  data/gregobase/sources.json  the source books (id, year, editor, title)
  <cache>/gabc/<id>.gabc       every GABC body, kept out of git (large); the
                               matcher copies the ones we use into data/gabc/

Usage: python3 scripts/gregobase/import_dump.py path/to/gregobase_online.sql data/gregobase cache/gregobase
"""
import json
import re
import sys
from pathlib import Path


def parse_values(body, i):
    rows = []
    n = len(body)
    while i < n:
        while i < n and body[i] in " \n\r\t,":
            i += 1
        if body[i] == ";":
            return rows, i + 1
        assert body[i] == "(", body[i:i + 40]
        i += 1
        row = []
        while True:
            c = body[i]
            if c == "'":
                i += 1
                s = []
                while True:
                    c = body[i]
                    if c == "\\":
                        s.append({"n": "\n", "r": "\r", "t": "\t", "0": "\0"}.get(body[i + 1], body[i + 1]))
                        i += 2
                    elif c == "'":
                        if body[i + 1] == "'":
                            s.append("'")
                            i += 2
                        else:
                            i += 1
                            break
                    else:
                        s.append(c)
                        i += 1
                row.append("".join(s))
            elif c in ", ":
                i += 1
            elif c == ")":
                i += 1
                break
            else:
                j = i
                while body[j] not in ",)":
                    j += 1
                v = body[i:j].strip()
                row.append(None if v == "NULL" else v)
                i = j
        rows.append(row)
    return rows, i


def table(txt, name):
    out = []
    for m in re.finditer(r"INSERT INTO `%s` \(([^)]*)\) VALUES" % re.escape(name), txt):
        cols = [c.strip("` ") for c in m.group(1).split(",")]
        rows, _ = parse_values(txt, m.end())
        out.extend(dict(zip(cols, r)) for r in rows)
    return out


def main():
    sql = Path(sys.argv[1])
    outdir = Path(sys.argv[2] if len(sys.argv) > 2 else "data/gregobase")
    cache = Path(sys.argv[3] if len(sys.argv) > 3 else "cache/gregobase")
    txt = sql.read_text(encoding="utf8", errors="replace")
    chants = table(txt, "gregobase_chants")
    chant_sources = table(txt, "gregobase_chant_sources")
    sources = table(txt, "gregobase_sources")
    tags = {t["id"]: t["tag"] for t in table(txt, "gregobase_tags")}
    chant_tags = table(txt, "gregobase_chant_tags")
    by_id = {}
    for c in chants:
        by_id[c["id"]] = {
            "id": int(c["id"]), "incipit": c["incipit"], "part": c["office-part"], "mode": c["mode"],
            "mode_var": c["mode_var"], "version": c["version"], "cantusid": c["cantusid"],
            "commentary": c["commentary"], "sources": [], "tags": [], "has_gabc": bool(c["gabc"]),
            "duplicateof": c["duplicateof"],
        }
    for s in chant_sources:
        if s["chant_id"] in by_id:
            by_id[s["chant_id"]]["sources"].append([int(s["source"]), s["page"]])
    for t in chant_tags:
        if t["chant_id"] in by_id and t["tag_id"] in tags:
            by_id[t["chant_id"]]["tags"].append(tags[t["tag_id"]])
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "chants.json").write_text(json.dumps(sorted(by_id.values(), key=lambda c: c["id"]), ensure_ascii=False), encoding="utf8")
    (outdir / "sources.json").write_text(json.dumps(
        [{"id": int(s["id"]), "year": s["year"] and int(s["year"]), "editor": s["editor"], "title": s["title"]} for s in sources],
        ensure_ascii=False, indent=1), encoding="utf8")
    gabc_dir = cache / "gabc"
    gabc_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    for c in chants:
        if c["gabc"] and c["gabc"].startswith('"'):
            # the dump stores the GABC body as a JSON string literal
            try:
                c["gabc"] = json.loads(c["gabc"])
            except json.JSONDecodeError:
                c["gabc"] = c["gabc"].strip('"').encode("utf8").decode("unicode_escape")
        if c["gabc"]:
            header = f"name:{c['incipit']};\noffice-part:{c['office-part'] or ''};\nmode:{c['mode'] or ''};\n"
            if c["mode_var"]:
                header += f"mode-modifier:{c['mode_var']};\n"
            header += f"gregobase:{c['id']};\n"
            (gabc_dir / f"{c['id']}.gabc").write_text(header + "%%\n" + c["gabc"].strip() + "\n", encoding="utf8")
            n += 1
    print(f"{len(by_id)} chants, {len(sources)} sources, {n} gabc files -> {gabc_dir}")


if __name__ == "__main__":
    main()
