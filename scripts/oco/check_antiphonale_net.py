#!/usr/bin/env python3
"""Cross-check our OCO -> GregoBase matches against antiphonale.net, whose pages
link every psalter / seasonal slot to a GregoBase chant with a slot code such as
1H11V1 (week 1, Sunday, I Vespers, antiphon 1) or 1H1LB (Lauds, Benedictus).

Usage: python3 scripts/oco/check_antiphonale_net.py data/oco/oco.json data/oco/gregobase-match.json data/antiphonale-net/links.json
"""
import json
import re
import sys

DAY = {"Dominica": "1", "Feria II": "2", "Feria III": "3", "Feria IV": "4", "Feria V": "5", "Feria VI": "6", "Sabbato": "7"}
HOUR = {"I Vesp.": "1V", "Off. lect.": "Ol", "Laudes": "L", "Hor. med.": "Hm", "II Vesp.": "2V", "Vesp.": "V", "Compl.": "C", "Inv.": "Inv"}
POS = {"1": "1", "2": "2", "3": "3", "B": "B", "M": "M", "Nunc": "N"}


def slot_code(e):
    m = re.match(r"HEBDOMADA (I|II|III|IV)$", e.get("chapter") or "")
    if not m or e.get("part") != "PSALTERIUM":
        return None
    week = {"I": 1, "II": 2, "III": 3, "IV": 4}[m.group(1)]
    day = DAY.get(e.get("day") or "")
    hour = HOUR.get(e.get("hour") or "")
    pos = POS.get((e.get("position") or "").split()[0] if e.get("position") else "")
    if not (day and hour):
        return None
    if hour in ("1V", "2V") and day == "1":
        return f"{week}H1{hour}{pos or ''}"
    return f"{week}H{day}{hour}{pos or ''}"


def main():
    oco = json.load(open(sys.argv[1], encoding="utf8"))
    match = {m["oco_id"]: m for m in json.load(open(sys.argv[2], encoding="utf8"))}
    links = json.load(open(sys.argv[3], encoding="utf8"))
    an = {}
    for r in links["psalterium"]:
        an.setdefault(r["code"], r["gregobase"])
    agree = disagree = missing = nolink = 0
    for e in oco:
        code = slot_code(e)
        if not code or e["kind"] not in ("chant", "invitatorium"):
            continue
        ours = match.get(e["id"], {}).get("gregobase")
        theirs = an.get(code)
        if theirs is None:
            nolink += 1
            continue
        if ours is None:
            missing += 1
            print(f"  MISSING  {code:9} oco#{e['id']} p{e['page']} {e['title'][:40]!r} -> antiphonale.net {theirs}")
        elif ours == theirs:
            agree += 1
        else:
            disagree += 1
            print(f"  DIFF     {code:9} oco#{e['id']} p{e['page']} {e['title'][:40]!r} ours {ours} ({match[e['id']]['confidence']}) theirs {theirs}")
    print(f"psalter slots: agree {agree}, disagree {disagree}, ours missing {missing}, no antiphonale.net link {nolink}")


if __name__ == "__main__":
    main()
