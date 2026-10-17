#!/usr/bin/env python3
"""Top up data/gregobase/chants.json from GregoBase's live book listings
(source.php?id=N): the public SQL dump (GitHub, last updated January 2024) lacks the
scores added since. Each listing row gives the page, the genre (usage-marker class)
and the chant id; chants already indexed gain the source, new ones are added with
version "live".

Usage: python3 scripts/gregobase/scrape_sources.py data/gregobase/chants.json 15 17 18 19 6 53 61 62 63 64 67
"""
import html
import json
import re
import subprocess
import sys
import time


def fetch(url):
    return subprocess.run(["curl", "-sfL", url], capture_output=True, text=True).stdout


def main():
    path = sys.argv[1]
    chants = json.load(open(path, encoding="utf8"))
    by_id = {c["id"]: c for c in chants}
    added = gained = 0
    for sid in map(int, sys.argv[2:]):
        page_html = fetch(f"https://gregobase.selapa.net/source.php?id={sid}")
        rows = re.findall(r"<tr><td>([^<]*)</td><td><ul class=\"incipit\">(.*?)</ul>", page_html, re.S)
        n = 0
        for page, items in rows:
            for part, cid, inc in re.findall(r'usage-marker (\w*)"><a href="chant\.php\?id=(\d+)">(.*?)</a>', items, re.S):
                cid = int(cid)
                inc = html.unescape(re.sub(r"<[^>]+>", "", inc)).strip()
                c = by_id.get(cid)
                if c is None:
                    c = {"id": cid, "incipit": inc, "part": part or None, "mode": None, "mode_var": None,
                         "version": "live", "cantusid": None, "commentary": None, "sources": [], "tags": [],
                         "has_gabc": True, "duplicateof": None}
                    chants.append(c)
                    by_id[cid] = c
                    added += 1
                if [sid, page.strip()] not in [list(x) for x in c["sources"]]:
                    c["sources"].append([sid, page.strip()])
                    gained += 1
                n += 1
        print(f"source {sid}: {n} chants listed", file=sys.stderr)
        time.sleep(1)
    chants.sort(key=lambda c: c["id"])
    json.dump(chants, open(path, "w", encoding="utf8"), ensure_ascii=False)
    print(f"{added} chants added, {gained} sources added", file=sys.stderr)


if __name__ == "__main__":
    main()
