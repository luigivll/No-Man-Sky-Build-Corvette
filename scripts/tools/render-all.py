"""Render every scene dump in a directory to PNG.

    python3 scripts/tools/render-all.py [jsonDir] [pngDir]

Also writes a contact sheet (contact-sheet.png) so all 21 can be judged at once.
"""
import glob, os, sys, tempfile
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lat2png import render  # noqa: E402

json_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "iconics")
png_dir = sys.argv[2] if len(sys.argv) > 2 else "docs/img/iconics"
os.makedirs(png_dir, exist_ok=True)

files = sorted(glob.glob(os.path.join(json_dir, "*.json")))
files = [f for f in files if os.path.basename(f) != "contact-sheet.json"]
if not files:
    raise SystemExit(f"no scene dumps in {json_dir} - run scripts/tools/all.ts first")
for f in files:
    slug = os.path.basename(f)[:-5]
    render(f, os.path.join(png_dir, f"{slug}.png"))

cols, rows, tw, th = 3, (len(files) + 2) // 3, 460, 318
sheet = Image.new("RGB", (cols * tw, rows * th), (8, 12, 18))
for i, f in enumerate(files):
    tmp = os.path.join(tempfile.gettempdir(), "_tile.png")
    render(f, tmp)
    sheet.paste(Image.open(tmp).resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
dr = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    dr.text(((i % cols) * tw + 8, (i // cols) * th + 6), os.path.basename(f)[:-5], fill=(140, 220, 255))
sheet.save(os.path.join(png_dir, "contact-sheet.png"))
print(f"{len(files)} renders -> {png_dir}")
