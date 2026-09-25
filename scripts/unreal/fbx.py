"""
Minimal binary FBX (7.x) reader, written from scratch.

Why hand-rolled: this sandbox has no assimp / trimesh / blender / dotnet, and the
pip ecosystem has nothing usable for FBX.  The binary FBX container is a simple
recursive node tree and the geometry we need lives in two arrays, so ~250 lines
of Python is enough to get real vertices + triangle indices out of the files.

Format reference (FBX 7.x binary):
    header   "Kaydara FBX Binary  \\x00" + 2 pad bytes + uint32 version
    node     EndOffset(u32) NumProperties(u32) PropertyListLen(u32) NameLen(u8)
             Name(NameLen) Properties PropertyListLen  ...nested nodes...  NullRecord(13 zero bytes)
    property 'Y' int16 | 'C' bool | 'I' int32 | 'F' float32 | 'D' float64 | 'L' int64
             'f','d','l','i','b'  array: ArrayLength(u32) Encoding(u32) CompressedLength(u32) data
             (Encoding 0 = raw, 1 = zlib deflate)
             FBX >= 7500 uses 64-bit array lengths; 7400 uses 32-bit.
"""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass, field
from pathlib import Path

FBX_MAGIC = b"Kaydara FBX Binary  \x00"

ARRAY_TYPES = {
    "f": ("f", 4),
    "d": ("d", 8),
    "l": ("q", 8),
    "i": ("i", 4),
    "b": ("b", 1),
}
SCALAR_TYPES = {
    "Y": ("h", 2),
    "C": ("?", 1),
    "I": ("i", 4),
    "F": ("f", 4),
    "D": ("d", 8),
    "L": ("q", 8),
}


@dataclass
class Node:
    name: str
    props: list = field(default_factory=list)
    children: list["Node"] = field(default_factory=list)

    def child(self, name: str) -> "Node | None":
        for c in self.children:
            if c.name == name:
                return c
        return None

    def children_named(self, name: str) -> list["Node"]:
        return [c for c in self.children if c.name == name]

    def prop(self, index: int, default=None):
        if index >= len(self.props):
            return default
        return self.props[index]

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()


def _read_prop(buf: bytes, off: int, version: int):
    t = buf[off : off + 1].decode("ascii", "replace")
    off += 1
    if t in SCALAR_TYPES:
        fmt, size = SCALAR_TYPES[t]
        (val,) = struct.unpack_from("<" + fmt, buf, off)
        return val, off + size
    if t in ARRAY_TYPES:
        fmt, size = ARRAY_TYPES[t]
        if version >= 7500:
            length, encoding, comp_len = struct.unpack_from("<QQQ", buf, off)
            off += 24
        else:
            length, encoding, comp_len = struct.unpack_from("<III", buf, off)
            off += 12
        raw = buf[off : off + comp_len]
        off += comp_len
        if encoding == 1:
            raw = zlib.decompress(raw)
        if length == 0:
            return [], off
        vals = list(struct.unpack_from("<" + fmt * length, raw, 0))
        return vals, off
    if t == "S" or t == "R":
        (n,) = struct.unpack_from("<I", buf, off)
        off += 4
        raw = buf[off : off + n]
        if t == "S":
            return raw.decode("utf-8", "replace"), off + n
        return raw, off + n
    raise ValueError(f"unknown FBX property type {t!r} at {off - 1}")


def _read_node(buf: bytes, off: int, version: int):
    if version >= 7500:
        end_off, n_props, prop_len = struct.unpack_from("<QQQ", buf, off)
        hdr = 25
    else:
        end_off, n_props, prop_len = struct.unpack_from("<III", buf, off)
        hdr = 13
    if end_off == 0:
        return None, off + hdr
    name_len = buf[off + hdr - 1]
    name = buf[off + hdr : off + hdr + name_len].decode("utf-8", "replace")
    p = off + hdr + name_len
    props = []
    for _ in range(n_props):
        val, p = _read_prop(buf, p, version)
        props.append(val)
    node = Node(name, props)
    p = off + hdr + name_len + prop_len
    while p < end_off:
        sub, p2 = _read_node(buf, p, version)
        if sub is None:
            p = p2
            break
        node.children.append(sub)
        p = p2
    return node, end_off


def read_fbx(path: str | Path) -> tuple[Node, int]:
    buf = Path(path).read_bytes()
    if not buf.startswith(FBX_MAGIC):
        raise ValueError(f"{path}: not a binary FBX (ASCII FBX is not supported)")
    version = struct.unpack_from("<I", buf, 23)[0]
    roots: list[Node] = []
    p = 27
    while True:
        node, p = _read_node(buf, p, version)
        if node is None:
            break
        roots.append(node)
    return Node("(root)", [], roots), version


# --------------------------------------------------------------------------- #
#  mesh extraction
# --------------------------------------------------------------------------- #

@dataclass
class Mesh:
    vertices: list[float]      # flat xyz
    indices: list[int]         # triangles
    normals: list[float] | None = None
    name: str = ""

    @property
    def tri_count(self) -> int:
        return len(self.indices) // 3

    @property
    def vert_count(self) -> int:
        return len(self.vertices) // 3


def _normal_from_polygon(verts: list[float], idx: list[int]) -> tuple[float, float, float]:
    ax, ay, az = verts[idx[0] * 3 : idx[0] * 3 + 3]
    bx, by, bz = verts[idx[1] * 3 : idx[1] * 3 + 3]
    cx, cy, cz = verts[idx[2] * 3 : idx[2] * 3 + 3]
    ux, uy, uz = bx - ax, by - ay, bz - az
    vx, vy, vz = cx - ax, cy - ay, cz - az
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    length = (nx * nx + ny * ny + nz * nz) ** 0.5
    if length < 1e-12:
        return (0.0, 1.0, 0.0)
    return (nx / length, ny / length, nz / length)


def extract_meshes(root: Node) -> list[Mesh]:
    """Pull every `Geometry` node (FBX mesh) out of the file."""
    out: list[Mesh] = []
    for obj in root.walk():
        if obj.name != "Geometry":
            continue
        vert_node = obj.child("Vertices")
        idx_node = obj.child("PolygonVertexIndex")
        if vert_node is None or idx_node is None:
            continue
        verts = vert_node.props[0]
        poly = idx_node.props[0]
        if not verts or not poly:
            continue

        # PolygonVertexIndex: a negative value (~i, i.e. -i-1) closes a polygon.
        tris: list[int] = []
        face: list[int] = []
        for raw in poly:
            if raw < 0:
                face.append(~raw)
                for k in range(1, len(face) - 1):
                    tris.extend((face[0], face[k], face[k + 1]))
                face = []
            else:
                face.append(raw)

        name = ""
        if len(obj.props) > 1 and isinstance(obj.props[1], str):
            name = obj.props[1].split("\x00")[0]
        out.append(Mesh(list(verts), tris, None, name))
    return out


# --------------------------------------------------------------------------- #
#  decimation + orientation
# --------------------------------------------------------------------------- #

def decimate(mesh: Mesh, grid: int = 48, max_tris: int = 1500) -> Mesh:
    """Cheap vertex-clustering decimation.

    Snaps every vertex to a `grid`^3 lattice, merges duplicates, drops
    degenerate triangles and (optionally) thins further by keeping the largest
    triangles until `max_tris`.  Good enough for a stylised viewer and it keeps
    the silhouette, which is what the shipyard needs.
    """
    verts = mesh.vertices
    if not verts:
        return mesh
    xs = verts[0::3]
    ys = verts[1::3]
    zs = verts[2::3]
    lo = (min(xs), min(ys), min(zs))
    hi = (max(xs), max(ys), max(zs))
    span = [max(hi[i] - lo[i], 1e-9) for i in range(3)]

    remap: dict[tuple[int, int, int], int] = {}
    new_verts: list[float] = []
    lut: list[int] = []
    for i in range(len(verts) // 3):
        key = (
            int((verts[i * 3] - lo[0]) / span[0] * grid),
            int((verts[i * 3 + 1] - lo[1]) / span[1] * grid),
            int((verts[i * 3 + 2] - lo[2]) / span[2] * grid),
        )
        j = remap.get(key)
        if j is None:
            j = len(new_verts) // 3
            remap[key] = j
            new_verts.extend((lo[0] + (key[0] + 0.5) / grid * span[0],
                              lo[1] + (key[1] + 0.5) / grid * span[1],
                              lo[2] + (key[2] + 0.5) / grid * span[2]))
        lut.append(j)

    tris: list[tuple[int, int, int]] = []
    seen: set[tuple[int, int, int]] = set()
    idx = mesh.indices
    for t in range(0, len(idx), 3):
        a, b, c = lut[idx[t]], lut[idx[t + 1]], lut[idx[t + 2]]
        if a == b or b == c or a == c:
            continue
        key = tuple(sorted((a, b, c)))
        if key in seen:
            continue
        seen.add(key)
        tris.append((a, b, c))

    if max_tris and len(tris) > max_tris:
        # keep the biggest-area triangles first, then restore original winding
        scored = []
        for a, b, c in tris:
            scored.append((_tri_area(new_verts, a, b, c), (a, b, c)))
        scored.sort(reverse=True, key=lambda p: p[0])
        keep = {t for _, t in scored[:max_tris]}
        tris = [t for t in tris if t in keep]

    flat = [i for tri in tris for i in tri]
    return Mesh(new_verts, flat, None, mesh.name)


def _tri_area(v: list[float], a: int, b: int, c: int) -> float:
    ax, ay, az = v[a * 3 : a * 3 + 3]
    bx, by, bz = v[b * 3 : b * 3 + 3]
    cx, cy, cz = v[c * 3 : c * 3 + 3]
    ux, uy, uz = bx - ax, by - ay, bz - az
    vx, vy, vz = cx - ax, cy - ay, cz - az
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    return (nx * nx + ny * ny + nz * nz) ** 0.5 * 0.5


def normalize_mesh(mesh: Mesh, unit: bool = True, y_up: bool = True) -> dict:
    """Centre on origin, optional Y-up conversion, optional unit-cube fit.

    Returns plain python data ready to be JSON-encoded.
    """
    v = mesh.vertices
    if not v:
        return {"v": [], "i": [], "n": []}
    # FBX from the Blender exporter is Z-up; the shipyard works in Y-up.
    if y_up:
        v = [c for i in range(len(v) // 3) for c in (v[i * 3], v[i * 3 + 2], -v[i * 3 + 1])]
    xs, ys, zs = v[0::3], v[1::3], v[2::3]
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    cz = (min(zs) + max(zs)) / 2
    v = [c for i in range(len(v) // 3)
         for c in (v[i * 3] - cx, v[i * 3 + 1] - cy, v[i * 3 + 2] - cz)]
    size = [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)]
    scale = 1.0
    if unit:
        scale = 1.0 / max(max(size), 1e-9)
    return {
        "v": [round(c * scale, 5) for c in v],
        "i": mesh.indices,
        "size": [round(s * scale, 5) for s in size],
    }
