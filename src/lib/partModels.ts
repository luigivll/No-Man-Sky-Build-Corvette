/**
 * Real No Man's Sky corvette part meshes.
 *
 * `public/models/corvette.bin` + `corvette.json` are produced by
 * `scripts/unreal/build-part-models.py`, which converts the 589 corvette FBX
 * models shipped with the open-source "No Man's Sky Base Builder" add-on into a
 * compact binary pack.  These are the actual in-game part shapes, named exactly
 * like the game assets (B_COK_A, B_STR_A_N, B_WNG_C, B_LND_B, …), all kept at
 * their true relative scale: one snap cell is 6.0 x 3.0 x 6.0 source units,
 * which this module normalises to 1.0 x 0.5 x 1.0.
 *
 * The pack is read from disk on the server so every render (including the fully
 * static export) can draw the real geometry with no network round-trip, and the
 * same decode path is available in the browser if a page wants to fetch it.
 */

import fs from "node:fs";
import path from "node:path";
import {
  resolveStyle,
  type Face3D,
  type FaceKind,
  type ShipMesh,
  type V3,
} from "./render3d";
import type { PartCategoryId } from "./types";

export interface PackedPart {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  size: [number, number, number];
  verts: number;
  tris: number;
  offset: number;
  bytes: number;
}

export interface PartPack {
  source: string;
  gameUnit: number;
  count: number;
  bytes: number;
  parts: PackedPart[];
}

export interface DecodedMesh {
  /** flat xyz, already centred on the part's own footprint */
  positions: Float32Array;
  /** flat triangle indices */
  indices: Uint16Array;
  /** per-triangle face normal, unit length */
  normals: Float32Array;
  min: V3;
  max: V3;
}

const PACK_DIR = path.join(process.cwd(), "public", "models");
const PACK_JSON = path.join(PACK_DIR, "corvette.json");
const PACK_BIN = path.join(PACK_DIR, "corvette.bin");

let cachedManifest: PartPack | null = null;
let cachedBuffer: Buffer | null = null;

export function loadPartPack(): { manifest: PartPack; buffer: Buffer } | null {
  try {
    if (!cachedManifest) {
      cachedManifest = JSON.parse(fs.readFileSync(PACK_JSON, "utf8")) as PartPack;
    }
    if (!cachedBuffer) {
      cachedBuffer = fs.readFileSync(PACK_BIN);
    }
    return { manifest: cachedManifest, buffer: cachedBuffer };
  } catch {
    return null;
  }
}

const b64 = (buf: Buffer) => buf.toString("base64");

/** Encodes the whole pack as a base64 string for the browser. */
export function packAsBase64(): string | null {
  const pack = loadPartPack();
  return pack ? b64(pack.buffer) : null;
}

/** Decodes a packed part into positions + triangles + per-face normals. */
export function decodePart(buffer: Buffer, entry: PackedPart): DecodedMesh {
  const o = entry.offset;
  const n = buffer.readUInt32LE(o);
  const t = buffer.readUInt32LE(o + 4);
  const min: V3 = [buffer.readFloatLE(o + 8), buffer.readFloatLE(o + 12), buffer.readFloatLE(o + 16)];
  const max: V3 = [buffer.readFloatLE(o + 20), buffer.readFloatLE(o + 24), buffer.readFloatLE(o + 28)];

  const positions = new Float32Array(n * 3);
  const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  let p = o + 32;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const q = buffer.readUInt16LE(p);
      p += 2;
      positions[i * 3 + k] = min[k] + (q / 65535) * span[k];
    }
  }

  const indices = new Uint16Array(t * 3);
  for (let i = 0; i < t * 3; i++) {
    indices[i] = buffer.readUInt16LE(p);
    p += 2;
  }

  const normals = new Float32Array(t * 3);
  for (let i = 0; i < t; i++) {
    const a = indices[i * 3] * 3;
    const b = indices[i * 3 + 1] * 3;
    const c = indices[i * 3 + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    normals[i * 3] = nx;
    normals[i * 3 + 1] = ny;
    normals[i * 3 + 2] = nz;
  }

  return { positions, indices, normals, min, max };
}

// --------------------------------------------------------------------------- //
//  shading
// --------------------------------------------------------------------------- //

const LIGHT: V3 = (() => {
  const [x, y, z] = [-0.45, 0.72, -0.55];
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();

const RIM: V3 = (() => {
  const [x, y, z] = [0.62, 0.18, 0.76];
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();

export interface PartShading {
  hull: [number, number, number];
  hullDark: [number, number, number];
  emissive: [number, number, number];
  /** 0 = matte plating, 1 = glowing hardware */
  glow: number;
  /** which faces count as emissive glass/canopy */
  canopy?: boolean;
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Turns one real mesh into the `Face3D` triangles the shipyard renderer eats.
 * `maxTris` keeps the largest-area triangles, so a 40-triangle thumbnail still
 * reads as the right silhouette.
 */
export function meshToFaces(
  mesh: DecodedMesh,
  shading: PartShading,
  maxTris = 520,
  kind: FaceKind = "hull",
): Face3D[] {
  const triCount = mesh.indices.length / 3;
  let order: number[];
  if (maxTris > 0 && triCount > maxTris) {
    const scored: [number, number][] = [];
    for (let i = 0; i < triCount; i++) {
      const a = mesh.indices[i * 3] * 3;
      const b = mesh.indices[i * 3 + 1] * 3;
      const c = mesh.indices[i * 3 + 2] * 3;
      const ux = mesh.positions[b] - mesh.positions[a];
      const uy = mesh.positions[b + 1] - mesh.positions[a + 1];
      const uz = mesh.positions[b + 2] - mesh.positions[a + 2];
      const vx = mesh.positions[c] - mesh.positions[a];
      const vy = mesh.positions[c + 1] - mesh.positions[a + 1];
      const vz = mesh.positions[c + 2] - mesh.positions[a + 2];
      scored.push([
        Math.hypot(
          uy * vz - uz * vy,
          uz * vx - ux * vz,
          ux * vy - uy * vx,
        ),
        i,
      ]);
    }
    scored.sort((x, y) => y[0] - x[0]);
    order = scored.slice(0, maxTris).map((s) => s[1]);
  } else {
    order = Array.from({ length: triCount }, (_, i) => i);
  }

  const faces: Face3D[] = [];
  for (const i of order) {
    const a = mesh.indices[i * 3] * 3;
    const b = mesh.indices[i * 3 + 1] * 3;
    const c = mesh.indices[i * 3 + 2] * 3;
    const nx = mesh.normals[i * 3];
    const ny = mesh.normals[i * 3 + 1];
    const nz = mesh.normals[i * 3 + 2];

    // two-lobe lighting: soft key light + warm rim, so flat plates still read
    const key = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    const rim = Math.max(0, nx * RIM[0] + ny * RIM[1] + nz * RIM[2]);
    const up = Math.max(0, ny);
    const lit = 0.2 + 0.68 * key + 0.16 * up + 0.2 * rim * rim;

    const base = mix(shading.hullDark, shading.hull, Math.min(1, lit));
    const rgb = mix(base, shading.emissive, Math.max(0, rim * rim * shading.glow));
    const faceKind: FaceKind =
      shading.glow > 0.55 && rim > 0.86 ? "emissive" : kind;

    faces.push({
      pts: [
        [mesh.positions[a], mesh.positions[a + 1], mesh.positions[a + 2]],
        [mesh.positions[b], mesh.positions[b + 1], mesh.positions[b + 2]],
        [mesh.positions[c], mesh.positions[c + 1], mesh.positions[c + 2]],
      ],
      rgb: [rgb[0], rgb[1], rgb[2]],
      kind: faceKind,
    });
  }
  return faces;
}

/** A single real part as a stand-alone `ShipMesh`, ready for `projectScene`. */
export function realPartMesh(
  part: PackedPart,
  shading: PartShading,
  maxTris = 520,
  styleId = "corvette",
): ShipMesh | null {
  const pack = loadPartPack();
  if (!pack) return null;
  const style = resolveStyle(styleId);
  const mesh = decodePart(pack.buffer, part);
  const faces = meshToFaces(mesh, shading, maxTris);
  const pad = 0.04;
  return {
    parts: [
      {
        key: `${part.id}#0`,
        partId: part.id,
        partName: part.name,
        category: part.category as PartCategoryId,
        faces,
      },
    ],
    plumes: [],
    bounds: {
      min: [mesh.min[0] - pad, mesh.min[1] - pad, mesh.min[2] - pad],
      max: [mesh.max[0] + pad, mesh.max[1] + pad, mesh.max[2] + pad],
    },
    groundY: mesh.min[1],
    moduleCount: 1,
    style,
    attachments: [],
    modules: [],
    flourishes: [],
    hasShield: false,
  };
}

// --------------------------------------------------------------------------- //
//  catalogue helpers
// --------------------------------------------------------------------------- //

export const SHIPYARD_CATEGORIES = [
  "cockpit",
  "habitation",
  "landing",
  "thruster",
  "weapon",
  "shield",
  "reactor",
  "wing",
  "connector",
  "access",
  "interior",
  "structural",
  "decor",
] as const;

export type ShipyardCategory = (typeof SHIPYARD_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<string, string> = {
  cockpit: "Cockpits",
  habitation: "Habitation",
  landing: "Landing Gear",
  thruster: "Thrusters",
  weapon: "Weapons",
  shield: "Shields",
  reactor: "Reactors",
  wing: "Wings",
  connector: "Connectors",
  access: "Access Ways",
  interior: "Interior",
  structural: "Structural Hull",
  decor: "Trim",
};

export function partsByCategory(manifest: PartPack): Record<string, PackedPart[]> {
  const out: Record<string, PackedPart[]> = {};
  for (const p of manifest.parts) {
    (out[p.category] ??= []).push(p);
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}
