/**
 * Lattice assembler — real corvette parts on the game's own grid.
 *
 * Everything here works in the assets' native frame, which the FBX sources make
 * unambiguous once you look at the bounding boxes:
 *
 *   B_STR_A_N   x -0.49..0.51   y 0.01..0.51   z -0.49..0.54   one cell, X/Z centred, base on y=0
 *   B_HAB_A     x -0.49..0.51   y 0.00..0.49   z -0.97..1.02   two cells, centred on its mount
 *   B_COK_A     x -0.48..0.51   y -0.07..0.85  z  0.00..1.07   reaches forward from its mount
 *   B_TRU_A     x -0.48..0.50   y -0.24..0.26  z -0.62..0.01   nozzles aft of the mount
 *   B_WNG_A     x  0.00..1.00   y -0.15..1.00  z -1.93..1.46   root at the mount, span outboard
 *   B_LND_A     x -0.45..0.48   y -0.04..0.98  z -0.45..0.48   foot at the mount, leg upward
 *
 * So a part's ORIGIN IS ITS SNAP POINT and its bbox says how far it reaches from
 * there.  One grid cell is 1.0 x 0.5 x 1.0 (the catalogue pack already divided
 * the source units by six), and modules butt together when the next snap is
 * placed on the previous part's trailing face:
 *
 *     next.z = current.z + current.zMin - next.zMax
 *
 * That is the whole trick — no fitted boxes, no guessing.  The facing letters in
 * the asset names (_N _S _E _W) are the same thing expressed for the in-game
 * snap system, and the assembler agrees with them by construction.
 */

import { projectScene, type Face3D, type ShipMesh, type V3, type ViewState } from "./render3d";
import { packSync, type PackedPart } from "./realMeshes";

// --------------------------------------------------------------------------- //
//  recipe
// --------------------------------------------------------------------------- //

export type LatticeAxis = "x" | "y" | "z";

export interface LatticePlacement {
  assetId: string;
  /** where the asset's own origin lands in ship space */
  pos: V3;
  /** quarter turns about Y, 0-3 */
  yaw?: number;
  /** mirror about the YZ plane (port-side copy of a starboard asset) */
  mirror?: boolean;
  /**
   * Uniform scale about the snap point.  1 keeps the asset at true game size;
   * iconics use it to stop, say, four full-size foils swallowing a short
   * fuselage.  Everything (extent, bbox, plume position) follows.
   */
  scale?: number;
  /** label used by the manual / parts list */
  role?: string;
  /**
   * Fires an engine trail out of this part's aft face. Boosters get it
   * automatically; anything else can opt in (a rear-facing vent, a flare pod).
   */
  plume?: { radius?: number; length?: number } | false;
}

export interface LatticeRecipe {
  id: string;
  name: string;
  role: string;
  /** hull plating */
  hull: string;
  hullDark: string;
  emissive: string;
  glow?: number;
  /** "space" gives long engine trails over a starfield, "hangar" short ones */
  environment?: "space" | "hangar";
  parts: LatticePlacement[];
}

interface Box {
  min: V3;
  max: V3;
}

// --------------------------------------------------------------------------- //
//  decoding
// --------------------------------------------------------------------------- //

const decodedCache = new Map<string, { positions: Float32Array; indices: Uint16Array; box: Box }>();

export function partBox(p: PackedPart): Box {
  return { min: [...p.bbox.min] as V3, max: [...p.bbox.max] as V3 };
}

function lookup(assetId: string): PackedPart | null {
  const pack = packSync();
  return pack?.byId.get(assetId) ?? null;
}

/** world-space bbox of a part once its transform is applied */
export function placedBox(assetId: string, pos: V3, yaw = 0, mirror = false, scale = 1): Box | null {
  const p = lookup(assetId);
  if (!p) return null;
  const raw = partBox(p);
  const b: Box = {
    min: [raw.min[0] * scale, raw.min[1] * scale, raw.min[2] * scale],
    max: [raw.max[0] * scale, raw.max[1] * scale, raw.max[2] * scale],
  };
  const corners: V3[] = [];
  for (const cx of [b.min[0], b.max[0]]) {
    for (const cy of [b.min[1], b.max[1]]) {
      for (const cz of [b.min[2], b.max[2]]) {
        const [x, z] = rotateY(cx, cz, yaw);
        corners.push([pos[0] + (mirror ? -x : x), pos[1] + cy, pos[2] + z]);
      }
    }
  }
  return {
    min: [Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])), Math.min(...corners.map((c) => c[2]))],
    max: [Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[2]))],
  };
}

function rotateY(x: number, z: number, quarters: number): [number, number] {
  let rx = x;
  let rz = z;
  const q = ((quarters % 4) + 4) % 4;
  for (let i = 0; i < q; i++) {
    const nx = rz;
    rz = -rx;
    rx = nx;
  }
  return [rx, rz];
}

// --------------------------------------------------------------------------- //
//  chain helpers — how a real corvette is actually assembled
// --------------------------------------------------------------------------- //

/**
 * Lays modules nose-to-tail. The first part is the anchor; every following one
 * is placed so its leading face touches the previous part's trailing face.
 */
export function chainZ(ids: string[], anchorZ = 0, opts: { y?: number; startIndex?: number } = {}): LatticePlacement[] {
  const out: LatticePlacement[] = [];
  let place = true;
  let cursorZ = anchorZ;
  let cursorZMin = 0;
  for (const [i, assetId] of ids.entries()) {
    const p = lookup(assetId);
    if (!p) continue;
    const b = partBox(p);
    if (place) {
      out.push({
        assetId,
        pos: [0, opts.y ?? 0, cursorZ],
        role: i === 0 ? "first" : "linked",
      });
      cursorZ += b.min[2];
      cursorZMin = b.min[2];
      place = false;
    } else {
      // slide the newcomer back until its leading face meets the cursor
      const z = cursorZ - b.max[2];
      out.push({ assetId, pos: [0, opts.y ?? 0, z], role: "linked" });
      cursorZ = z + b.min[2];
      cursorZMin = b.min[2];
    }
    void cursorZMin;
  }
  if (opts.startIndex !== undefined && out.length) {
    return out.slice(opts.startIndex);
  }
  return out;
}

/**
 * Attaches a part to the flank of the part already placed under `host`. The
 * child's local X=0 edge is pushed out to the host's edge, which is exactly how
 * wings, boosters and guns hang off a real hull.
 */
export function flank(
  assetId: string,
  host: LatticePlacement,
  opts: {
    side?: 1 | -1;
    overlap?: number;
    zOffset?: number;
    yOffset?: number;
    yaw?: number;
    scale?: number;
  } = {},
): LatticePlacement {
  const { side = 1, overlap = 0, zOffset = 0, yOffset = 0, yaw = 0, scale = 1 } = opts;
  const hostBox = placedBox(host.assetId, host.pos, host.yaw ?? 0, host.mirror, host.scale ?? 1);
  const child = lookup(assetId);
  const childMinX = child ? partBox(child).min[0] : 0;
  const edge = hostBox ? (side > 0 ? hostBox.max[0] : hostBox.min[0]) : 0.5 * side;

  // The child's INBOARD face is the one that has to land on the hull edge, and
  // which local face that is depends on whether the asset reaches outboard from
  // its origin (wings: local x runs 0..1) or straddles it (boosters: -0.49..0.52).
  // Mirroring maps local +x onto world -x, so both cases reduce to childMinX.
  const scaledMinX = childMinX * scale;
  const x = (side > 0 ? edge - scaledMinX : edge + scaledMinX) + overlap * side;
  return {
    assetId,
    pos: [x, host.pos[1] + yOffset, host.pos[2] + zOffset],
    yaw,
    mirror: side < 0,
    scale,
    role: side < 0 ? "port" : "starboard",
  };
}

/** Bolts a part under (or over) the host, using the host's own face. */
export function stack(
  assetId: string,
  host: LatticePlacement,
  opts: { below?: boolean; xOffset?: number; zOffset?: number } = {},
): LatticePlacement {
  const { below = true, xOffset = 0, zOffset = 0 } = opts;
  const hostBox = placedBox(host.assetId, host.pos, host.yaw ?? 0, host.mirror, host.scale ?? 1);
  const p = lookup(assetId);
  const childBox = p ? partBox(p) : { min: [0, 0, 0] as V3, max: [0, 0, 0] as V3 };
  let y = host.pos[1];
  if (hostBox) {
    // the child's near face lands on the host's near face
    y = below ? hostBox.min[1] - childBox.max[1] : hostBox.max[1] - childBox.min[1];
  }
  return { assetId, pos: [host.pos[0] + xOffset, y, host.pos[2] + zOffset], role: below ? "ventral" : "dorsal" };
}

// --------------------------------------------------------------------------- //
//  shading + mesh build
// --------------------------------------------------------------------------- //

/**
 * Three-point rig, tuned for flat metal plating.
 *
 *   KEY   warm, upper-left-forward   — carries the form
 *   FILL  cool, lower-right          — keeps the shadow side readable
 *   RIM   hot, aft-starboard         — separates the hull from the backdrop
 *
 * A Blinn half-vector gives the specular sheen; without it the panels read as
 * card rather than plate.
 */
function unit(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

const KEY = unit([-0.44, 0.72, -0.54]);
const FILL = unit([0.58, -0.34, 0.62]);
const RIM = unit([0.66, 0.26, 0.7]);
const EYE = unit([-0.34, 0.26, -0.9]);
const HALF = unit([KEY[0] + EYE[0], KEY[1] + EYE[1], KEY[2] + EYE[2]]);

const KEY_TINT: [number, number, number] = [1.04, 0.99, 0.93];
const FILL_TINT: [number, number, number] = [0.52, 0.68, 0.92];
const SPEC_TINT: [number, number, number] = [1.0, 0.97, 0.9];

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export interface AssembleOptions {
  maxTrisPerPart?: number;
  /** keep the real emissive hardware glowing */
  glow?: number;
}

export function assembleCorvette(recipe: LatticeRecipe, opts: AssembleOptions = {}): ShipMesh | null {
  const pack = packSync();
  if (!pack) return null;
  const maxTris = opts.maxTrisPerPart ?? 220;
  const glowStrength = opts.glow ?? 0.55;

  const hull = hexRgb(recipe.hull);
  const hullDark = hexRgb(recipe.hullDark);
  const emissive = hexRgb(recipe.emissive);

  const parts: ShipMesh["parts"] = [];
  const modules: ShipMesh["modules"] = [];
  const plumes: ShipMesh["plumes"] = [];
  const boundsMin: V3 = [Infinity, Infinity, Infinity];
  const boundsMax: V3 = [-Infinity, -Infinity, -Infinity];

  for (const [index, place] of recipe.parts.entries()) {
    const entry = pack.byId.get(place.assetId);
    if (!entry) continue;
    let dec = decodedCache.get(place.assetId);
    if (!dec) {
      const mesh = decodeRaw(pack.bin, entry);
      dec = { positions: mesh.positions, indices: mesh.indices, box: partBox(entry) };
      decodedCache.set(place.assetId, dec);
    }

    const yaw = place.yaw ?? 0;
    const mirror = place.mirror ?? false;
    const scale = place.scale ?? 1;
    const triCount = dec.indices.length / 3;
    const order = largestTris(dec.positions, dec.indices, triCount, maxTris);

    const faces: Face3D[] = [];
    const key = `${place.assetId}#${index}`;
    for (const t of order) {
      const pts: V3[] = [];
      let nx = 0;
      let ny = 0;
      let nz = 0;
      const a = dec.indices[t * 3] * 3;
      const b = dec.indices[t * 3 + 1] * 3;
      const c = dec.indices[t * 3 + 2] * 3;
      const ux = dec.positions[b] - dec.positions[a];
      const uy = dec.positions[b + 1] - dec.positions[a + 1];
      const uz = dec.positions[b + 2] - dec.positions[a + 2];
      const vx = dec.positions[c] - dec.positions[a];
      const vy = dec.positions[c + 1] - dec.positions[a + 1];
      const vz = dec.positions[c + 2] - dec.positions[a + 2];
      nx = uy * vz - uz * vy;
      ny = uz * vx - ux * vz;
      nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;

      for (const vi of [a, b, c]) {
        const [rx, rz] = rotateY(dec.positions[vi] * scale, dec.positions[vi + 2] * scale, yaw);
        const wx = mirror ? -rx : rx;
        pts.push([
          place.pos[0] + wx,
          place.pos[1] + dec.positions[vi + 1] * scale,
          place.pos[2] + rz,
        ]);
      }
      // mirroring flips winding, and so does a normal pointing the wrong way
      if (mirror) pts.reverse();
      if (mirror) {
        nx = -nx;
        nz = -nz;
      }

      const key = Math.max(0, nx * KEY[0] + ny * KEY[1] + nz * KEY[2]);
      const fill = Math.max(0, nx * FILL[0] + ny * FILL[1] + nz * FILL[2]);
      const rim = Math.max(0, nx * RIM[0] + ny * RIM[1] + nz * RIM[2]);
      const half = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
      const spec = Math.pow(half, 26) * 0.5 + Math.pow(half, 6) * 0.06;

      // ramp: deep shadow -> plate -> lit plate, then add the cool fill bounce
      let lit = 0.1 + 0.6 * key + 0.12 * key * key;
      let base = mixRgb(hullDark, hull, Math.min(1, lit));
      base = mixRgb(base, [base[0] * FILL_TINT[0], base[1] * FILL_TINT[1], base[2] * FILL_TINT[2]], fill * 0.5);
      base = [
        base[0] * KEY_TINT[0] + spec * SPEC_TINT[0] * 255,
        base[1] * KEY_TINT[1] + spec * SPEC_TINT[1] * 255,
        base[2] * KEY_TINT[2] + spec * SPEC_TINT[2] * 255,
      ];
      const rimGlow = Math.pow(rim, 2.2);
      const rgb = mixRgb(base, emissive, Math.max(0, rimGlow * glowStrength));
      faces.push({
        pts,
        rgb: [rgb[0], rgb[1], rgb[2]],
        kind: glowStrength > 0.5 && rim > 0.93 ? "emissive" : "hull",
      });

      for (const pt of pts) {
        for (let k = 0; k < 3; k++) {
          boundsMin[k] = Math.min(boundsMin[k], pt[k]);
          boundsMax[k] = Math.max(boundsMax[k], pt[k]);
        }
      }
    }

    // Engine trail: fires out of the part's own aft face, so it lines up with
    // the nozzle without anyone having to hand-place it.
    const wantsPlume = place.plume !== false && (place.plume || place.assetId.startsWith("B_TRU"));
    if (wantsPlume) {
      const own = placedBox(place.assetId, place.pos, yaw, mirror, scale);
      if (own) {
        const cfg = typeof place.plume === "object" ? place.plume : {};
        const spanX = own.max[0] - own.min[0];
        const spanY = own.max[1] - own.min[1];
        const radius = cfg.radius ?? Math.min(spanX, spanY) * 0.3;
        plumes.push({
          origin: [(own.min[0] + own.max[0]) / 2, (own.min[1] + own.max[1]) / 2, own.min[2]],
          dir: [0, 0, -1],
          radius,
          length: cfg.length ?? radius * 5.5,
          rgb: emissive,
          ring: { radius: radius * 1.45, rgb: mixRgb(emissive, [255, 255, 255], 0.45) },
        });
      }
    }

    parts.push({
      key,
      partId: place.assetId,
      partName: `${entry.name}${place.role ? ` · ${place.role}` : ""}`,
      category: "cockpit" as never,
      faces,
    });
    modules.push({
      key,
      partId: place.assetId,
      partName: entry.name,
      category: "cockpit" as never,
      anchor: place.pos,
      parent: "hull",
      socket: place.role ?? "",
      gap: 0,
    });
  }

  if (!parts.length) return null;

  return {
    parts,
    plumes,
    bounds: { min: boundsMin, max: boundsMax },
    groundY: boundsMin[1],
    moduleCount: parts.length,
    style: {
      environment: recipe.environment ?? "space",
    } as never,
    attachments: [],
    modules,
    flourishes: [],
    hasShield: false,
  };
}

function largestTris(positions: Float32Array, indices: Uint16Array, triCount: number, max: number): number[] {
  if (max <= 0 || triCount <= max) return Array.from({ length: triCount }, (_, i) => i);
  const scored: [number, number][] = [];
  for (let i = 0; i < triCount; i++) {
    const a = indices[i * 3] * 3;
    const b = indices[i * 3 + 1] * 3;
    const c = indices[i * 3 + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    scored.push([Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx), i]);
  }
  scored.sort((x, y) => y[0] - x[0]);
  return scored.slice(0, max).map((s) => s[1]);
}

/** Minimal duplicate of the pack decoder that works off an explicit buffer. */
export function decodeRaw(buffer: ArrayBuffer, entry: PackedPart) {
  const view = new DataView(buffer);
  const o = entry.offset;
  const n = view.getUint32(o, true);
  const t = view.getUint32(o + 4, true);
  const min: V3 = [view.getFloat32(o + 8, true), view.getFloat32(o + 12, true), view.getFloat32(o + 16, true)];
  const max: V3 = [view.getFloat32(o + 20, true), view.getFloat32(o + 24, true), view.getFloat32(o + 28, true)];
  const positions = new Float32Array(n * 3);
  const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  let q = o + 32;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      positions[i * 3 + k] = min[k] + (view.getUint16(q, true) / 65535) * span[k];
      q += 2;
    }
  }
  const indices = new Uint16Array(t * 3);
  for (let i = 0; i < t * 3; i++) {
    indices[i] = view.getUint16(q, true);
    q += 2;
  }
  return { positions, indices, min, max };
}

/** Rotating isometric-ish views used by the preview page. */
export const LATTICE_VIEWS: { id: string; label: string; view: ViewState }[] = [
  { id: "hero", label: "3/4 fore", view: { yaw: 0.72, pitch: -0.3, zoom: 1 } },
  { id: "aft", label: "3/4 aft", view: { yaw: 2.45, pitch: -0.26, zoom: 1 } },
  { id: "side", label: "Starboard", view: { yaw: Math.PI / 2, pitch: -0.06, zoom: 1 } },
  { id: "plan", label: "Plan", view: { yaw: 0, pitch: -1.32, zoom: 1 } },
];

export { projectScene };
