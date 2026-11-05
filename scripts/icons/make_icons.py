#!/usr/bin/env python3
"""Make the app's icons from one drawing: a clivis and a punctum, falling down a four-line
staff, cream on a deep rubric red.

The drawing is on a 512 grid where 16 units are one pixel at 32 px: the staff lines are
then one pixel and the notes five, so the 32 px favicon (and the SVG on a 2x screen) is
crisp. At 16 px no scaling can be, so that size is drawn pixel by pixel.

Writes (site/ is copied to dist/ by the build):
  site/icon.svg                      favicon for browsers that take SVG; manifest "any"
  site/favicon.ico                   16 (hand drawn), 32, 48
  site/icons/apple-touch-icon.png    180, full bleed and opaque (iOS rounds the corners)
  site/icons/icon-192.png, -512.png  rounded corners, transparent outside ("any")
  site/icons/maskable-192.png, -512  full bleed for Android's masks (the notes sit well
                                     inside the 80 % safe circle)

Usage: python3 scripts/icons/make_icons.py   (needs Pillow, Node and Playwright)
"""
import io
import json
import struct
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
RED = "#a8261b"     # deep rubric red, calmer than the app's text rubric
CREAM = "#f8f0e1"   # parchment
LINE_OPACITY = 0.36


def mark():
    """Staff and notes on the 512 grid."""
    lines = "".join(f'<rect x="0" y="{y}" width="512" height="16" fill="{CREAM}" fill-opacity="{LINE_OPACITY}"/>'
                    for y in (144, 208, 272, 336))

    def note(x, y):
        # a punctum 80 x 80 with the slightly hollowed top and foot of the Solesmes punctum
        return f'<path fill="{CREAM}" d="M{x} {y} Q{x + 40} {y + 8} {x + 80} {y} V{y + 80} Q{x + 40} {y + 72} {x} {y + 80}Z"/>'

    # clivis: high note, then a step lower, its stem on the left of the first note down to
    # the foot of the second; then a punctum a step lower again
    stem = f'<rect x="112" y="144" width="16" height="144" fill="{CREAM}"/>'
    return lines + note(112, 144) + note(192, 208) + stem + note(304, 272)


def svg(rx):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
            f'<rect width="512" height="512" rx="{rx}" fill="{RED}"/>{mark()}</svg>\n')


def rgba(h, a=255):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (a,)


def favicon16():
    """The 16 px icon, pixel by pixel: the same staff (rows 4, 7, 10, 13) and notes (3 x 3)."""
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, 15, 15], radius=3, fill=rgba(RED))
    red, cream = rgba(RED), rgba(CREAM)
    line = tuple(round(red[i] * (1 - LINE_OPACITY) + cream[i] * LINE_OPACITY) for i in range(3)) + (255,)
    for y in (4, 7, 10, 13):
        d.line([(0, y), (15, y)], fill=line)
    d.rectangle([3, 4, 5, 6], fill=cream)
    d.rectangle([6, 7, 8, 9], fill=cream)
    d.line([(3, 4), (3, 9)], fill=cream)
    d.rectangle([10, 10, 12, 12], fill=cream)
    # keep the rounded corners transparent where the staff lines crossed them
    mask = Image.new("L", (16, 16), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, 15, 15], radius=3, fill=255)
    im.putalpha(mask)
    return im


def ico(images, path):
    """An ICO of PNG-compressed images (every current browser and Windows reads these)."""
    blobs = []
    for im in images:
        buf = io.BytesIO()
        im.save(buf, "PNG")
        blobs.append((im.size[0], buf.getvalue()))
    out = struct.pack("<HHH", 0, 1, len(blobs))
    offset = 6 + 16 * len(blobs)
    for size, data in blobs:
        out += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    path.write_bytes(out + b"".join(data for _, data in blobs))


def main():
    (SITE / "icons").mkdir(exist_ok=True)
    (SITE / "icon.svg").write_text(svg(112))
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "square.svg").write_text(svg(0))
        rounded, square = str(SITE / "icon.svg"), str(tmp / "square.svg")
        jobs = [
            {"svg": square, "size": 180, "out": str(SITE / "icons/apple-touch-icon.png")},
            {"svg": rounded, "size": 192, "out": str(SITE / "icons/icon-192.png")},
            {"svg": rounded, "size": 512, "out": str(SITE / "icons/icon-512.png")},
            {"svg": square, "size": 192, "out": str(SITE / "icons/maskable-192.png")},
            {"svg": square, "size": 512, "out": str(SITE / "icons/maskable-512.png")},
            {"svg": rounded, "size": 32, "out": str(tmp / "32.png")},
            {"svg": rounded, "size": 48, "out": str(tmp / "48.png")},
        ]
        (tmp / "jobs.json").write_text(json.dumps(jobs))
        subprocess.run(["node", str(ROOT / "scripts/icons/render.cjs"), str(tmp / "jobs.json")], check=True)
        # the apple-touch icon must be opaque
        apple = Image.open(SITE / "icons/apple-touch-icon.png").convert("RGB")
        apple.save(SITE / "icons/apple-touch-icon.png", optimize=True)
        for name in ("icon-192", "icon-512", "maskable-192", "maskable-512"):
            p = SITE / f"icons/{name}.png"
            Image.open(p).save(p, optimize=True)
        ico([favicon16(), Image.open(tmp / "32.png").convert("RGBA"), Image.open(tmp / "48.png").convert("RGBA")],
            SITE / "favicon.ico")
    for p in [SITE / "icon.svg", SITE / "favicon.ico", *sorted((SITE / "icons").iterdir())]:
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size} bytes")


if __name__ == "__main__":
    main()
