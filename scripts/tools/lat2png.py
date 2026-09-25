"""Render a projected scene dump to a PNG.

Reads the JSON written by scripts/tools/shot.ts: {"w","h","faces":[{"p","c","o"}]}
where `p` is a space-separated list of "x,y" screen points.

IMPORTANT: the faces come out of projectScene ALREADY back-to-front. Drawing them
in the order given is what produces occlusion; sorting them again (by screen Y,
say) destroys it and every ship comes out looking like debris.

    python3 scripts/tools/lat2png.py in.json out.png
"""
import json, re, sys
from PIL import Image, ImageDraw


def parse_col(c):
    c = c.strip()
    if c.startswith("#"):
        h = c[1:]
        if len(h) == 3:
            h = "".join(ch * 2 for ch in h)
        if len(h) == 8:
            h = h[:6]
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    m = re.findall(r"[\d.]+", c)
    if len(m) >= 3:
        return tuple(int(float(v)) for v in m[:3])
    return (200, 200, 200)


def render(path, out, background=(5, 9, 15)):
    d = json.load(open(path))
    img = Image.new("RGB", (d["w"], d["h"]), background)
    dr = ImageDraw.Draw(img, "RGBA")
    for f in d["faces"]:
        pts = []
        for pair in f["p"].split():
            x, y = pair.split(",")
            pts.append((float(x), float(y)))
        if len(pts) < 3:
            continue
        col = parse_col(f["c"]) + (int(255 * float(f.get("o", 1))),)
        dr.polygon(pts, fill=col)
    img.save(out)
    return out


if __name__ == "__main__":
    render(sys.argv[1], sys.argv[2])
