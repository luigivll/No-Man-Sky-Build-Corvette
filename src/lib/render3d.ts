/**
 * render3d.ts — software 3D renderer for Corvette previews.
 *
 * Design goals (in order):
 *  1. Modules must CONNECT. Every module exposes mount sockets; the layout
 *     engine mates child sockets onto parent sockets, so nothing floats and
 *     wings/engines/guns sit exactly where the Workshop would snap them.
 *  2. It should look like the game: dark plating, emissive trim, glowing
 *     engines, long engine trails and a proper space backdrop.
 *
 * Pipeline: build -> spec (faces + sockets) -> attach -> world mesh -> rotate,
 * light, sort back-to-front, project to 2D polygons.
 *
 * Conventions: +X starboard, +Y up, +Z aft (the nose points at -Z).
 */

import { categoryById } from "./data";
import { expandParts } from "./build";
import { styleById, type FlourishId, type ShipStyle } from "./shipStyles";
import type { Build, Part, PartCategoryId } from "./types";

export type V3 = [number, number, number];
/** Row-major 3x3 */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export type FaceKind =
  | "hull"
  | "dark"
  | "light"
  | "emissive"
  | "glass"
  | "panel"
  | "trim"
  | "sail";

export interface Face3D {
  pts: V3[];
  rgb: [number, number, number];
  kind: FaceKind;
  opacity?: number;
}

export interface Socket {
  id: string;
  local: V3;
  /** outward direction of the mating face */
  dir: V3;
  kind:
    | "fore"
    | "aft"
    | "sideL"
    | "sideR"
    | "top"
    | "bottom"
    | "hardpoint"
    | "root"
    | "mount";
}

export interface ModuleSpec {
  faces: Face3D[];
  sockets: Socket[];
}

export interface PartMesh {
  /** stable instance id: "wing-osprey#1" (second Osprey in the build) */
  key: string;
  partId: string;
  partName: string;
  category: PartCategoryId;
  faces: Face3D[];
}

/** One placed module, with everything needed to write assembly instructions. */
export interface ModuleInstance {
  key: string;
  partId: string;
  partName: string;
  category: PartCategoryId;
  /** centre of the module in ship space */
  anchor: V3;
  /** part id of the module it is bolted to, or "hull" */
  parent: string;
  /** socket on the parent that it claimed */
  socket: string;
  gap: number;
}

export interface PlumeSpec {
  origin: V3;
  /** aft direction the trail fires along */
  dir: V3;
  radius: number;
  length: number;
  rgb: [number, number, number];
  ring?: { radius: number; rgb: [number, number, number] };
}

export interface AttachmentRecord {
  child: string;
  parent: string;
  socket: string;
  /** distance between mating sockets; must be ~0 for a legal fit */
  gap: number;
}

export interface ShipMesh {
  parts: PartMesh[];
  plumes: PlumeSpec[];
  bounds: { min: V3; max: V3 };
  groundY: number;
  moduleCount: number;
  style: ShipStyle;
  attachments: AttachmentRecord[];
  /** every placed module, in build order, keyed for step-by-step assembly */
  modules: ModuleInstance[];
  /** scene dressing generated from the style */
  flourishes: { kind: FlourishId; faces: Face3D[] }[];
  hasShield: boolean;
}

/* ------------------------------------------------------------------ */
/* math                                                               */
/* ------------------------------------------------------------------ */

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];
const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (v: V3): number => Math.hypot(v[0], v[1], v[2]);
const norm = (v: V3): V3 => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

function matApply(m: Mat3, v: V3): V3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function matMul(a: Mat3, b: Mat3): Mat3 {
  const out = new Array(9).fill(0) as number[];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out as Mat3;
}

function fromAxisAngle(axis: V3, angle: number): Mat3 {
  const [x, y, z] = norm(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}

/** Shortest-arc rotation taking `from` onto `to`. */
function rotationBetween(from: V3, to: V3): Mat3 {
  const a = norm(from);
  const b = norm(to);
  const d = Math.max(-1, Math.min(1, dot(a, b)));
  if (d > 0.999999) return IDENTITY;
  if (d < -0.999999) {
    // 180 degrees: pick any perpendicular axis
    const helper: V3 = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return fromAxisAngle(norm(cross(a, helper)), Math.PI);
  }
  const axis = cross(a, b);
  return fromAxisAngle(axis, Math.acos(d));
}

interface Transform {
  pos?: V3;
  rot?: Mat3;
  scale?: V3;
}

function transformFaces(faces: Face3D[], t: Transform): Face3D[] {
  const rot = t.rot ?? IDENTITY;
  const s = t.scale ?? [1, 1, 1];
  const pos = t.pos ?? [0, 0, 0];
  return faces.map((face) => ({
    ...face,
    pts: face.pts.map((p) => {
      const scaled: V3 = [p[0] * s[0], p[1] * s[1], p[2] * s[2]];
      return add(matApply(rot, scaled), pos);
    }),
  }));
}

/**
 * Mirroring flips face winding, which would flip the shading normals.
 * Re-point every face away from the solid's centre.
 */
function orientOutward(faces: Face3D[], centre: V3): Face3D[] {
  return faces.map((face) => {
    const c: V3 = [
      (face.pts[0][0] + face.pts[1][0] + face.pts[2][0] + (face.pts[3]?.[0] ?? face.pts[0][0])) / 4,
      (face.pts[0][1] + face.pts[1][1] + face.pts[2][1] + (face.pts[3]?.[1] ?? face.pts[0][1])) / 4,
      (face.pts[0][2] + face.pts[1][2] + face.pts[2][2] + (face.pts[3]?.[2] ?? face.pts[0][2])) / 4,
    ];
    const n = norm(cross(sub(face.pts[1], face.pts[0]), sub(face.pts[2], face.pts[0])));
    return dot(n, sub(c, centre)) >= 0 ? face : { ...face, pts: [...face.pts].reverse() };
  });
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function scaleRgb(rgb: [number, number, number], k: number): [number, number, number] {
  return [
    Math.max(0, Math.min(255, Math.round(rgb[0] * k))),
    Math.max(0, Math.min(255, Math.round(rgb[1] * k))),
    Math.max(0, Math.min(255, Math.round(rgb[2] * k))),
  ];
}

export const rgbCss = (rgb: [number, number, number], alpha = 1): string =>
  alpha >= 1 ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

/* ------------------------------------------------------------------ */
/* primitives                                                         */
/* ------------------------------------------------------------------ */

type Corners8 = [V3, V3, V3, V3, V3, V3, V3, V3];

function hexahedron(c: Corners8, rgb: [number, number, number], kind: FaceKind): Face3D[] {
  const centre: V3 = [
    (c[0][0] + c[2][0] + c[4][0] + c[6][0]) / 4,
    (c[0][1] + c[2][1] + c[4][1] + c[6][1]) / 4,
    (c[0][2] + c[2][2] + c[4][2] + c[6][2]) / 4,
  ];
  const quads: V3[][] = [
    [c[0], c[1], c[2], c[3]],
    [c[4], c[5], c[6], c[7]],
    [c[0], c[1], c[5], c[4]],
    [c[2], c[3], c[7], c[6]],
    [c[0], c[3], c[7], c[4]],
    [c[1], c[2], c[6], c[5]],
  ];
  return quads.map((pts) => {
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const mid: V3 = [
      (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4,
      (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4,
      (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4,
    ];
    const outward = dot(n, sub(mid, centre)) >= 0;
    return { pts: outward ? pts : [...pts].reverse(), rgb, kind };
  });
}

interface BoxOpts {
  taperFrontW?: number;
  taperFrontH?: number;
  taperTopW?: number;
  taperBackW?: number;
  kind?: FaceKind;
}

/** Box centred on the origin: w along X, h along Y, d along Z (-Z = nose). */
function box(w: number, h: number, d: number, rgb: [number, number, number], opts: BoxOpts = {}): Face3D[] {
  const fw = (w * (opts.taperFrontW ?? 1)) / 2;
  const bw = (w * (opts.taperBackW ?? 1)) / 2;
  const twF = fw * (opts.taperTopW ?? 1);
  const twB = bw * (opts.taperTopW ?? 1);
  const hh = h / 2;
  const hhF = (h * (opts.taperFrontH ?? 1)) / 2;
  const hd = d / 2;
  const c: Corners8 = [
    [-fw, -hhF, -hd],
    [fw, -hhF, -hd],
    [bw, -hh, hd],
    [-bw, -hh, hd],
    [-twF, hhF, -hd],
    [twF, hhF, -hd],
    [twB, hh, hd],
    [-twB, hh, hd],
  ];
  return hexahedron(c, rgb, opts.kind ?? "hull");
}

/** Cylinder along Z, centred on the origin. */
function cylinder(
  r: number,
  length: number,
  rgb: [number, number, number],
  opts: { seg?: number; kind?: FaceKind; capFront?: [number, number, number]; capBack?: [number, number, number] } = {},
): Face3D[] {
  const seg = opts.seg ?? 16;
  const faces: Face3D[] = [];
  const hz = length / 2;
  const ring = (z: number, radius: number): V3[] =>
    Array.from({ length: seg }, (_, i) => {
      const a = (i / seg) * Math.PI * 2;
      return [Math.cos(a) * radius, Math.sin(a) * radius, z];
    });
  const front = ring(-hz, r);
  const back = ring(hz, r);
  for (let i = 0; i < seg; i += 1) {
    const j = (i + 1) % seg;
    faces.push({ pts: [front[i], front[j], back[j], back[i]], rgb, kind: opts.kind ?? "hull" });
  }
  if (opts.capFront) faces.push({ pts: front, rgb: opts.capFront, kind: "emissive" });
  if (opts.capBack) faces.push({ pts: [...back].reverse(), rgb: opts.capBack, kind: "emissive" });
  return faces;
}

/** Engine bell: cone flaring toward +Z with a glowing hollow throat. */
function bell(
  r: number,
  length: number,
  rgb: [number, number, number],
  glow: [number, number, number],
  seg = 16,
): Face3D[] {
  const faces: Face3D[] = [];
  const apex: V3 = [0, 0, 0];
  const base: V3[] = Array.from({ length: seg }, (_, i) => {
    const a = (i / seg) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r, length];
  });
  for (let i = 0; i < seg; i += 1) {
    const j = (i + 1) % seg;
    faces.push({ pts: [apex, base[i], base[j]], rgb, kind: "hull" });
  }
  faces.push({ pts: [...base].reverse(), rgb: glow, kind: "emissive" });
  const inner = base.map((p) => [p[0] * 0.52, p[1] * 0.52, p[2] - 0.04] as V3);
  faces.push({ pts: [...inner].reverse(), rgb: scaleRgb(glow, 1.1), kind: "emissive" });
  return faces;
}

/** Flat annulus (thruster ring) facing +Z. */
function annulus(
  rInner: number,
  rOuter: number,
  rgb: [number, number, number],
  opts: { seg?: number; kind?: FaceKind; z?: number } = {},
): Face3D[] {
  const seg = opts.seg ?? 18;
  const faces: Face3D[] = [];
  const z = opts.z ?? 0;
  for (let i = 0; i < seg; i += 1) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a: number, r: number): V3 => [Math.cos(a) * r, Math.sin(a) * r, z];
    faces.push({
      pts: [p(a0, rInner), p(a1, rInner), p(a1, rOuter), p(a0, rOuter)],
      rgb,
      kind: opts.kind ?? "emissive",
    });
  }
  return faces;
}

function dome(r: number, rgb: [number, number, number], opts: { seg?: number; rings?: number; kind?: FaceKind } = {}): Face3D[] {
  const seg = opts.seg ?? 14;
  const rings = opts.rings ?? 3;
  const faces: Face3D[] = [];
  const at = (ri: number, si: number): V3 => {
    const phi = (ri / rings) * (Math.PI / 2);
    const theta = (si / seg) * Math.PI * 2;
    return [Math.cos(phi) * Math.cos(theta) * r, Math.sin(phi) * r, Math.cos(phi) * Math.sin(theta) * r];
  };
  for (let ri = 0; ri < rings; ri += 1) {
    for (let si = 0; si < seg; si += 1) {
      faces.push({ pts: [at(ri, si), at(ri + 1, si), at(ri + 1, si + 1), at(ri, si + 1)], rgb, kind: opts.kind ?? "hull" });
    }
  }
  return faces;
}

/**
 * Aerofoil plate: root chord at x=0, tip at x=span, with sweep (aft offset)
 * and dihedral (vertical rise). Used for every wing, fin and stabiliser.
 */
function foil(
  span: number,
  chord: number,
  thickness: number,
  sweep: number,
  dihedral: number,
  rgb: [number, number, number],
  opts: { taper?: number; kind?: FaceKind; twist?: number } = {},
): Face3D[] {
  const taper = opts.taper ?? 0.7;
  const tipChord = chord * taper;
  const lift = span * Math.tan(dihedral);
  const ht = thickness / 2;
  const rootFront = -chord / 2;
  const rootBack = chord / 2;
  const tipFront = sweep - tipChord / 2;
  const tipBack = sweep + tipChord / 2;

  const top: V3[] = [
    [0, ht, rootFront],
    [span, lift + ht * 0.4, tipFront],
    [span, lift + ht * 0.4, tipBack],
    [0, ht, rootBack],
  ];
  const bottom: V3[] = [
    [0, -ht, rootBack],
    [span, lift - ht * 0.4, tipBack],
    [span, lift - ht * 0.4, tipFront],
    [0, -ht, rootFront],
  ];
  return [
    { pts: top, rgb, kind: opts.kind ?? "hull" },
    { pts: bottom, rgb: scaleRgb(rgb, 0.7), kind: opts.kind ?? "hull" },
    { pts: [[0, ht, rootFront], [span, lift + ht * 0.4, tipFront], [span, lift - ht * 0.4, tipFront], [0, -ht, rootFront]], rgb: scaleRgb(rgb, 0.82), kind: opts.kind ?? "hull" },
    { pts: [[0, ht, rootBack], [span, lift + ht * 0.4, tipBack], [span, lift - ht * 0.4, tipBack], [0, -ht, rootBack]], rgb: scaleRgb(rgb, 0.82), kind: opts.kind ?? "hull" },
    { pts: [[span, lift + ht * 0.4, tipFront], [span, lift + ht * 0.4, tipBack], [span, lift - ht * 0.4, tipBack], [span, lift - ht * 0.4, tipFront]], rgb: scaleRgb(rgb, 0.9), kind: opts.kind ?? "hull" },
  ];
}

/** Thin emissive strip used for trim, veins and plating lights. */
function strip(w: number, h: number, d: number, rgb: [number, number, number], kind: FaceKind = "trim"): Face3D[] {
  return box(w, h, d, rgb, { kind });
}

/* ------------------------------------------------------------------ */
/* module specs: geometry + sockets                                   */
/* ------------------------------------------------------------------ */

interface SpecCtx {
  /** hull pod width, used to keep modules proportional to the hull */
  podWidth: number;
  halfHeight: number;
  style: ShipStyle;
  density: "low" | "high";
}

interface SpecOpts {
  legLength?: number;
  reactorLength?: number;
  engineScale?: number;
}

/** Emissive accent colour for a module in the current style. */
function glowOf(style: ShipStyle, category: PartCategoryId, scale = 1): [number, number, number] {
  const base = hexToRgb(style.emissive);
  const accent = hexToRgb(categoryById[category]?.accent ?? "#38bdf8");
  return scaleRgb(mixRgb(base, accent, 0.25), scale);
}

function moduleSpec(part: Part, ctx: SpecCtx, opts: SpecOpts = {}): ModuleSpec {
  const { style, podWidth, halfHeight } = ctx;
  const t = ctx.density === "low" ? 12 : 18;
  const hull: [number, number, number] = hexToRgb(style.hullBase);
  const dark: [number, number, number] = hexToRgb(style.hullDark);
  const glow = glowOf(style, part.category);
  const profile = part.geometry.profile;
  const w = podWidth;
  const accentTint = mixRgb(hull, hexToRgb(categoryById[part.category]?.accent ?? "#38bdf8"), 0.12);

  switch (part.category) {
    case "cockpit": {
      if (profile === "arrowhead") {
        const d = 2.6;
        return {
          faces: [
            ...box(w * 1.0, halfHeight * 1.6, d, accentTint, { taperFrontW: 0.3, taperFrontH: 0.5, taperTopW: 0.8 }),
            ...strip(0.1, 0.06, d * 0.5, glow),
            ...transformFaces(box(w * 0.42, 0.16, 1.1, hexToRgb(style.emissive).map((c) => c * 0.35) as [number, number, number], { taperFrontW: 0.7, kind: "glass" }), { pos: [0, halfHeight * 0.5, -0.5] }),
          ],
          sockets: [
            { id: "aft", local: [0, 0, d / 2], dir: [0, 0, 1], kind: "aft" },
            { id: "top", local: [0, halfHeight * 0.8, 0], dir: [0, 1, 0], kind: "top" },
          ],
        };
      }
      if (profile === "offset-dome") {
        const d = 2.3;
        const bridgeX = w * 0.3;
        return {
          faces: [
            ...box(w * 1.05, halfHeight * 1.4, d, accentTint, { taperFrontW: 0.72, taperTopW: 0.86 }),
            ...transformFaces(
              [
                ...cylinder(0.42, 0.5, accentTint, { seg: t }),
                ...transformFaces(dome(0.42, mixRgb(accentTint, glow, 0.25), { seg: t, rings: 3, kind: "glass" }), {
                  rot: fromAxisAngle([1, 0, 0], Math.PI / 2),
                  pos: [0, 0, 0.25],
                }),
              ],
              { pos: [bridgeX, halfHeight * 0.75, -0.2] },
            ),
            ...transformFaces(strip(w * 0.5, 0.06, 0.9, glow), { pos: [0, halfHeight * 0.55, -0.4] }),
          ],
          sockets: [
            { id: "aft", local: [0, 0, d / 2], dir: [0, 0, 1], kind: "aft" },
            { id: "top", local: [bridgeX, halfHeight * 0.9, -0.2], dir: [0, 1, 0], kind: "top" },
          ],
        };
      }
      // blunt-block dropship deck
      const d = 2.5;
      return {
        faces: [
          ...box(w * 1.12, halfHeight * 1.9, d, accentTint, { taperFrontW: 0.82, taperTopW: 0.92 }),
          ...box(w * 1.04, 0.26, d * 0.5, dark, { taperFrontW: 0.86 }),
          ...strip(w * 0.7, 0.06, 1.0, glow),
          ...transformFaces(box(w * 0.5, 0.2, 1.0, dark, { kind: "glass" }), { pos: [0, halfHeight * 0.75, -0.45] }),
        ],
        sockets: [
          { id: "aft", local: [0, 0, d / 2], dir: [0, 0, 1], kind: "aft" },
          { id: "top", local: [0, halfHeight * 0.95, 0], dir: [0, 1, 0], kind: "top" },
        ],
      };
    }

    case "habitation": {
      const isWalkway = part.cargoSlots === 1;
      const pw = w * (isWalkway ? 0.66 : 1.0);
      const ph = halfHeight * (isWalkway ? 1.2 : 2);
      const pd = w * (isWalkway ? 0.9 : 1.3);
      const faces: Face3D[] = [
        ...box(pw, ph, pd, accentTint, { taperTopW: 0.9 }),
        ...strip(pw * 0.78, 0.05, pd * 0.06, glow),
        ...transformFaces(strip(pd * 0.62, 0.05, 0.06, glow), { pos: [pw * 0.5, 0, 0], rot: fromAxisAngle([0, 1, 0], Math.PI / 2).map((n) => n) as Mat3 }),
      ];
      if (!isWalkway) {
        faces.push(...transformFaces(box(pw * 1.04, 0.1, pd * 0.16, dark), { pos: [0, ph * 0.42, 0] }));
      }
      return {
        faces,
        sockets: [
          { id: "sideR", local: [pw / 2, 0, 0], dir: [1, 0, 0], kind: "sideR" },
          { id: "sideL", local: [-pw / 2, 0, 0], dir: [-1, 0, 0], kind: "sideL" },
          { id: "fore", local: [0, 0, -pd / 2], dir: [0, 0, -1], kind: "fore" },
          { id: "aft", local: [0, 0, pd / 2], dir: [0, 0, 1], kind: "aft" },
          { id: "top", local: [0, ph / 2, 0], dir: [0, 1, 0], kind: "top" },
          { id: "bottom", local: [0, -ph / 2, 0], dir: [0, -1, 0], kind: "bottom" },
        ],
      };
    }

    case "reactor": {
      const rW = 0.5 + part.geometry.span * 0.02;
      const length = opts.reactorLength ?? w * 1.05;
      return {
        faces: [
          // wedge housing with recessed glow slots - matches how the Workshop
          // reactor modules actually sit on the hull deck
          ...box(rW, rW * 0.72, length, scaleRgb(accentTint, 0.9), {
            taperTopW: 0.78,
            taperBackW: 0.86,
          }),
          ...box(rW * 1.04, 0.12, length * 0.9, dark),
          ...transformFaces(strip(rW * 0.5, 0.05, length * 0.86, glow, "trim"), { pos: [0, rW * 0.36, 0] }),
          ...transformFaces(strip(rW * 0.5, 0.05, length * 0.5, glow, "trim"), { pos: [0, -rW * 0.38, 0] }),
          ...transformFaces(annulus(rW * 0.24, rW * 0.42, glow, { seg: t }), { pos: [0, rW * 0.2, length / 2 + 0.01] }),
        ],
        sockets: [{ id: "mount", local: [0, -rW * 0.36, 0], dir: [0, -1, 0], kind: "mount" }],
      };
    }

    case "access": {
      const hidden = profile === "hidden";
      const pw = w * 0.88;
      const ph = 0.5;
      const pd = w * 0.85;
      const inner: [number, number, number] = hidden ? dark : [12, 14, 18];
      return {
        faces: [
          ...box(pw, ph, pd, accentTint, { taperTopW: 0.92, kind: hidden ? "hull" : "hull" }),
          ...transformFaces(box(pw * 0.62, 0.22, pd * 0.8, inner, { kind: "dark" }), { pos: [0, -ph * 0.42, 0] }),
          ...strip(pw * 0.9, 0.05, 0.12, glow),
        ],
        sockets: [{ id: "mount", local: [0, ph / 2, 0], dir: [0, 1, 0], kind: "mount" }],
      };
    }

    case "engine-main": {
      const k = opts.engineScale ?? 1;
      const r = (0.42 + part.geometry.span * 0.028) * k;
      const length = w * 1.1 * k;
      return {
        faces: [
          ...cylinder(r, length, accentTint, { seg: t }),
          ...bell(r * 1.15, length * 0.45, scaleRgb(accentTint, 0.8), glow, t),
          ...cylinder(r * 0.9, 0.3, dark, { seg: t }),
          ...transformFaces(annulus(r * 0.95, r * 1.08, dark, { seg: t, kind: "dark" }), { pos: [0, 0, -length / 2] }),
        ],
        sockets: [{ id: "mount", local: [0, 0, -length / 2 - 0.12], dir: [0, 0, -1], kind: "mount" }],
      };
    }

    case "engine-light": {
      const r = 0.19 + part.geometry.span * 0.016;
      const length = w * 0.62;
      return {
        faces: [
          ...cylinder(r, length, accentTint, { seg: Math.max(10, t - 4) }),
          ...bell(r * 1.16, length * 0.5, scaleRgb(accentTint, 0.8), glow, Math.max(10, t - 4)),
        ],
        sockets: [{ id: "mount", local: [0, 0, -length / 2 - 0.08], dir: [0, 0, -1], kind: "mount" }],
      };
    }

    case "weapon": {
      const barrel = profile === "turret" || profile === "emitter-strip" ? 0.85 : 1.45;
      const r = profile === "turret" ? 0.2 : 0.1;
      const faces: Face3D[] = [
        ...box(0.38, 0.24, 0.62, scaleRgb(accentTint, 0.88)),
        ...transformFaces(cylinder(r, barrel, scaleRgb(accentTint, 0.7), { seg: 10 }), { pos: [0, 0.06, -barrel / 2 - 0.2] }),
      ];
      if (profile === "turret" || profile === "blade-emitter" || profile === "rifle") {
        faces.push(...transformFaces(cylinder(r * 1.7, 0.2, dark, { seg: 10, capFront: glow }), { pos: [0, 0.18, 0] }));
      }
      faces.push(...transformFaces(strip(0.3, 0.04, 0.36, glow), { pos: [0, 0.13, 0.05] }));
      return {
        faces,
        sockets: [{ id: "mount", local: [0, -0.12, 0], dir: [0, -1, 0], kind: "mount" }],
      };
    }

    case "shield": {
      return {
        faces: [
          ...cylinder(0.22, 0.5, accentTint, { seg: 12, capFront: glow, capBack: glow }),
          ...transformFaces(annulus(0.3, 0.42, glow, { seg: 14 }), { pos: [0, 0, 0.26] }),
        ],
        sockets: [{ id: "mount", local: [0, -0.22, 0], dir: [0, -1, 0], kind: "mount" }],
      };
    }

    case "landing": {
      const isPad = profile === "pad" || profile === "thruster-pad";
      const legLen = opts.legLength ?? (isPad ? 0.5 : 1.1);
      const strut = box(0.2, legLen, 0.24, scaleRgb(accentTint, 0.92));
      const foot = isPad
        ? cylinder(0.32, 0.16, scaleRgb(accentTint, 0.8), { seg: 12, capBack: glow })
        : box(0.56, 0.14, 0.7, scaleRgb(accentTint, 0.8));
      return {
        faces: [
          ...transformFaces(strut, { pos: [0, -legLen / 2, 0], rot: fromAxisAngle([0, 0, 1], 0.12) }),
          ...transformFaces(box(0.28, 0.16, 0.32, dark), { pos: [0.05, -legLen + 0.05, 0] }),
          ...transformFaces(foot, { pos: [0.08, -legLen, 0] }),
          ...transformFaces(strip(0.26, 0.04, 0.3, glow), { pos: [0.08, -legLen - 0.06, 0] }),
        ],
        sockets: [{ id: "mount", local: [0, 0, 0], dir: [0, 1, 0], kind: "mount" }],
      };
    }

    case "wing": {
      const span = 1.5 + part.geometry.span * 0.15;
      const chord = 1.0 + part.geometry.span * 0.06;

      if (profile === "winglet" || profile === "vent-plate" || profile === "fairing" || profile === "cowling") {
        // plating: a slab that slides over the hull flank
        const depth = 1.1 + part.geometry.span * 0.12;
        const height = 0.36 + part.geometry.span * 0.05;
        const thickness = 0.22;
        return {
          faces: [
            ...box(thickness, height, depth, accentTint, { taperTopW: 0.7 }),
            ...transformFaces(strip(0.03, 0.05, depth * 0.7, glow), { pos: [thickness / 2 + 0.01, height * 0.2, 0] }),
          ],
          sockets: [{ id: "mount", local: [-thickness / 2, 0, 0], dir: [-1, 0, 0], kind: "mount" }],
        };
      }

      const dihedral =
        profile === "s-foil" ? 0.42 : profile === "angled" ? 0.3 : profile === "box" ? 0.08 : profile === "swept" ? 0.16 : 0.14;
      const sweep = profile === "s-foil" ? 0.4 : profile === "swept" ? 0.5 : profile === "box" ? 0.05 : 0.2;
      const thickness = profile === "box" ? 0.3 : profile === "s-foil" ? 0.14 : 0.18;
      const taper = profile === "s-foil" ? 0.55 : profile === "box" ? 0.85 : 0.68;
      const chordUse = profile === "box" ? chord * 1.2 : profile === "s-foil" ? chord * 0.85 : chord;

      const foilFaces = foil(span, chordUse, thickness, sweep, dihedral, accentTint, { taper });
      const edge: Face3D[] = [
        // emissive leading-edge light, exactly like the in-game module trim
        ...transformFaces(strip(0.06, 0.05, chordUse * 0.7, glow), { pos: [span * 0.55, span * Math.tan(dihedral) * 0.55 + thickness * 0.6, sweep * 0.55] }),
      ];

      return {
        faces: [...foilFaces, ...edge],
        sockets: [
          { id: "root", local: [0, 0, 0], dir: [-1, 0, 0], kind: "root" },
          { id: "hardpoint-inner", local: [span * 0.55, thickness * 0.6, sweep * 0.25], dir: [0, 1, 0], kind: "hardpoint" },
          { id: "hardpoint-outer", local: [span * 0.86, thickness * 0.4, sweep * 0.75], dir: [0, 1, 0], kind: "hardpoint" },
        ],
      };
    }

    default:
      return { faces: [...box(1, 1, 1, accentTint)], sockets: [] };
  }
}

/* ------------------------------------------------------------------ */
/* socket plumbing                                                    */
/* ------------------------------------------------------------------ */

interface PlacedSocket {
  id: string;
  kind: Socket["kind"];
  pos: V3;
  dir: V3;
  owner: string;
  /** sorted order helper for choosing sockets predictably */
  order: number;
  taken: boolean;
}

function specToWorld(spec: ModuleSpec, transform: Transform): { faces: Face3D[]; sockets: PlacedSocket[] } {
  const rot = transform.rot ?? IDENTITY;
  const s = transform.scale ?? [1, 1, 1];
  const pos = transform.pos ?? [0, 0, 0];
  const mapPoint = (p: V3): V3 => add(matApply(rot, [p[0] * s[0], p[1] * s[1], p[2] * s[2]]), pos);
  let faces = spec.faces.map((face) => ({ ...face, pts: face.pts.map(mapPoint) }));
  // mirrored scales flip winding: restore outward normals
  if (s[0] * s[1] * s[2] < 0) {
    const centre: V3 = [pos[0], pos[1], pos[2]];
    faces = orientOutward(faces, centre);
  }
  const sockets: PlacedSocket[] = spec.sockets.map((socket, index) => {
    const dirScaled: V3 = [socket.dir[0] * s[0], socket.dir[1] * s[1], socket.dir[2] * s[2]];
    return {
      id: socket.id,
      kind: socket.kind,
      pos: mapPoint(socket.local),
      dir: norm(matApply(rot, dirScaled)),
      owner: "",
      order: index,
      taken: false,
    };
  });
  return { faces, sockets };
}

/** Compute the transform that mates `childSocket` onto a parent socket. */
function attachTransform(
  spec: ModuleSpec,
  childSocketId: string,
  targetPos: V3,
  targetDir: V3,
  scale: V3 = [1, 1, 1],
  twist = 0,
): { transform: Transform; gap: number } {
  const socket = spec.sockets.find((s) => s.id === childSocketId) ?? spec.sockets[0];
  if (!socket) return { transform: { pos: targetPos }, gap: 0 };

  const desiredChildDir: V3 = norm(neg(targetDir));
  let rot = rotationBetween(socket.dir, desiredChildDir);
  if (twist !== 0) rot = matMul(fromAxisAngle(desiredChildDir, twist), rot);

  const scaledLocal: V3 = [socket.local[0] * scale[0], socket.local[1] * scale[1], socket.local[2] * scale[2]];
  const rotated = matApply(rot, scaledLocal);
  const pos = sub(targetPos, rotated);
  const placed = add(rotated, pos);
  return { transform: { pos, rot, scale }, gap: len(sub(placed, targetPos)) };
}

/** Mean vertex of a part's faces - good enough to describe where it sits. */
function centroidOf(faces: Face3D[]): V3 {
  if (faces.length === 0) return [0, 0, 0];
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const face of faces) {
    for (const p of face.pts) {
      x += p[0];
      y += p[1];
      z += p[2];
      n += 1;
    }
  }
  return n === 0 ? [0, 0, 0] : [x / n, y / n, z / n];
}

/* ------------------------------------------------------------------ */
/* build -> scene                                                     */
/* ------------------------------------------------------------------ */

export interface BuildMeshOptions {
  style?: string | ShipStyle;
}

export function resolveStyle(
  option: string | ShipStyle | undefined,
  seed = 1,
): ShipStyle {
  if (!option) return styleById("corvette", seed);
  return typeof option === "string" ? styleById(option, seed) : option;
}

export function buildShipMesh(build: Build, options: BuildMeshOptions = {}): ShipMesh {
  const style = resolveStyle(options.style);
  const all = expandParts(build);
  const moduleCount = all.length;
  const density: "low" | "high" = moduleCount > 60 ? "low" : "high";

  const cockpits = all.filter((p) => p.category === "cockpit");
  const habs = all.filter((p) => p.category === "habitation" && p.cargoSlots === 3);
  const walkways = all.filter((p) => p.category === "habitation" && p.cargoSlots === 1);
  const reactors = all.filter((p) => p.category === "reactor");
  const bays = all.filter((p) => p.category === "access");
  const mains = all.filter((p) => p.category === "engine-main");
  const lights = all.filter((p) => p.category === "engine-light");
  const weapons = all.filter((p) => p.category === "weapon");
  const gears = all.filter((p) => p.category === "landing");
  const wings = all.filter((p) => p.category === "wing" && p.geometry.mount !== "hull");
  const platings = all.filter((p) => p.category === "wing" && p.geometry.mount === "hull");
  const shields = all.filter((p) => p.category === "shield");

  const podWidth = habs.length > 0 ? 1.15 + Math.max(...habs.map((h) => h.geometry.span)) * 0.1 : 1.5;
  const halfHeight = 0.46;
  const ctx: SpecCtx = { podWidth, halfHeight, style, density };

  const parts: PartMesh[] = [];
  const plumes: PlumeSpec[] = [];
  const attachments: AttachmentRecord[] = [];
  const flourishFaces: { kind: FlourishId; faces: Face3D[] }[] = [];

  /** hull-side and deck sockets, allocated first-come-first-served */
  const free: PlacedSocket[] = [];
  let socketSeq = 0;
  const addSocket = (kind: Socket["kind"], pos: V3, dir: V3, owner: string) => {
    free.push({ id: `hull-${kind}-${socketSeq}`, kind, pos, dir, owner, order: socketSeq, taken: false });
    socketSeq += 1;
  };
  const claim = (
    kind: Socket["kind"],
    pick: (candidates: PlacedSocket[]) => PlacedSocket | undefined,
  ): PlacedSocket | undefined => {
    const candidates = free.filter((s) => !s.taken && s.kind === kind);
    const chosen = pick(candidates);
    if (chosen) chosen.taken = true;
    return chosen;
  };

  const modules: ModuleInstance[] = [];
  const instanceSeq = new Map<string, number>();
  const push = (part: Part, faces: Face3D[]) => {
    if (faces.length === 0) return;
    const n = instanceSeq.get(part.id) ?? 0;
    instanceSeq.set(part.id, n + 1);
    const key = `${part.id}#${n}`;
    parts.push({ key, partId: part.id, partName: part.name, category: part.category, faces });
    modules.push({
      key,
      partId: part.id,
      partName: part.name,
      category: part.category,
      anchor: centroidOf(faces),
      parent: "hull",
      socket: "",
      gap: 0,
    });
  };

  /* ---- 1. hull pods on a spiral footprint -------------------------- */
  const FOOTPRINT: [number, number][] = [
    [0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0], [1, -1], [0, 1], [-1, 1], [1, 1],
    [-2, 0], [-2, -1], [2, 0], [2, -1], [-2, 1], [2, 1], [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2],
  ];
  const stepX = podWidth;
  const stepZ = podWidth * 1.04;

  const placedHabs = habs.map((hab, index) => {
    const [cx, cz] = FOOTPRINT[index % FOOTPRINT.length];
    return {
      hab,
      x: cx * stepX,
      z: cz * stepZ,
      rot: fromAxisAngle([0, 1, 0], Math.abs(cx + cz) % 2 === 1 ? Math.PI / 2 : 0),
    };
  });

  const xs = placedHabs.map((h) => h.x);
  const zs = placedHabs.map((h) => h.z);
  let xMin = xs.length ? Math.min(...xs) : 0;
  let xMax = xs.length ? Math.max(...xs) : 0;
  let zFront = zs.length ? Math.min(...zs) : 0;
  let zBack = zs.length ? Math.max(...zs) : 0;
  let hullLen = habs.length * 0;

  for (const { hab, x, z, rot } of placedHabs) {
    const spec = moduleSpec(hab, ctx);
    const world = specToWorld(spec, { pos: [x, 0, z], rot });
    push(hab, world.faces);
  }

  const podDepth = podWidth * 1.3;
  const podHalfDepth = podDepth / 2;
  // Walkways extend the hull aft on the centreline, so they are part of the body
  const walkwayLen = podWidth * 0.9;
  let walkwayTailZ = zBack;
  walkways.forEach((walkway, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const spread = walkways.length === 1 ? 0 : (col === 0 ? -1 : 1) * podWidth * 0.42;
    const z = zBack + podHalfDepth + walkwayLen * (0.55 + row * 0.95);
    walkwayTailZ = Math.max(walkwayTailZ, z);
    const spec = moduleSpec(walkway, ctx);
    push(walkway, specToWorld(spec, { pos: [spread, 0, z] }).faces);
  });

  const hullFront = zFront - podHalfDepth;
  const hullBack = walkways.length > 0 ? walkwayTailZ + walkwayLen / 2 : zBack + podHalfDepth;
  const halfWidth = Math.max(
    0.75,
    (xMax - xMin) / 2 + podWidth * 0.58,
  );
  const bodyLength = hullBack - hullFront;

  /* ---- 2. hull slab + deck (dressing that ties pods together) ------- */
  const hullColour = hexToRgb(style.hullBase);
  const darkColour = hexToRgb(style.hullDark);
  const glowColour = hexToRgb(style.emissive);
  const centreX = (xMin + xMax) / 2;
  const centreZ = (hullFront + hullBack) / 2;

  if (habs.length >= 2) {
    const plateW = halfWidth * 2;
    const plateD = bodyLength;
    const plateRgb = mixRgb(hullColour, [0, 0, 0], 0.3);
    // main slab
    push(habs[0], transformFaces(box(plateW, halfHeight * 2, plateD, plateRgb, { taperTopW: 0.9 }), {
      pos: [centreX, 0, centreZ],
    }));
    // inset dorsal deck
    push(habs[0], transformFaces(box(plateW * 0.86, 0.1, plateD * 0.9, scaleRgb(plateRgb, 1.16), { taperTopW: 0.94 }), {
      pos: [centreX, halfHeight + 0.04, centreZ],
    }));
    // centre spine rail
    push(habs[0], transformFaces(box(plateW * 0.14, 0.12, plateD * 0.96, scaleRgb(plateRgb, 1.24)), {
      pos: [centreX, halfHeight + 0.09, centreZ],
    }));
    // glowing rim strips along both flanks (the in-game module trim look)
    for (const side of [-1, 1] as const) {
      push(habs[0], transformFaces(strip(0.05, 0.07, plateD * 0.86, glowColour, "emissive"), {
        pos: [centreX + side * (plateW / 2 + 0.01), 0.06, centreZ],
      }));
      push(habs[0], transformFaces(strip(0.04, 0.05, plateD * 0.7, glowColour, "emissive"), {
        pos: [centreX + side * (plateW / 2 + 0.01), -halfHeight * 0.7, centreZ],
      }));
    }
    // ventral keel
    push(habs[0], transformFaces(box(plateW * 0.4, 0.12, plateD * 0.9, scaleRgb(plateRgb, 0.8)), {
      pos: [centreX, -halfHeight - 0.05, centreZ],
    }));
  }

  /* ---- 3. hull sockets -------------------------------------------- */
  const deckRgb = mixRgb(hullColour, [0, 0, 0], 0.3);

  // sides: 7 slots along the hull, both flanks
  const sideSlots = 7;
  for (let i = 0; i < sideSlots; i += 1) {
    const z = hullFront + ((i + 0.5) / sideSlots) * bodyLength;
    addSocket("sideR", [centreX + halfWidth, 0, z], [1, 0, 0], "hull");
    addSocket("sideL", [centreX - halfWidth, 0, z], [-1, 0, 0], "hull");
  }
  // stern: 3 x 3 grid on the rear plate
  const sternZ = hullBack;
  for (const gx of [-1, 0, 1]) {
    for (const gy of [-1, 0, 1]) {
      addSocket("aft", [centreX + gx * podWidth * 0.62, gy * halfHeight * 0.62, sternZ], [0, 0, 1], "hull");
    }
  }
  // dorsal: 3 x 3 grid on the top deck
  for (const gx of [-1, 0, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const z = hullFront + ((i + 0.5) / 3) * bodyLength;
      addSocket("top", [centreX + gx * podWidth * 0.6, halfHeight, z], [0, 1, 0], "hull");
    }
  }
  // ventral: 3 x 4 grid
  for (const gx of [-1, 0, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const z = hullFront + ((i + 0.5) / 4) * bodyLength;
      addSocket("bottom", [centreX + gx * podWidth * 0.55, -halfHeight, z], [0, -1, 0], "hull");
    }
  }
  // nose
  addSocket("fore", [centreX, 0, hullFront], [0, 0, -1], "hull");

  /* ---- 4. cockpit at the nose ------------------------------------- */
  if (cockpits[0]) {
    const spec = moduleSpec(cockpits[0], ctx);
    const target = claim("fore", (c) => c[0]);
    if (target) {
      const { transform, gap } = attachTransform(spec, "aft", target.pos, target.dir);
      push(cockpits[0], specToWorld(spec, transform).faces);
      attachments.push({ child: cockpits[0].id, parent: "hull", socket: "fore", gap });
    }
  }

  /* ---- 5. reactors on the dorsal deck ---------------------------- */
  reactors.forEach((reactor) => {
    const target = claim("top", (c) => c[0]);
    if (!target) return;
    const spec = moduleSpec(reactor, ctx, { reactorLength: podWidth * 1.0 });
    const { transform, gap } = attachTransform(spec, "mount", target.pos, target.dir);
    push(reactor, specToWorld(spec, transform).faces);
    attachments.push({ child: reactor.id, parent: "hull", socket: "top", gap });
  });

  /* ---- 6. ventral bays ------------------------------------------- */
  bays.forEach((bay) => {
    const target = claim("bottom", (c) => c[Math.floor(c.length / 2)] ?? c[0]);
    if (!target) return;
    const spec = moduleSpec(bay, ctx);
    const { transform, gap } = attachTransform(spec, "mount", target.pos, target.dir);
    push(bay, specToWorld(spec, transform).faces);
    attachments.push({ child: bay.id, parent: "hull", socket: "bottom", gap });
  });

  /* ---- 7. wings on the flanks ------------------------------------ */
  const wingHardpoints: PlacedSocket[] = [];
  const wingCountPerSide: Record<string, number> = {};
  wings.forEach((wing, index) => {
    const pairIndex = Math.floor(index / 2);
    const isStarboard = index % 2 === 0;
    const lower = pairIndex % 2 === 1;
    const zIndex = Math.floor(pairIndex / 2);
    const kind = isStarboard ? "sideR" : "sideL";

    // choose a slot marching along the hull for each pair
    const target = claim(kind, (candidates) => {
      if (candidates.length === 0) return undefined;
      const ordered = [...candidates].sort((a, b) => a.pos[2] - b.pos[2]);
      const pickIndex = Math.min(ordered.length - 1, 1 + zIndex * 2);
      return ordered[pickIndex];
    });
    if (!target) return;

    const spec = moduleSpec(wing, ctx);
    const mirror: V3 = [isStarboard ? 1 : -1, lower ? -1 : 1, 1];
    const side = isStarboard ? 1 : -1;
    wingCountPerSide[side > 0 ? "R" : "L"] = (wingCountPerSide[side > 0 ? "R" : "L"] ?? 0) + 1;

    const { transform, gap } = attachTransform(spec, "root", target.pos, target.dir, mirror);
    const world = specToWorld(spec, transform);
    push(wing, world.faces);
    attachments.push({ child: wing.id, parent: "hull", socket: target.id, gap });

    // register this wing's hardpoints so guns can bolt straight onto them
    world.sockets
      .filter((socket) => socket.kind === "hardpoint")
      .forEach((socket) => wingHardpoints.push({ ...socket, owner: wing.id }));
  });

  /* ---- 8. external plating on remaining flanks ------------------- */
  platings.forEach((plate, index) => {
    const side = index % 2 === 0 ? "sideR" : "sideL";
    const target = claim(side, (candidates) => candidates[0]);
    if (!target) return;
    const spec = moduleSpec(plate, ctx);
    const mirror: V3 = [side === "sideR" ? 1 : -1, 1, 1];
    const { transform, gap } = attachTransform(spec, "mount", target.pos, target.dir, mirror);
    push(plate, specToWorld(spec, transform).faces);
    attachments.push({ child: plate.id, parent: "hull", socket: target.id, gap });
  });

  // any leftover plating rides the dorsal deck as panelling
  platings.slice(Math.floor(platings.length / 2) * 2).forEach((plate) => {
    const target = claim("top", (candidates) => candidates[candidates.length - 1]);
    if (!target) return;
    const spec = moduleSpec(plate, ctx, {});
    // lay it flat against the deck
    const rotated: ModuleSpec = {
      faces: spec.faces.map((f) => ({ ...f, pts: f.pts.map((p) => [p[1], -p[0], p[2]] as V3) })),
      sockets: spec.sockets.map((s) => ({ ...s, dir: [s.dir[1], -s.dir[0], s.dir[2]] as V3, id: "mount" })),
    };
    const { transform, gap } = attachTransform(rotated, "mount", target.pos, target.dir);
    push(plate, specToWorld(rotated, transform).faces);
    attachments.push({ child: plate.id, parent: "hull", socket: target.id, gap });
  });

  /* ---- 9. weapons: wing hardpoints first, then hull --------------- */
  const usedHardpoints = new Set<string>();
  weapons.forEach((weapon, index) => {
    const spec = moduleSpec(weapon, ctx);
    const hardpoint = wingHardpoints.find((h) => !usedHardpoints.has(`${h.owner}-${h.id}-${h.pos.join()}`));
    if (hardpoint) {
      usedHardpoints.add(`${hardpoint.owner}-${hardpoint.id}-${hardpoint.pos.join()}`);
      const { transform, gap } = attachTransform(spec, "mount", hardpoint.pos, hardpoint.dir);
      push(weapon, specToWorld(spec, transform).faces);
      attachments.push({ child: weapon.id, parent: hardpoint.owner, socket: hardpoint.id, gap });
      return;
    }
    // no wing space: bolt it to the hull flank with a pylon so it cannot float
    const side = index % 2 === 0 ? "sideR" : "sideL";
    const target = claim(side, (candidates) => candidates[candidates.length - 1 - Math.floor(index / 2) % 2]);
    if (!target) return;
    const pylonH = 0.26;
    const pylon = box(pylonH, 0.16, 0.34, darkColour, { kind: "dark" });
    push(weapon, transformFaces(pylon, { pos: [target.pos[0] + (side === "sideR" ? pylonH / 2 : -pylonH / 2), target.pos[1] + 0.1, target.pos[2]] }));
    const mountPos: V3 = [target.pos[0] + (side === "sideR" ? pylonH : -pylonH), target.pos[1] + 0.16, target.pos[2]];
    const { transform, gap } = attachTransform(spec, "mount", mountPos, [0, 1, 0]);
    push(weapon, specToWorld(spec, transform).faces);
    attachments.push({ child: weapon.id, parent: "hull", socket: target.id, gap });
  });

  /* ---- 10. engines on the stern plate ---------------------------- */
  const mainSpacing = podWidth * 0.66;
  mains.forEach((engine, index) => {
    const target = claim("aft", (candidates) => {
      const ordered = [...candidates].sort((a, b) => Math.abs(a.pos[0]) - Math.abs(b.pos[0]) || a.pos[0] - b.pos[0]);
      return ordered[index % Math.max(1, ordered.length)];
    });
    if (!target) return;
    const spec = moduleSpec(engine, ctx, { engineScale: Math.min(1, 1.05 - mains.length * 0.03) });
    const { transform, gap } = attachTransform(spec, "mount", target.pos, target.dir);
    push(engine, specToWorld(spec, transform).faces);
    attachments.push({ child: engine.id, parent: "hull", socket: target.id, gap });

    const radius = (0.42 + engine.geometry.span * 0.028) * Math.min(1, 1.05 - mains.length * 0.03);
    const nozzle: V3 = [target.pos[0], target.pos[1], target.pos[2] + radius * 1.4];
    plumes.push({
      origin: nozzle,
      dir: [0, 0, 1],
      radius,
      length: 9,
      rgb: hexToRgb(style.trail),
    });
  });

  /* ---- 11. light thrusters --------------------------------------- */
  lights.forEach((engine, index) => {
    const target = claim("aft", (candidates) => {
      const ordered = [...candidates].sort((a, b) => Math.abs(a.pos[1]) - Math.abs(b.pos[1]) || Math.abs(a.pos[0]) - Math.abs(b.pos[0]));
      return ordered[index % Math.max(1, ordered.length)];
    });
    if (!target) return;
    const spec = moduleSpec(engine, ctx);
    const { transform, gap } = attachTransform(spec, "mount", target.pos, target.dir);
    push(engine, specToWorld(spec, transform).faces);
    attachments.push({ child: engine.id, parent: "hull", socket: target.id, gap });
    plumes.push({
      origin: [target.pos[0], target.pos[1], target.pos[2] + 0.35],
      dir: [0, 0, 1],
      radius: 0.19,
      length: 7,
      rgb: hexToRgb(style.trail),
    });
  });

  /* ---- 12. landing gear ------------------------------------------ */
  const needsTallLegs = gears.some((g) => g.geometry.profile === "leg" || g.geometry.profile === "heavy-strut");
  const gearClearance = needsTallLegs ? 1.35 : 0.95;
  const gearRows = [0, 3, 1, 2];
  gears.forEach((gear, index) => {
    const row = gearRows[index % gearRows.length];
    const target = claim("bottom", (candidates) => {
      const byZ = [...candidates].sort((a, b) => a.pos[2] - b.pos[2]);
      const bucket = byZ.filter((_, i) => i % 4 === row % 4);
      return bucket[0] ?? byZ[Math.min(byZ.length - 1, row)];
    });
    if (!target) return;
    const spec = moduleSpec(gear, ctx, { legLength: gearClearance });
    const { transform, gap } = attachTransform(spec, "mount", target.pos, target.dir);
    push(gear, specToWorld(spec, transform).faces);
    attachments.push({ child: gear.id, parent: "hull", socket: target.id, gap });
  });

  /* ---- 13. shield emitters --------------------------------------- */
  shields.forEach((shield) => {
    const target = claim("top", (candidates) => candidates[0]);
    if (!target) return;
    const spec = moduleSpec(shield, ctx);
    const { transform, gap } = attachTransform(spec, "mount", target.pos, target.dir);
    push(shield, specToWorld(spec, transform).faces);
    attachments.push({ child: shield.id, parent: "hull", socket: target.id, gap });
  });

  /* ---- 14. style flourishes (sentinel rings, sails, fins, veins) -- */
  const boundsNow = boundsOf(parts);
  const centre: V3 = [
    (boundsNow.min[0] + boundsNow.max[0]) / 2,
    (boundsNow.min[1] + boundsNow.max[1]) / 2,
    (boundsNow.min[2] + boundsNow.max[2]) / 2,
  ];

  for (const flourish of style.flourishes) {
    const faces = flourishGeometry(flourish, {
      style,
      bounds: boundsNow,
      plumes,
      engines: mains.map((m) => m.id),
      centre,
      halfWidth: Math.max(halfWidth, (boundsNow.max[0] - boundsNow.min[0]) / 2),
      bodyLength,
      hullFront,
      hullBack,
    });
    if (faces.length > 0) flourishFaces.push({ kind: flourish, faces });
  }

  const bounds = parts.length > 0 ? boundsOf(parts) : { min: [-1, -1, -2] as V3, max: [1, 1, 2] as V3 };
  // make sure flourishes are inside the frame too
  const allFlourish = flourishFaces.flatMap((f) => f.faces);
  for (const face of allFlourish) {
    for (const p of face.pts) {
      bounds.min[0] = Math.min(bounds.min[0], p[0]);
      bounds.min[1] = Math.min(bounds.min[1], p[1]);
      bounds.min[2] = Math.min(bounds.min[2], p[2]);
      bounds.max[0] = Math.max(bounds.max[0], p[0]);
      bounds.max[1] = Math.max(bounds.max[1], p[1]);
      bounds.max[2] = Math.max(bounds.max[2], p[2]);
    }
  }

  return {
    parts,
    plumes,
    bounds: parts.length > 0 ? bounds : { min: [-1, -1, -2], max: [1, 1, 2] },
    groundY: -halfHeight - gearClearance,
    moduleCount,
    style,
    attachments,
    flourishes: flourishFaces,
    hasShield: shields.length > 0,
    modules: linkParents(modules, attachments),
  };
}

function boundsOf(parts: PartMesh[]): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    for (const face of part.faces) {
      for (const p of face.pts) {
        min[0] = Math.min(min[0], p[0]);
        min[1] = Math.min(min[1], p[1]);
        min[2] = Math.min(min[2], p[2]);
        max[0] = Math.max(max[0], p[0]);
        max[1] = Math.max(max[1], p[1]);
        max[2] = Math.max(max[2], p[2]);
      }
    }
  }
  if (!Number.isFinite(min[0])) return { min: [-1, -1, -2], max: [1, 1, 2] };
  return { min, max };
}

/* ------------------------------------------------------------------ */
/* style flourishes                                                   */
/* ------------------------------------------------------------------ */

interface FlourishCtx {
  style: ShipStyle;
  bounds: { min: V3; max: V3 };
  plumes: PlumeSpec[];
  engines: string[];
  centre: V3;
  halfWidth: number;
  bodyLength: number;
  hullFront: number;
  hullBack: number;
}

function flourishGeometry(kind: FlourishId, ctx: FlourishCtx): Face3D[] {
  const { style } = ctx;
  const hull = hexToRgb(style.hullBase);
  const dark = hexToRgb(style.hullDark);
  const glow = hexToRgb(style.emissive);
  const hot = hexToRgb(style.emissiveHot);
  const faces: Face3D[] = [];

  switch (kind) {
    case "ring-engines": {
      // Sentinel-style glowing rings around each main engine
      const mainPlumes = ctx.plumes.filter((p) => p.radius > 0.3);
      for (const plume of mainPlumes) {
        plume.ring = { radius: plume.radius * 2.1, rgb: glow };
        faces.push(
          ...transformFaces(annulus(plume.radius * 1.35, plume.radius * 2.2, glow, { seg: 20 }), {
            pos: [plume.origin[0], plume.origin[1], plume.origin[2] - 0.35],
          }),
          ...transformFaces(annulus(plume.radius * 1.5, plume.radius * 2.05, hot, { seg: 20 }), {
            pos: [plume.origin[0], plume.origin[1], plume.origin[2] - 0.36],
          }),
        );
      }
      // dark rotor collars behind each engine (kept tight to the nozzle)
      for (const plume of mainPlumes) {
        faces.push(
          ...transformFaces(annulus(plume.radius * 1.5, plume.radius * 2.0, scaleRgb(dark, 0.9), { seg: 20, kind: "dark" }), {
            pos: [plume.origin[0], plume.origin[1], plume.origin[2] - 0.5],
          }),
        );
      }
      break;
    }
    case "blade-wings": {
      // Angular blades that grow out of the hull flank and sweep down/aft.
      // The root starts INSIDE the hull so the blade can never look detached.
      const span = Math.min(ctx.halfWidth * 1.1, 1.5);
      const chord = ctx.bodyLength * 0.5;
      for (const side of [-1, 1] as const) {
        const rootX = ctx.centre[0] + side * (ctx.halfWidth * 0.82);
        const z = ctx.hullBack - ctx.bodyLength * 0.3;
        faces.push(...transformFaces(
          box(span, 0.2, chord, scaleRgb(hull, 0.4), { taperBackW: 0.2, taperFrontW: 0.85, kind: "hull" }),
          { pos: [rootX + side * (span / 2 - 0.05), -0.12, z], rot: fromAxisAngle([0, 1, 0], side * 0.42) },
        ));
        faces.push(...transformFaces(strip(span * 0.8, 0.05, 0.1, glow, "emissive"), {
          pos: [rootX + side * (span / 2 - 0.05), 0.0, z - chord * 0.36],
          rot: fromAxisAngle([0, 1, 0], side * 0.42),
        }));
      }
      break;
    }
    case "solar-sails": {
      // Sails grow out of the flank on a spar. The root sits INSIDE the hull
      // and the membrane starts at the hull surface, so nothing floats.
      const sailRgb = mixRgb(hexToRgb(style.emissive), [255, 255, 255], 0.5);
      const span = Math.min(ctx.halfWidth * 1.25, 1.9);
      const chord = ctx.bodyLength * 0.62;
      const rootY = 0.1;
      for (const side of [-1, 1] as const) {
        const rootX = ctx.centre[0] + side * ctx.halfWidth * 0.7;
        const tipX = rootX + side * span;
        const roll = side * -0.34;
        // spar: from inside the hull out to the sail tip
        faces.push(...transformFaces(
          box(span * 1.05, 0.11, 0.16, scaleRgb(hull, 0.75), { kind: "hull" }),
          { pos: [(rootX + tipX) / 2, rootY, ctx.centre[2] - chord * 0.1], rot: fromAxisAngle([0, 0, 1], roll) },
        ));
        // membrane: starts at the flank and sweeps outward
        faces.push(...transformFaces(
          box(span, 0.05, chord, sailRgb, { kind: "sail", taperBackW: 0.72, taperFrontW: 0.9 }),
          { pos: [rootX + side * span * 0.42, rootY, ctx.centre[2]], rot: fromAxisAngle([0, 0, 1], roll) },
        ));
        faces.push(...transformFaces(
          strip(span * 0.9, 0.05, 0.08, glow, "emissive"),
          { pos: [rootX + side * span * 0.42, rootY + 0.05, ctx.centre[2] - chord * 0.4], rot: fromAxisAngle([0, 0, 1], roll) },
        ));
      }
      break;
    }
    case "exotic-fin": {
      // Dorsal fin: pylon rooted in the deck, blade above it, spine lit.
      const top = ctx.bounds.max[1];
      const height = Math.min(0.9, 0.35 + ctx.halfWidth * 0.35);
      const z = ctx.hullBack - ctx.bodyLength * 0.34;
      faces.push(...transformFaces(
        box(0.16, height, ctx.bodyLength * 0.2, scaleRgb(dark, 1.05), { kind: "dark" }),
        { pos: [ctx.centre[0], top + height / 2 - 0.1, z] },
      ));
      faces.push(...transformFaces(
        foil(0.5, ctx.bodyLength * 0.42, height * 0.7, height * 0.6, 0, mixRgb(hull, [255, 255, 255], 0.2), { taper: 0.5 }),
        { pos: [ctx.centre[0], top + height * 0.9, z], rot: fromAxisAngle([0, 1, 0], Math.PI / 2) },
      ));
      faces.push(...transformFaces(strip(0.05, 0.05, ctx.bodyLength * 0.26, glow, "emissive"), {
        pos: [ctx.centre[0], top + height * 1.5, z],
      }));
      break;
    }
    case "pirate-spikes": {
      for (const side of [-1, 1] as const) {
        for (let i = 0; i < 3; i += 1) {
          const z = ctx.hullFront + ctx.bodyLength * (0.2 + i * 0.28);
          faces.push(...transformFaces(
            box(ctx.halfWidth * 0.95, 0.16, 0.22, scaleRgb(dark, 1.1), { taperBackW: 0.1, kind: "dark" }),
            {
              pos: [ctx.centre[0] + side * ctx.halfWidth * 0.72, 0.25, z],
              rot: fromAxisAngle([0, 0, 1], side * -0.3),
            },
          ));
        }
      }
      break;
    }
    case "organic-veins": {
      for (const side of [-1, 1] as const) {
        for (let i = 0; i < 4; i += 1) {
          const z = ctx.hullFront + ctx.bodyLength * (0.16 + i * 0.22);
          const y = side * (0.12 + i * 0.05);
          faces.push(...transformFaces(strip(0.05, 0.05, ctx.bodyLength * 0.24, glow, "emissive"), {
            pos: [ctx.centre[0] + side * ctx.halfWidth * 0.88, y, z],
          }));
        }
      }
      break;
    }
    case "dorsal-towers":
    case "hull-rim-glow":
    default:
      break;
  }
  return faces;
}

/* ------------------------------------------------------------------ */
/* view + projection                                                  */
/* ------------------------------------------------------------------ */

export interface ViewState {
  yaw: number;
  pitch: number;
  zoom: number;
}

export const DEFAULT_VIEW: ViewState = { yaw: -0.66, pitch: -0.3, zoom: 1 };

function rotateView(v: V3, view: ViewState): V3 {
  const cy = Math.cos(view.yaw);
  const sy = Math.sin(view.yaw);
  const x1 = v[0] * cy - v[2] * sy;
  const z1 = v[0] * sy + v[2] * cy;
  const cp = Math.cos(view.pitch);
  const sp = Math.sin(view.pitch);
  const y2 = v[1] * cp - z1 * sp;
  const z2 = v[1] * sp + z1 * cp;
  return [x1, y2, z2];
}

export type FaceState = "placed" | "active" | "ghost" | "decor";

export interface ProjectedFace {
  /** module instance key this face belongs to ("wing-osprey#1") */
  key: string;
  state: FaceState;
  partId: string;
  partName: string;
  category: PartCategoryId | "scene";
  points: string;
  fill: string;
  opacity: number;
  kind: FaceKind;
  depth: number;
  flourish?: string;
}

export interface ProjectedScene {
  faces: ProjectedFace[];
  shield: { points: string; depth: number }[][];
  plumes: { segments: { points: string; alpha: number }[]; core: string }[];
  deck: string[];
  stars: { x: number; y: number; r: number; alpha: number }[];
  nebula: { x: number; y: number; rx: number; ry: number; color: string; alpha: number; rotate: number }[];
  shadow: { cx: number; cy: number; rx: number; ry: number } | null;
  environment: "space" | "hangar";
  camera: { x: number; y: number; z: number };
}

export interface ProjectionOptions {
  padding?: number;
  baseKind?: FaceKind;
  /** "render" = lit 3D preview, "manual" = flat ink-on-paper assembly drawing */
  material?: "render" | "manual";
  /** module keys highlighted as the step being installed */
  activeKeys?: string[];
  /** module keys already bolted on earlier in the manual */
  placedKeys?: string[];
  /** accent used for the active step */
  accent?: string;
  /** style flourishes are hidden while the manual is mid-assembly */
  showDecor?: boolean;
}

const LIGHT: V3 = norm([-0.45, 0.72, -0.55]);
const FOCAL = 26;

/** Deterministic starfield so the backdrop never flickers between renders. */
function starfield(width: number, height: number, seed = 7) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const count = Math.round((width * height) / 5200);
  const stars = Array.from({ length: count }, () => ({
    x: rand() * width,
    y: rand() * height,
    r: 0.35 + rand() * 1.15,
    alpha: 0.25 + rand() * 0.75,
  }));
  const nebula = [
    { x: width * (0.2 + rand() * 0.2), y: height * (0.25 + rand() * 0.3), rx: width * 0.5, ry: height * 0.55, color: "#1d5f8a", alpha: 0.3, rotate: rand() * 60 },
    { x: width * (0.7 + rand() * 0.2), y: height * (0.6 + rand() * 0.3), rx: width * 0.42, ry: height * 0.4, color: "#3c2a63", alpha: 0.26, rotate: rand() * 60 },
    { x: width * 0.5, y: height * 0.15, rx: width * 0.6, ry: height * 0.3, color: "#0d3f66", alpha: 0.22, rotate: 0 },
  ];
  return { stars, nebula };
}

export function projectScene(
  mesh: ShipMesh,
  view: ViewState,
  width: number,
  height: number,
  opts: ProjectionOptions = {},
): ProjectedScene {
  const manual = opts.material === "manual";
  const activeKeys = new Set(opts.activeKeys ?? []);
  const placedKeys = new Set(opts.placedKeys ?? []);
  const accent = hexToRgb(opts.accent ?? "#7c5cff");
  const stateOf = (key: string): FaceState => {
    if (activeKeys.has(key)) return "active";
    if (placedKeys.has(key)) return "placed";
    return "ghost";
  };
  const finite = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);
  const min: V3 = [finite(mesh.bounds.min[0], -1), finite(mesh.bounds.min[1], -1), finite(mesh.bounds.min[2], -2)];
  const max: V3 = [finite(mesh.bounds.max[0], 1), finite(mesh.bounds.max[1], 1), finite(mesh.bounds.max[2], 2)];
  const centre: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];

  const rotated = mesh.parts.map((part) => part.faces.map((face) => face.pts.map((p) => rotateView(p, view))));
  const flourishRotated = mesh.flourishes.map((group) =>
    group.faces.map((face) => face.pts.map((p) => rotateView(p, view))),
  );

  let vMinX = Infinity;
  let vMaxX = -Infinity;
  let vMinY = Infinity;
  let vMaxY = -Infinity;
  const include = (p: V3) => {
    if (p[0] < vMinX) vMinX = p[0];
    if (p[0] > vMaxX) vMaxX = p[0];
    if (p[1] < vMinY) vMinY = p[1];
    if (p[1] > vMaxY) vMaxY = p[1];
  };
  // frame on the hull only: engine trails are meant to run off-screen
  for (const partFaces of rotated) {
    for (const face of partFaces) for (const p of face) include(p);
  }
  for (const group of flourishRotated) {
    for (const face of group) for (const p of face) include(p);
  }
  if (!Number.isFinite(vMinX)) {
    vMinX = -1;
    vMaxX = 1;
    vMinY = -1;
    vMaxY = 1;
  }

  const pad = opts.padding ?? 1.32;
  const scale = Math.min(width / (Math.max(0.001, vMaxX - vMinX) * pad), height / (Math.max(0.001, vMaxY - vMinY) * pad));
  const viewCentreX = (vMinX + vMaxX) / 2;
  const viewCentreY = (vMinY + vMaxY) / 2;
  const cam = rotateView(centre, view);
  const depthCentre = cam[2] ?? 0;

  const projectRotated = (r: V3) => {
    const depth = r[2] - depthCentre;
    const persp = FOCAL / (FOCAL + depth * 0.42);
    return {
      x: width / 2 + (r[0] - viewCentreX) * scale * persp,
      y: height / 2 - (r[1] - viewCentreY) * scale * persp,
      z: depth,
    };
  };
  const project = (v: V3) => projectRotated(rotateView(v, view));

  const shade = (
    rgb: [number, number, number],
    pts: V3[],
    kind: FaceKind,
    opacity?: number,
    override?: { state: FaceState },
  ) => {
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const nv = rotateView(n, view);
    const diffuse = Math.max(0, dot(nv, LIGHT));
    // fill light from the opposite side keeps dark Sentinel plating readable
    const fill = Math.max(0, dot(nv, [-LIGHT[0], 0.15, -LIGHT[2]])) * 0.34;
    const lum = 0.34 + 0.95 * diffuse + fill;
    const rim = Math.pow(1 - Math.min(1, Math.abs(nv[2])), 3) * 0.26;
    const viewDir: V3 = norm([LIGHT[0], LIGHT[1], LIGHT[2] - 1]);
    const spec = Math.pow(Math.max(0, dot(nv, viewDir)), 26) * 0.4;

    let out = scaleRgb(rgb, lum);
    out = mixRgb(out, [120, 200, 255], rim);
    out = mixRgb(out, [255, 255, 255], spec);

    if (kind === "emissive" || kind === "trim") {
      out = scaleRgb(mixRgb(out, rgb, 0.6), 1.5);
    }
    if (kind === "glass") out = mixRgb(out, [12, 20, 34], 0.35);
    if (kind === "dark") out = scaleRgb(out, 0.78);
    if (kind === "sail") out = scaleRgb(out, 1.05);

    if (manual) {
      // "Manual" material: the flat ink-on-paper look of an assembly booklet.
      // Form still reads because the greys follow the same lighting term.
      const ink = 0.62 + 0.38 * Math.min(1, lum);
      if (override?.state === "active") {
        out = scaleRgb(mixRgb(accent, [255, 255, 255], 0.42), 0.75 + ink * 0.5);
        return rgbCss(out, 1);
      }
      if (override?.state === "decor") return rgbCss(scaleRgb([150, 160, 190], ink), 0.5);
      out = scaleRgb([248, 249, 252], ink);
      return rgbCss(out, override?.state === "ghost" ? 0.5 : 1);
    }
    return rgbCss(out, opacity ?? 1);
  };

  const out: ProjectedFace[] = [];
  const emit = (
    key: string,
    state: FaceState,
    partId: string,
    partName: string,
    category: PartCategoryId | "scene",
    face: Face3D,
    rotatedPts: V3[],
    flourish?: string,
  ) => {
    const projected = rotatedPts.map(projectRotated);
    const depth = projected.reduce((sum, p) => sum + p.z, 0) / Math.max(1, projected.length);
    out.push({
      key,
      state,
      partId,
      partName,
      category,
      points: projected.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      fill: shade(face.rgb, face.pts, face.kind, face.opacity, { state }),
      opacity: face.opacity ?? 1,
      kind: face.kind,
      depth,
      flourish,
    });
  };

  mesh.parts.forEach((part, partIndex) => {
    const state = stateOf(part.key);
    part.faces.forEach((face, faceIndex) => {
      emit(part.key, state, part.partId, part.partName, part.category, face, rotated[partIndex][faceIndex]);
    });
  });
  const decorVisible = !manual || opts.showDecor === true;
  (decorVisible ? mesh.flourishes : []).forEach((group, groupIndex) => {
    group.faces.forEach((face, faceIndex) => {
      emit(`${group.kind}#0`, "decor", `${group.kind}`, group.kind, "scene", face, flourishRotated[groupIndex][faceIndex], group.kind);
    });
  });

  out.sort((a, b) => b.depth - a.depth);

  const trailLength = mesh.style.environment === "space" ? 16 : 4.5;
  const plumes = mesh.plumes
    .map((plume) => {
      const dir = norm(plume.dir);
      const end: V3 = add(plume.origin, mul(dir, plume.length * (trailLength / 9)));
      const p0 = project(plume.origin);
      const p1 = project(end);
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l;
      const ny = dx / l;
      const w0 = Math.max(1.8, plume.radius * scale * 0.34);
      const at = (t: number): { x: number; y: number } => ({
        x: p0.x + (p1.x - p0.x) * t,
        y: p0.y + (p1.y - p0.y) * t,
      });
      const quad = (t0: number, t1: number, wStart: number, wEnd: number) => {
        const a = at(t0);
        const b = at(t1);
        return [
          `${(a.x + nx * wStart).toFixed(1)},${(a.y + ny * wStart).toFixed(1)}`,
          `${(b.x + nx * wEnd).toFixed(1)},${(b.y + ny * wEnd).toFixed(1)}`,
          `${(b.x - nx * wEnd).toFixed(1)},${(b.y - ny * wEnd).toFixed(1)}`,
          `${(a.x - nx * wStart).toFixed(1)},${(a.y - ny * wStart).toFixed(1)}`,
        ].join(" ");
      };
      // four stacked segments so the trail fades with distance instead of
      // drawing one hard-edged wedge across the whole frame
      return {
        segments: [
          { points: quad(0, 0.22, w0, w0 * 0.86), alpha: 0.5 },
          { points: quad(0.22, 0.5, w0 * 0.86, w0 * 0.6), alpha: 0.34 },
          { points: quad(0.5, 0.78, w0 * 0.6, w0 * 0.34), alpha: 0.2 },
          { points: quad(0.78, 1, w0 * 0.34, w0 * 0.12), alpha: 0.08 },
        ],
        core: quad(0, 0.28, w0 * 0.4, w0 * 0.22),
      };
    })
    .filter(Boolean);

  const shield = mesh.hasShield
    ? [
        ringOf(centre, max, min, 0).map((v, i, arr) => {
          const p = project(v);
          const next = project(arr[(i + 1) % arr.length]);
          return { points: `${p.x.toFixed(1)},${p.y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`, depth: p.z };
        }),
        ringOf(centre, max, min, 1).map((v, i, arr) => {
          const p = project(v);
          const next = project(arr[(i + 1) % arr.length]);
          return { points: `${p.x.toFixed(1)},${p.y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`, depth: p.z };
        }),
      ]
    : [];

  const deck: string[] = [];
  const environment = mesh.style.environment;
  if (environment === "hangar") {
    const gy = mesh.groundY;
    const gx = Math.max(4, (max[0] - min[0]) * 0.9 + 2);
    const gz = Math.max(4, (max[2] - min[2]) * 0.75 + 2);
    const steps = 7;
    for (let i = -steps; i <= steps; i += 1) {
      const z = (i / steps) * gz;
      const a = project([-gx, gy, z]);
      const b = project([gx, gy, z]);
      deck.push(`${a.x.toFixed(1)},${a.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
      const x = (i / steps) * gx;
      const c = project([x, gy, -gz]);
      const d = project([x, gy, gz]);
      deck.push(`${c.x.toFixed(1)},${c.y.toFixed(1)} ${d.x.toFixed(1)},${d.y.toFixed(1)}`);
    }
  }

  const { stars, nebula } = starfield(width, height, (mesh.moduleCount + 11) * 13);

  let shadow: ProjectedScene["shadow"] = null;
  if (environment === "hangar" && !manual) {
    const pts = [
      project([min[0] - 0.5, mesh.groundY, min[2] - 0.5]),
      project([max[0] + 0.5, mesh.groundY, min[2] - 0.5]),
      project([max[0] + 0.5, mesh.groundY, max[2] + 0.5]),
      project([min[0] - 0.5, mesh.groundY, max[2] + 0.5]),
    ];
    const sxs = pts.map((p) => p.x);
    const sys = pts.map((p) => p.y);
    shadow = {
      cx: (Math.min(...sxs) + Math.max(...sxs)) / 2,
      cy: (Math.min(...sys) + Math.max(...sys)) / 2,
      rx: (Math.max(...sxs) - Math.min(...sxs)) / 2,
      ry: Math.max(6, (Math.max(...sys) - Math.min(...sys)) / 2),
    };
  }

  return {
    faces: out,
    shield,
    plumes,
    deck,
    stars,
    nebula,
    shadow,
    environment,
    camera: { x: cam[0], y: cam[1], z: cam[2] },
  };
}

/**
 * Attachment records are emitted as part ids ("wing-osprey"); the manual needs
 * instance keys ("wing-osprey#1"). Records are pushed in the same order the
 * instances of that part were created, so pairing them up by occurrence is exact.
 */
function linkParents(
  modules: ModuleInstance[],
  attachments: AttachmentRecord[],
): ModuleInstance[] {
  const byPart = new Map<string, ModuleInstance[]>();
  for (const instance of modules) {
    const list = byPart.get(instance.partId);
    if (list) list.push(instance);
    else byPart.set(instance.partId, [instance]);
  }
  const cursor = new Map<string, number>();
  for (const record of attachments) {
    const list = byPart.get(record.child);
    if (!list) continue;
    const index = cursor.get(record.child) ?? 0;
    const target = list[index];
    if (!target) continue;
    target.parent = record.parent;
    target.socket = record.socket;
    target.gap = record.gap;
    cursor.set(record.child, index + 1);
  }
  return modules;
}

/** A shield bubble ring: 0 = horizontal equator, 1 = tilted envelope. */
function ringOf(centre: V3, max: V3, min: V3, variant: 0 | 1): V3[] {
  // the bubble hugs the plating: any larger and it reads as a stray ellipse
  const rx = (max[0] - min[0]) / 2 + 0.28;
  const ry = (max[1] - min[1]) / 2 + 0.24;
  const rz = (max[2] - min[2]) / 2 + 0.28;
  const seg = 30;
  return Array.from({ length: seg }, (_, i) => {
    const a = (i / seg) * Math.PI * 2;
    if (variant === 0) {
      return [centre[0] + Math.cos(a) * rx, centre[1] + Math.sin(a) * ry * 0.18, centre[2] + Math.sin(a) * rz];
    }
    return [centre[0] + Math.cos(a) * rx * 0.9, centre[1] + Math.sin(a) * ry, centre[2] + Math.sin(a) * rz * 0.55];
  });
}

/* ------------------------------------------------------------------ */
/* single-module portraits                                            */
/* ------------------------------------------------------------------ */

export function buildPartMesh(part: Part, options: BuildMeshOptions = {}): ShipMesh {
  const style = resolveStyle(options.style);
  const span = part.geometry.span;
  const ctx: SpecCtx = {
    podWidth: 1.0 + span * 0.06,
    halfHeight: 0.62,
    style,
    density: "high",
  };
  const spec = moduleSpec(part, ctx, { legLength: 1.0, reactorLength: 1.1 });
  const bounds = boundsOf([{ key: `${part.id}#0`, partId: part.id, partName: part.name, category: part.category, faces: spec.faces }]);
  return {
    parts: [{ key: `${part.id}#0`, partId: part.id, partName: part.name, category: part.category, faces: spec.faces }],
    plumes: [],
    bounds,
    groundY: bounds.min[1] - 0.4,
    moduleCount: 1,
    style,
    attachments: [],
    modules: [
      {
        key: `${part.id}#0`,
        partId: part.id,
        partName: part.name,
        category: part.category,
        anchor: centroidOf(spec.faces),
        parent: "hull",
        socket: "",
        gap: 0,
      },
    ],
    flourishes: [],
    hasShield: false,
  };
}

export const categoryAccent = (category: PartCategoryId): string =>
  categoryById[category]?.accent ?? "#38bdf8";
