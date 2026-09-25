/**
 * Real-mesh injection for the shipyard renderer.
 *
 * `data/parts.json` describes the 50 buyable modules; each one now points at a
 * real game asset through `assetId` (B_COK_A, B_HAB_A, B_WNG_Q, …).  This module
 * turns that asset into `Face3D[]` in whatever local box a `moduleSpec` happens
 * to be using, so the existing layout engine keeps working unchanged while every
 * module becomes real geometry.
 *
 * It runs on the server (where it reads `public/models/corvette.bin` with `fs`)
 * and in the browser (where it fetches the same file once and caches it).  Until
 * the pack is available it returns `null` and callers fall back to the polygon
 * spec, so nothing ever crashes mid-hydration.
 */

import type { Face3D, FaceKind, V3 } from "./render3d";

export interface PackedPart {
  id: string;
  name: string;
  category: string;
  size: [number, number, number];
  bbox: { min: [number, number, number]; max: [number, number, number] };
  verts: number;
  tris: number;
  offset: number;
  bytes: number;
}

interface Pack {
  count: number;
  bytes: number;
  parts: PackedPart[];
  byId: Map<string, PackedPart>;
  bin: ArrayBuffer;
}

const PACK_BIN_URL = "/models/corvette.bin";
const PACK_JSON_URL = "/models/corvette.json";

let pack: Pack | null = null;
let pending: Promise<Pack | null> | null = null;
/** cache of decoded meshes, keyed by asset id */
const decoded = new Map<string, Decoded>();

interface Decoded {
  positions: Float32Array;
  indices: Uint16Array;
  normals: Float32Array;
  min: V3;
  max: V3;
}

const isServer = typeof window === "undefined";

async function loadPack(): Promise<Pack | null> {
  if (pack) return pack;
  if (pending) return pending;
  pending = (async () => {
    try {
      let manifestText: string;
      let bin: ArrayBuffer;
      if (isServer) {
        const [fs, path] = await Promise.all([
          import("node:fs"),
          import("node:path"),
        ]);
        const dir = path.join(process.cwd(), "public", "models");
        manifestText = fs.readFileSync(path.join(dir, "corvette.json"), "utf8");
        const buf = fs.readFileSync(path.join(dir, "corvette.bin"));
        bin = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      } else {
        const [mRes, bRes] = await Promise.all([
          fetch(PACK_JSON_URL),
          fetch(PACK_BIN_URL),
        ]);
        if (!mRes.ok || !bRes.ok) return null;
        manifestText = await mRes.text();
        bin = await bRes.arrayBuffer();
      }
      const raw = JSON.parse(manifestText) as { count: number; bytes: number; parts: PackedPart[] };
      const byId = new Map(raw.parts.map((p) => [p.id, p]));
      pack = { ...raw, byId, bin };
      return pack;
    } catch {
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Synchronous accessor for render paths that cannot await. */
export function packSync(): Pack | null {
  return pack;
}

/** Kick off loading; safe to call repeatedly. */
export function ensurePack(): Promise<Pack | null> {
  return loadPack();
}

/**
 * On the server the pack is read synchronously at import time so that the very
 * first `moduleSpec` call already has real geometry — the static export and the
 * SSR pass never see a single stand-in polygon.
 */
if (isServer) {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const pathMod = require("node:path") as typeof import("node:path");
    const dir = pathMod.join(process.cwd(), "public", "models");
    const raw = JSON.parse(fs.readFileSync(pathMod.join(dir, "corvette.json"), "utf8")) as {
      count: number;
      bytes: number;
      parts: PackedPart[];
    };
    const buf = fs.readFileSync(pathMod.join(dir, "corvette.bin"));
    const bin = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    pack = { ...raw, byId: new Map(raw.parts.map((q) => [q.id, q])), bin };
  } catch {
    pack = null;
  }
  if (!pack) void loadPack();
}

// --------------------------------------------------------------------------- //

function readU16(b: DataView, o: number) {
  return b.getUint16(o, true);
}

function decode(p: Pack, entry: PackedPart): Decoded | null {
  const hit = decoded.get(entry.id);
  if (hit) return hit;
  const view = new DataView(p.bin);
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
      positions[i * 3 + k] = min[k] + (readU16(view, q) / 65535) * span[k];
      q += 2;
    }
  }
  const indices = new Uint16Array(t * 3);
  for (let i = 0; i < t * 3; i++) {
    indices[i] = readU16(view, q);
    q += 2;
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
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = ny / len;
    normals[i * 3 + 2] = nz / len;
  }
  const out: Decoded = { positions, indices, normals, min, max };
  decoded.set(entry.id, out);
  return out;
}

export interface RealFaceOptions {
  /** the polygon spec's bounding box — the real mesh is fitted into it */
  fit: { min: V3; max: V3 };
  /** the box the asset was authored for, before it reaches the renderer */
  hull: [number, number, number];
  /** hue triple used for the plating */
  hull3: [number, number, number];
  hullDark3: [number, number, number];
  emissive3: [number, number, number];
  glow: number;
  /** quarter turns applied about Y before fitting (wings point outboard) */
  yawQuarters?: number;
  /** cap on how many triangles actually get drawn */
  maxTris?: number;
}

const LIGHT: V3 = [-0.45, 0.72, -0.55];
const RIM: V3 = [0.62, 0.18, 0.76];

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function toCss([r, g, b]: [number, number, number]) {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/**
 * Builds the `Face3D[]` for one module, in the polygon spec's own local frame.
 *
 * The real mesh keeps its true proportions: it is scaled uniformly about the
 * largest of the three fit axes, so a stubby booster stays stubby next to a long
 * habitation spine instead of every part being stretched to fill its slot.
 */
export function realFaces(assetId: string, opts: RealFaceOptions): Face3D[] | null {
  const p = packSync();
  if (!p) return null;
  const entry = p.byId.get(assetId);
  if (!entry) return null;
  const mesh = decode(p, entry);
  if (!mesh) return null;

  const { fit } = opts;
  const fitCentre: V3 = [
    (fit.min[0] + fit.max[0]) / 2,
    (fit.min[1] + fit.max[1]) / 2,
    (fit.min[2] + fit.max[2]) / 2,
  ];
  const fitSpan: V3 = [
    fit.max[0] - fit.min[0],
    fit.max[1] - fit.min[1],
    fit.max[2] - fit.min[2],
  ];
  const meshSpan: V3 = [
    mesh.max[0] - mesh.min[0],
    mesh.max[1] - mesh.min[1],
    mesh.max[2] - mesh.min[2],
  ];
  const meshCentre: V3 = [
    (mesh.min[0] + mesh.max[0]) / 2,
    (mesh.min[1] + mesh.max[1]) / 2,
    (mesh.min[2] + mesh.max[2]) / 2,
  ];

  const quarters = ((opts.yawQuarters ?? 0) % 4 + 4) % 4;
  const swap = quarters === 1 || quarters === 3;

  // Uniform scale from the dominant horizontal axis, so aspect ratios survive.
  const fitH = Math.max(fitSpan[0], fitSpan[2], 1e-6);
  const meshH = Math.max(swap ? meshSpan[2] : meshSpan[0], swap ? meshSpan[0] : meshSpan[2], 1e-6);
  const scale = fitH / meshH;

  const triCount = mesh.indices.length / 3;
  let order: number[];
  const maxTris = opts.maxTris ?? 420;
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
      scored.push([Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx), i]);
    }
    scored.sort((x, y) => y[0] - x[0]);
    order = scored.slice(0, maxTris).map((s) => s[1]);
  } else {
    order = Array.from({ length: triCount }, (_, i) => i);
  }

  const place = (i: number): V3 => {
    const x = (mesh.positions[i] - meshCentre[0]) * scale;
    const y = (mesh.positions[i + 1] - meshCentre[1]) * scale;
    const z = (mesh.positions[i + 2] - meshCentre[2]) * scale;
    let rx = x;
    let rz = z;
    for (let q = 0; q < quarters; q++) {
      const nx = -rz;
      rz = rx;
      rx = nx;
    }
    return [fitCentre[0] + rx, fitCentre[1] + y, fitCentre[2] + rz];
  };

  const faces: Face3D[] = [];
  for (const i of order) {
    const a = mesh.indices[i * 3] * 3;
    const b = mesh.indices[i * 3 + 1] * 3;
    const c = mesh.indices[i * 3 + 2] * 3;
    let nx = mesh.normals[i * 3];
    let ny = mesh.normals[i * 3 + 1];
    let nz = mesh.normals[i * 3 + 2];
    for (let q = 0; q < quarters; q++) {
      const tx = -nz;
      nz = nx;
      nx = tx;
    }
    const key = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    const rim = Math.max(0, nx * RIM[0] + ny * RIM[1] + nz * RIM[2]);
    const lit = 0.18 + 0.72 * key + 0.16 * Math.max(0, ny) + 0.22 * rim * rim;
    const base = mix(opts.hullDark3, opts.hull3, Math.min(1, lit));
    const rgb = mix(base, opts.emissive3, Math.max(0, rim * rim * opts.glow));
    const kind: FaceKind = opts.glow > 0.55 && rim > 0.9 ? "emissive" : "hull";
    faces.push({
      pts: [place(a), place(b), place(c)],
      rgb: [rgb[0], rgb[1], rgb[2]],
      kind,
    });
  }
  return faces;
}

export { toCss };
