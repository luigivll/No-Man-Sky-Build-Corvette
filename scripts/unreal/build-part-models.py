#!/usr/bin/env python3
"""
Build the real No Man's Sky corvette part meshes for the shipyard.

Source: the open-source Blender add-on `djmonkeyuk/nms-base-builder`, whose
`models/corvette/` folder holds one FBX per shipped corvette part (589 of them,
named exactly like the in-game assets: B_COK_A, B_STR_A_N, B_WNG_C, B_LND_B...).

Output:
    public/models/corvette.bin   packed binary, one blob per part
    public/models/corvette.json  manifest (id, category, bbox, sizes, offsets)

Binary blob layout, little endian, per part:
    u32 vertCount
    u32 triCount
    f32 bboxMin[3]
    f32 bboxMax[3]
    i16 position[vertCount * 3]   normalised 0..65535 across the part bbox
    u16 index[triCount * 3]       local to the part

Positions are quantised per part so precision follows the part's own size
(a 90 m hull and a 1 m greeble both keep ~1e-4 relative accuracy), and the
absolute size is recovered from the bbox, which keeps every part at its true
relative scale.  Face normals are deliberately left out: the renderer derives
them from the triangle, which keeps the file ~35% smaller.

Scale: measured from the FBX sources, one corvette grid cell is 6.0 x 3.0 x 6.0
units (B_STR_*_N) and a habitation module is exactly two cells long (B_HAB_A is
6.02 x 2.95 x 12.00), so GAME_UNIT below is simply that grid cell.  Axes are
already Y-up / Z-forward, matching the in-game convention.

Usage:
    python3 scripts/unreal/build-part-models.py <models-dir> [out-dir]
"""

from __future__ import annotations

import json
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fbx import decimate, extract_meshes, read_fbx  # noqa: E402

# one corvette snap cell, measured from B_STR_*_N / B_CON_5 (6.00 x 3.00 x 6.00)
GAME_UNIT = 6.0

GRID = 40          # vertex-cluster resolution for decimation
MAX_TRIS = 520     # triangles kept per part

# --- real asset prefix -> shipyard category -------------------------------- #
CATEGORY_RULES: list[tuple[str, str, str]] = [
    (r"^B_COK",      "cockpit",    "Cockpit"),
    (r"^B_HAB1?_",   "habitation", "Habitation Module"),
    (r"^B_WALL_",    "interior",   "Interior Wall"),
    (r"^B_LND",      "landing",    "Landing Gear"),
    (r"^B_TRU",      "thruster",   "Thruster"),
    (r"^B_TUR",      "weapon",     "Weapon System"),
    (r"^B_SHL",      "shield",     "Shield Generator"),
    (r"^B_GEN",      "reactor",    "Reactor"),
    (r"^B_CON2?_",   "connector",  "Connector"),
    (r"^B_ALK",      "access",     "Access Module"),
    (r"^B_WNG",      "wing",       "Wing Module"),
    (r"^B_STR",      "structural", "Structural Hull"),
    (r"^B_DECO",     "decor",      "Decoration"),
    (r"^B_STAIRS",   "connector",  "Stairs"),
]

# Suffixes are orientation/connection codes, not separate parts: B_STR_A_N and
# B_STR_A_E are the same block facing north / east.  They stay separate assets
# (the builder picks the right facing) but share a display name.
ORIENT_RE = re.compile(r"_(N|S|E|W|NE|NW|SE|SW)\d*$")


def category_for(part_id: str) -> tuple[str, str]:
    for pattern, cat, label in CATEGORY_RULES:
        if re.match(pattern, part_id):
            return cat, label
    return "structural", "Structural Hull"


def display_name(part_id: str) -> str:
    base = ORIENT_RE.sub("", part_id)
    if base.endswith("_R"):
        base = base[:-2]
    m = re.match(r"^B_([A-Z0-9]+)_?(.*)$", base)
    if not m:
        return part_id
    family, rest = m.group(1), m.group(2)
    names = {
        "COK": "Cockpit", "HAB": "Habitation", "HAB1": "Habitation Pod",
        "LND": "Landing Gear", "TRU": "Booster", "TUR": "Turret",
        "SHL": "Shield", "GEN": "Reactor", "CON": "Connector",
        "CON2": "Connector", "ALK": "Access Walkway", "WNG": "Wing",
        "STR": "Hull Block", "DECO": "Trim", "WALL": "Wall", "STAIRS": "Stairs",
    }
    nice = names.get(family, family.title())
    if rest:
        rest = rest.replace("_", " ").strip()
        m2 = re.match(r"^BUNK(\d)$", rest)
        detail = {
            "BUNK0": "Bunk", "CARG": "Cargo", "KITC": "Kitchen", "MED0": "Med Bay",
            "PLAN0": "Planter", "TECH": "Tech Bay", "TOIL0": "Washroom",
            "WIND": "Window", "CARGO": "Cargo",
        }
        for key, val in detail.items():
            if rest.startswith(key):
                tail = rest[len(key):].strip()
                return f"{val}{(' ' + tail) if tail else ''}"
        return f"{nice} {rest}"
    return nice


def build(models_dir: Path, out_dir: Path) -> dict:
    fbx_files = sorted(models_dir.glob("*.fbx"))
    if not fbx_files:
        raise SystemExit(f"no .fbx files in {models_dir}")

    blobs: list[bytes] = []
    entries: list[dict] = []
    offset = 0
    axis_lo = [1e9] * 3
    axis_hi = [-1e9] * 3
    total_in = total_out = 0

    for i, path in enumerate(fbx_files):
        part_id = path.stem
        try:
            root, _ = read_fbx(path)
            meshes = extract_meshes(root)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {part_id}: {exc}")
            continue
        if not meshes:
            continue

        merged_v: list[float] = []
        merged_i: list[int] = []
        for m in meshes:
            if not m.vertices or not m.indices:
                continue
            base = len(merged_v) // 3
            merged_v.extend(m.vertices)
            merged_i.extend(x + base for x in m.indices)
        if not merged_v:
            continue

        from fbx import Mesh  # local import: keeps the top of the file tidy

        dec = decimate(Mesh(merged_v, merged_i), grid=GRID, max_tris=MAX_TRIS)
        verts, idx = dec.vertices, dec.indices
        if not verts or not idx:
            continue

        # scale into shipyard units
        verts = [c / GAME_UNIT for c in verts]
        # Y-up already; centre on the part's own footprint
        xs, ys, zs = verts[0::3], verts[1::3], verts[2::3]
        bmin = [min(xs), min(ys), min(zs)]
        bmax = [max(xs), max(ys), max(zs)]

        n = len(verts) // 3
        span = [max(bmax[k] - bmin[k], 1e-9) for k in range(3)]
        q: list[int] = []
        for v in range(n):
            for k in range(3):
                t = (verts[v * 3 + k] - bmin[k]) / span[k]
                q.append(max(0, min(65535, int(round(t * 65535)))))

        if n > 65535:
            continue
        blob = struct.pack("<II6f", n, len(idx) // 3, *bmin, *bmax)
        blob += struct.pack(f"<{len(q)}H", *q)
        blob += struct.pack(f"<{len(idx)}H", *idx)

        cat, label = category_for(part_id)
        entries.append({
            "id": part_id,
            "name": display_name(part_id),
            "category": cat,
            "categoryLabel": label,
            "bbox": {
                "min": [round(c, 4) for c in bmin],
                "max": [round(c, 4) for c in bmax],
            },
            "size": [round(span[k], 4) for k in range(3)],
            "verts": n,
            "tris": len(idx) // 3,
            "offset": offset,
            "bytes": len(blob),
        })
        blobs.append(blob)
        offset += len(blob)

        for k in range(3):
            axis_lo[k] = min(axis_lo[k], bmin[k])
            axis_hi[k] = max(axis_hi[k], bmax[k])
        total_in += path.stat().st_size
        total_out += len(blob)

        if (i + 1) % 100 == 0:
            print(f"  ... {i + 1}/{len(fbx_files)}")

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "corvette.bin").write_bytes(b"".join(blobs))

    manifest = {
        "source": "djmonkeyuk/nms-base-builder :: src/addons/no_mans_sky_base_builder/models/corvette",
        "gameUnit": GAME_UNIT,
        "grid": GRID,
        "maxTris": MAX_TRIS,
        "count": len(entries),
        "bytes": offset,
        "parts": entries,
    }
    (out_dir / "corvette.json").write_text(
        json.dumps(manifest, separators=(",", ":")), encoding="utf-8"
    )

    print(f"\n  {len(entries)} parts")
    print(f"  fbxa   {total_in / 1e6:8.2f} MB  ->  pack {total_out / 1e6:6.2f} MB")
    from collections import Counter
    for cat, n in Counter(e["category"] for e in entries).most_common():
        print(f"    {cat:12} {n:4}")
    print(f"  extent (shipyards units): "
          f"X {axis_lo[0]:.1f}..{axis_hi[0]:.1f}  "
          f"Y {axis_lo[1]:.1f}..{axis_hi[1]:.1f}  "
          f"Z {axis_lo[2]:.1f}..{axis_hi[2]:.1f}")
    return manifest


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("public/models")
    build(src, dst)
