/**
 * render3d.ts — a tiny software 3D renderer good enough to preview a Corvette.
 *
 * Pipeline:
 *   build -> world-space mesh (primitives per module, oriented via its geometry)
 *   mesh  -> rotate + perspective project
 *   faces -> shaded by view-space normal (ambient + diffuse + rim + spec)
 *   sorted back-to-front (painter's algorithm) for SVG output
 *
 * Conventions:  +X starboard, +Y up, +Z aft (the nose points at -Z).
 */

import { categoryById, partById } from "./data";
import { expandParts } from "./build";
import type { Build, Part, PartCategoryId } from "./types";

export type V3 = [number, number, number];

export type FaceKind = "hull" | "dark" | "emissive" | "glass" | "panel" | "engine" | "glassDark";

export interface Face3D {
  pts: V3[];
  /** base colour as [r,g,b] so shading stays cheap */
  rgb: [number, number, number];
  kind: FaceKind;
  opacity?: number;
}

export interface PartMesh {
  partId: string;
  partName: string;
  category: PartCategoryId;
  faces: Face3D[];
}

export interface PlumeSpec {
  origin: V3;
  radius: number;
  length: number;
  rgb: [number, number, number];
}

export interface ShipMesh {
  parts: PartMesh[];
  /** decorative scene geometry */
  shieldRings: V3[][];
  plumes: PlumeSpec[];
  bounds: { min: V3; max: V3 };
  groundY: number;
  moduleCount: number;
}

/* ------------------------------------------------------------------ */
/* math                                                                */
/* ------------------------------------------------------------------ */

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalise = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
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
/* primitives (local space, centred on origin)                         */
/* ------------------------------------------------------------------ */

type Corners8 = [V3, V3, V3, V3, V3, V3, V3, V3]; // bottom 4 (CCW seen from above), top 4 matching

/**
 * Build the 6 quads of a hexahedron. Normals are oriented outward from the
 * solid's own centroid, so we never need consistent winding from callers.
 */
function hexahedron(c: Corners8, rgb: [number, number, number], kind: FaceKind): Face3D[] {
  const centre: V3 = [
    (c[0][0] + c[2][0] + c[4][0] + c[6][0]) / 4,
    (c[0][1] + c[2][1] + c[4][1] + c[6][1]) / 4,
    (c[0][2] + c[2][2] + c[4][2] + c[6][2]) / 4,
  ];
  const quads: V3[][] = [
    [c[0], c[1], c[2], c[3]], // bottom
    [c[4], c[5], c[6], c[7]], // top
    [c[0], c[1], c[5], c[4]], // front (-Z)
    [c[2], c[3], c[7], c[6]], // rear (+Z)
    [c[0], c[3], c[7], c[4]], // -X
    [c[1], c[2], c[6], c[5]], // +X
  ];
  return quads.map((pts) => {
    const n = normalise(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
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
  /** scale of the front (-Z) face: 1 = straight, <1 = tapering to a nose */
  taperFrontW?: number;
  taperFrontH?: number;
  /** scale of the top face, for chunky chamfered hulls */
  taperTopW?: number;
  /** bevel the nose with a short extra segment (gives a chiselled front) */
  nose?: number;
  kind?: FaceKind;
}

/** A box, optionally tapering toward the nose and/or the roof. */
function box(w: number, h: number, d: number, rgb: [number, number, number], opts: BoxOpts = {}): Face3D[] {
  const tw = (opts.taperTopW ?? 1.0) * w;
  const twF = tw * (opts.taperFrontW ?? 1);
  const twB = tw;
  const bwF = w * (opts.taperFrontW ?? 1);
  const bwB = w;
  const hh = h / 2;
  const hd = d / 2;
  const hhF = (h * (opts.taperFrontH ?? 1)) / 2;
  const bottomFront = bwF / 2;
  const bottomBack = bwB / 2;

  const c: Corners8 = [
    [-bottomFront, -hhF, -hd], // bottom front left
    [bottomFront, -hhF, -hd], // bottom front right
    [bottomBack, -hh, hd], // bottom back right
    [-bottomBack, -hh, hd], // bottom back left
    [-twF / 2, hhF, -hd],
    [twF / 2, hhF, -hd],
    [twB / 2, hh, hd],
    [-twB / 2, hh, hd],
  ];
  return hexahedron(c, rgb, opts.kind ?? "hull");
}

/** Cylinder along the Z axis with optional emissive end caps. */
function cylinder(
  r: number,
  len: number,
  rgb: [number, number, number],
  opts: { seg?: number; kind?: FaceKind; glowFront?: [number, number, number]; glowBack?: [number, number, number] } = {},
): Face3D[] {
  const seg = opts.seg ?? 12;
  const faces: Face3D[] = [];
  const hz = len / 2;
  const ring = (z: number, radius: number) =>
    Array.from({ length: seg }, (_, i) => {
      const a = (i / seg) * Math.PI * 2;
      return [Math.cos(a) * radius, Math.sin(a) * radius, z] as V3;
    });
  const front = ring(-hz, r);
  const back = ring(hz, r);
  for (let i = 0; i < seg; i += 1) {
    const j = (i + 1) % seg;
    faces.push({
      pts: [front[i], front[j], back[j], back[i]],
      rgb,
      kind: opts.kind ?? "hull",
    });
  }
  if (opts.glowFront) {
    faces.push({ pts: front, rgb: opts.glowFront, kind: "emissive" });
  }
  if (opts.glowBack) {
    faces.push({ pts: [...back].reverse(), rgb: opts.glowBack, kind: "emissive" });
  }
  return faces;
}

/** Cone flaring toward +Z (an engine bell). */
function cone(
  r: number,
  len: number,
  rgb: [number, number, number],
  opts: { seg?: number; glow?: [number, number, number]; hollow?: boolean } = {},
): Face3D[] {
  const seg = opts.seg ?? 12;
  const faces: Face3D[] = [];
  const apex: V3 = [0, 0, 0];
  const base = Array.from({ length: seg }, (_, i) => {
    const a = (i / seg) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r, len] as V3;
  });
  for (let i = 0; i < seg; i += 1) {
    const j = (i + 1) % seg;
    faces.push({ pts: [apex, base[i], base[j]], rgb, kind: "hull" });
  }
  if (opts.hollow) {
    // dark throat + hot inner disc
    faces.push({ pts: [...base].reverse(), rgb: opts.glow ?? [255, 150, 60], kind: "emissive" });
    const inner = base.map((p) => [p[0] * 0.55, p[1] * 0.55, p[2] - 0.05] as V3);
    faces.push({ pts: [...inner].reverse(), rgb: opts.glow ?? [255, 190, 120], kind: "emissive" });
  }
  return faces;
}

/** Hemisphere dome (bridge pods). */
function dome(
  r: number,
  rgb: [number, number, number],
  opts: { seg?: number; rings?: number; kind?: FaceKind; opacity?: number } = {},
): Face3D[] {
  const seg = opts.seg ?? 12;
  const rings = opts.rings ?? 3;
  const faces: Face3D[] = [];
  const at = (ri: number, si: number): V3 => {
    const phi = (ri / rings) * (Math.PI / 2);
    const theta = (si / seg) * Math.PI * 2;
    return [
      Math.cos(phi) * Math.cos(theta) * r,
      Math.sin(phi) * r,
      Math.cos(phi) * Math.sin(theta) * r,
    ];
  };
  for (let ri = 0; ri < rings; ri += 1) {
    for (let si = 0; si < seg; si += 1) {
      faces.push({
        pts: [at(ri, si), at(ri + 1, si), at(ri + 1, si + 1), at(ri, si + 1)],
        rgb,
        kind: opts.kind ?? "hull",
        opacity: opts.opacity,
      });
    }
  }
  return faces;
}

/** Extruded aerofoil plate used for wings, fins and stabilisers. */
function foil(
  span: number,
  chord: number,
  thickness: number,
  sweep: number,
  dihedral: number,
  rgb: [number, number, number],
  opts: { taper?: number; kind?: FaceKind } = {},
): Face3D[] {
  const taper = opts.taper ?? 0.7;
  const tipChord = chord * taper;
  const cFront = -chord / 2;
  const cBack = chord / 2;
  const tFront = -tipChord / 2 + sweep;
  const tBack = tipChord / 2 + sweep;
  const lift = span * Math.tan(dihedral);
  const ht = thickness / 2;

  const c: Corners8 = [
    [0, -ht, cFront],
    [span, lift - ht * 0.5, tFront],
    [span, lift + ht * 0.5, tBack],
    [0, ht, cBack],
    // bottom face mirror
    [0, -ht, cBack],
    [span, lift - ht * 0.5, tBack],
    [span, lift + ht * 0.5, tFront],
    [0, ht, cFront],
  ];
  // build as two wedges so top and bottom surfaces are distinct
  const top: V3[] = [c[0], c[1], c[2], c[3]];
  const bottom: V3[] = [c[4], c[5], c[6], c[7]];
  const faces: Face3D[] = [
    { pts: top, rgb, kind: opts.kind ?? "hull" },
    { pts: [...bottom].reverse(), rgb: scaleRgb(rgb, 0.72), kind: opts.kind ?? "hull" },
    { pts: [c[0], c[1], c[5], c[4]], rgb: scaleRgb(rgb, 0.82), kind: opts.kind ?? "hull" },
    { pts: [c[3], c[2], c[6], c[7]], rgb: scaleRgb(rgb, 0.82), kind: opts.kind ?? "hull" },
    { pts: [c[1], c[2], c[6], c[5]], rgb: scaleRgb(rgb, 0.9), kind: opts.kind ?? "hull" },
  ];
  return faces;
}

/** Thin panel / plating tile. */
function panel(
  w: number,
  h: number,
  d: number,
  rgb: [number, number, number],
  kind: FaceKind = "panel",
): Face3D[] {
  return box(w, h, d, rgb, { kind });
}

/* ------------------------------------------------------------------ */
/* transforms                                                          */
/* ------------------------------------------------------------------ */

interface Placement {
  pos?: V3;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  scale?: number | V3;
}

function transformFaces(faces: Face3D[], p: Placement): Face3D[] {
  const pos = p.pos ?? ([0, 0, 0] as V3);
  const s = p.scale ?? 1;
  const sx = typeof s === "number" ? s : s[0];
  const sy = typeof s === "number" ? s : s[1];
  const sz = typeof s === "number" ? s : s[2];
  const rx = p.rotX ?? 0;
  const ry = p.rotY ?? 0;
  const rz = p.rotZ ?? 0;
  const cx = Math.cos(rx), sxr = Math.sin(rx);
  const cy = Math.cos(ry), syr = Math.sin(ry);
  const cz = Math.cos(rz), szr = Math.sin(rz);

  const apply = (v: V3): V3 => {
    let [x, y, z] = [v[0] * sx, v[1] * sy, v[2] * sz];
    // X rotation
    let y1 = y * cx - z * sxr;
    let z1 = y * sxr + z * cx;
    // Y rotation
    let x1 = x * cy - z1 * syr;
    const z2 = x * syr + z1 * cy;
    // Z rotation
    const x2 = x1 * cz - y1 * szr;
    const y2 = x1 * szr + y1 * cz;
    x1 = x2;
    y1 = y2;
    return [x1 + pos[0], y1 + pos[1], z2 + pos[2]];
  };

  return faces.map((f) => ({ ...f, pts: f.pts.map(apply) }));
}

/* ------------------------------------------------------------------ */
/* view + projection                                                   */
/* ------------------------------------------------------------------ */

export interface ViewState {
  /** radians, rotation about the vertical axis */
  yaw: number;
  /** radians, negative looks down from above */
  pitch: number;
  zoom: number;
}

export const DEFAULT_VIEW: ViewState = { yaw: -0.62, pitch: -0.34, zoom: 1 };

function rotateView(v: V3, view: ViewState): V3 {
  const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
  const x1 = v[0] * cy - v[2] * sy;
  const z1 = v[0] * sy + v[2] * cy;
  const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  const y2 = v[1] * cp - z1 * sp;
  const z2 = v[1] * sp + z1 * cp;
  return [x1, y2, z2];
}

export interface ProjectedFace {
  partId: string;
  partName: string;
  category: PartCategoryId;
  points: string;
  fill: string;
  opacity: number;
  kind: FaceKind;
  depth: number;
}

export interface ProjectedScene {
  faces: ProjectedFace[];
  shield: { points: string; depth: number }[][];
  plumes: { points: string; fill: string; opacity: number; core: string; coreOpacity: number }[];
  deck: string[];
  shadow: { cx: number; cy: number; rx: number; ry: number } | null;
  bounds: { width: number; height: number; scale: number; offsetX: number; offsetY: number };
  camera: { x: number; y: number; z: number };
}

const LIGHT: V3 = normalise([-0.42, 0.74, -0.52]);
const FOCAL = 26;

/**
 * Project the whole scene into 2D. The returned polygons are already sorted
 * back-to-front and shaded, ready to be dropped into an SVG.
 */
export function projectScene(
  mesh: ShipMesh,
  view: ViewState,
  width: number,
  height: number,
  opts: { highlightPartId?: string | null; padding?: number } = {},
): ProjectedScene {
  const finite = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);
  const min: V3 = [
    finite(mesh.bounds.min[0], -1),
    finite(mesh.bounds.min[1], -1),
    finite(mesh.bounds.min[2], -1.6),
  ];
  const max: V3 = [
    finite(mesh.bounds.max[0], 1),
    finite(mesh.bounds.max[1], 1),
    finite(mesh.bounds.max[2], 1.6),
  ];
  const centre: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];

  // ---- pass 1: rotate everything into view space and measure it ---------
  const rotated = mesh.parts.map((part) =>
    part.faces.map((face) => face.pts.map((p) => rotateView(p, view))),
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
  for (const partFaces of rotated) {
    for (const face of partFaces) {
      for (const p of face) include(p);
    }
  }
  // engine plumes are drawn outside the hull, so they must count toward framing
  for (const plume of mesh.plumes) {
    const tip: V3 = [plume.origin[0], plume.origin[1], plume.origin[2] + plume.length];
    include(rotateView(plume.origin, view));
    include(rotateView(tip, view));
    include(rotateView([plume.origin[0] - plume.radius, plume.origin[1], plume.origin[2]], view));
    include(rotateView([plume.origin[0] + plume.radius, plume.origin[1], plume.origin[2]], view));
  }
  if (!Number.isFinite(vMinX)) {
    vMinX = -1;
    vMaxX = 1;
    vMinY = -1;
    vMaxY = 1;
  }

  const pad = opts.padding ?? 1.22;
  const spanX = Math.max(0.001, vMaxX - vMinX);
  const spanY = Math.max(0.001, vMaxY - vMinY);
  const scale = Math.min(width / (spanX * pad), height / (spanY * pad));
  const viewCentreX = (vMinX + vMaxX) / 2;
  const viewCentreY = (vMinY + vMaxY) / 2;
  const cam = rotateView(centre, view);
  const depthCentre = (cam[2] ?? 0) as number;

  const projectRotated = (r: V3) => {
    const depth = r[2] - depthCentre;
    const persp = FOCAL / (FOCAL + depth * 0.5);
    return {
      x: width / 2 + (r[0] - viewCentreX) * scale * persp,
      y: height / 2 - (r[1] - viewCentreY) * scale * persp,
      z: depth,
    };
  };
  const project = (v: V3) => projectRotated(rotateView(v, view));

  const shade = (rgb: [number, number, number], pts: V3[], kind: FaceKind) => {
    const n = normalise(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const nv = rotateView(n, view);
    const diffuse = Math.max(0, dot(nv, LIGHT));
    const lum = 0.3 + 0.98 * diffuse;
    const rim = Math.pow(1 - Math.min(1, Math.abs(nv[2])), 3) * 0.2;
    const viewDir: V3 = normalise([LIGHT[0], LIGHT[1], LIGHT[2] - 1]);
    const spec = Math.pow(Math.max(0, dot(nv, viewDir)), 22) * 0.5;

    let out = scaleRgb(rgb, lum);
    out = mix(out, [125, 226, 255], rim);
    out = mix(out, [255, 255, 255], spec);

    if (kind === "emissive") out = scaleRgb(out, 1.35);
    if (kind === "glass") out = mix(out, [10, 20, 32], 0.3);
    if (kind === "dark") out = scaleRgb(out, 0.75);
    return rgbCss(out);
  };

  const out: ProjectedFace[] = [];
  mesh.parts.forEach((part, partIndex) => {
    part.faces.forEach((face, faceIndex) => {
      const rotatedPts = rotated[partIndex][faceIndex];
      const projected = rotatedPts.map((r) => projectRotated(r));
      const depth = projected.reduce((sum, p) => sum + p.z, 0) / projected.length;
      const points = projected.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      out.push({
        partId: part.partId,
        partName: part.partName,
        category: part.category,
        points,
        fill: shade(face.rgb, face.pts, face.kind),
        opacity: face.opacity ?? 1,
        kind: face.kind,
        depth,
      });
    });
  });

  out.sort((a, b) => b.depth - a.depth);

  const plumes = mesh.plumes.map((plume) => {
    const tip: V3 = [plume.origin[0], plume.origin[1], plume.origin[2] + plume.length];
    const p0 = project(plume.origin);
    const p1 = project(tip);
    // spread perpendicular to the projected exhaust direction, so flames
    // point out of the nozzles instead of sideways
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w0 = Math.max(2.2, plume.radius * scale * 0.42);
    const w1 = w0 * 0.42;
    const pts = [
      `${(p0.x + nx * w0).toFixed(1)},${(p0.y + ny * w0).toFixed(1)}`,
      `${(p1.x + nx * w1).toFixed(1)},${(p1.y + ny * w1).toFixed(1)}`,
      `${(p1.x - nx * w1).toFixed(1)},${(p1.y - ny * w1).toFixed(1)}`,
      `${(p0.x - nx * w0).toFixed(1)},${(p0.y - ny * w0).toFixed(1)}`,
    ].join(" ");
    const c0 = w0 * 0.44;
    const c1 = w1 * 0.4;
    const core = [
      `${(p0.x + nx * c0).toFixed(1)},${(p0.y + ny * c0).toFixed(1)}`,
      `${(p1.x + nx * c1).toFixed(1)},${(p1.y + ny * c1).toFixed(1)}`,
      `${(p1.x - nx * c1).toFixed(1)},${(p1.y - ny * c1).toFixed(1)}`,
      `${(p0.x - nx * c0).toFixed(1)},${(p0.y - ny * c0).toFixed(1)}`,
    ].join(" ");
    return {
      points: pts,
      fill: rgbCss(plume.rgb),
      opacity: 0.34,
      core,
      coreOpacity: 0.7,
    };
  });

  const shield = mesh.shieldRings.map((ring) =>
    ring.map((v, index) => {
      const p = project(v);
      const next = project(ring[(index + 1) % ring.length]);
      return {
        points: `${p.x.toFixed(1)},${p.y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`,
        depth: p.z,
      };
    }),
  );

  // hangar deck grid, sized to the hull footprint
  const deck: string[] = [];
  const gy = mesh.groundY;
  const gx = Math.max(4, (max[0] - min[0]) * 0.85 + 2);
  const gz = Math.max(4, (max[2] - min[2]) * 0.7 + 2);
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

  const shadowPts = [
    project([min[0] - 0.5, gy, min[2] - 0.5]),
    project([max[0] + 0.5, gy, min[2] - 0.5]),
    project([max[0] + 0.5, gy, max[2] + 0.5]),
    project([min[0] - 0.5, gy, max[2] + 0.5]),
  ];
  const sxs = shadowPts.map((p) => p.x);
  const sys = shadowPts.map((p) => p.y);
  const shadow = {
    cx: (Math.min(...sxs) + Math.max(...sxs)) / 2,
    cy: (Math.min(...sys) + Math.max(...sys)) / 2,
    rx: (Math.max(...sxs) - Math.min(...sxs)) / 2,
    ry: Math.max(6, (Math.max(...sys) - Math.min(...sys)) / 2),
  };

  return {
    faces: out,
    shield,
    plumes,
    deck,
    shadow,
    bounds: { width, height, scale, offsetX: width / 2, offsetY: height / 2 },
    camera: { x: cam[0], y: cam[1], z: cam[2] },
  };
}

/* ------------------------------------------------------------------ */
/* module -> solid geometry                                            */
/* ------------------------------------------------------------------ */

interface HullContext {
  halfWidth: number;
  halfHeight: number;
  density: "low" | "high";
  /** base hull colour, so players can preview a paint scheme */
  hullBase: [number, number, number];
}

export interface HullPalette {
  id: string;
  label: string;
  base: string;
  swatch: string;
}

export const HULL_PALETTES: HullPalette[] = [
  { id: "gunmetal", label: "Gunmetal", base: "#88929f", swatch: "#88929f" },
  { id: "ivory", label: "Ivory", base: "#c9c6bb", swatch: "#c9c6bb" },
  { id: "crimson", label: "Crimson", base: "#9c4a44", swatch: "#9c4a44" },
  { id: "emerald", label: "Emerald", base: "#5c7f6a", swatch: "#5c7f6a" },
  { id: "cobalt", label: "Cobalt", base: "#4a6180", swatch: "#4a6180" },
  { id: "sand", label: "Desert", base: "#a89372", swatch: "#a89372" },
];

export const paletteById = (id: string | undefined): HullPalette =>
  HULL_PALETTES.find((p) => p.id === id) ?? HULL_PALETTES[0];

function accentOf(category: PartCategoryId): [number, number, number] {
  return hexToRgb(categoryById[category]?.accent ?? "#38bdf8");
}

const HULL_BASE: [number, number, number] = [136, 146, 162];
const HULL_DARK: [number, number, number] = [46, 54, 68];
const CANOPY: [number, number, number] = [64, 168, 205];
const WARM: [number, number, number] = [255, 158, 74];

/** Every module is drawn from its own geometry profile so parts look distinct. */
function moduleFaces(
  part: Part,
  ctx: HullContext,
  opts: { legLength?: number; reactorLength?: number; engineScale?: number } = {},
): Face3D[] {
  const accent = accentOf(part.category);
  const tint = mix(ctx.hullBase, accent, 0.12);
  const profile = part.geometry.profile;
  const seg = ctx.density === "low" ? 8 : 12;
  const w = ctx.halfWidth * 2;

  switch (part.category) {
    case "cockpit": {
      if (profile === "arrowhead") {
        return [
          ...box(w * 0.92, ctx.halfHeight * 1.5, 3.0, tint, {
            taperFrontW: 0.34,
            taperFrontH: 0.55,
            taperTopW: 0.86,
          }),
          ...panel(w * 0.5, 0.12, 1.0, CANOPY, "glass"),
        ];
      }
      if (profile === "offset-dome") {
        const base = box(w * 1.05, ctx.halfHeight * 1.35, 2.4, tint, {
          taperFrontW: 0.7,
          taperTopW: 0.9,
        });
        const pod = transformFaces(
          [
            ...cylinder(0.55, 1.0, tint, { seg, glowFront: CANOPY }),
            ...dome(0.55, tint, { seg, rings: 2 }),
          ],
          { pos: [w * 0.28, ctx.halfHeight * 0.68, -0.2], rotX: Math.PI / 2 },
        );
        return [...base, ...pod, ...panel(w * 0.5, 0.1, 0.9, CANOPY, "glass")];
      }
      // blunt-block (Thunderbird dropship deck)
      return [
        ...box(w * 1.1, ctx.halfHeight * 1.8, 2.6, tint, { taperFrontW: 0.8, taperTopW: 0.94 }),
        ...box(w * 1.05, 0.32, 2.2, scaleRgb(tint, 0.7), { taperFrontW: 0.82 }),
        ...panel(w * 0.62, 0.13, 1.1, CANOPY, "glass"),
      ];
    }

    case "habitation": {
      const isWalkway = part.cargoSlots === 1;
      const podDepth = w * (isWalkway ? 0.85 : 1.3);
      if (isWalkway) {
        return [
          ...box(w * 0.62, ctx.halfHeight * 1.15, podDepth, tint, { taperTopW: 0.92 }),
          ...panel(w * 0.5, 0.06, podDepth * 0.8, mix(accent, [255, 255, 255], 0.4), "emissive"),
        ];
      }
      return [
        ...box(w * 1.02, ctx.halfHeight * 2, podDepth, tint, { taperTopW: 0.88 }),
        // lit window band on both flanks
        ...panel(podDepth * 0.7, 0.07, 0.12, mix(accent, [255, 255, 255], 0.4), "emissive"),
        ...transformFaces(
          panel(podDepth * 0.7, 0.07, 0.12, mix(accent, [255, 255, 255], 0.4), "emissive"),
          { pos: [w * 0.52, 0, 0], rotY: Math.PI / 2 },
        ),
        ...panel(w * 1.06, 0.12, podDepth * 0.18, scaleRgb(HULL_DARK, 1.15), "panel"),
      ];
    }

    case "reactor": {
      const radius = 0.34 + part.geometry.span * 0.016;
      const length = opts.reactorLength ?? 1.15;
      const glow = mix(accent, [255, 255, 255], 0.25);
      return [
        ...cylinder(radius, length, tint, { seg, glowFront: glow, glowBack: glow }),
        ...cylinder(radius * 1.25, 0.18, scaleRgb(tint, 0.75), { seg: Math.max(8, seg - 4) }),
      ];
    }

    case "access": {
      const inner = profile === "hidden" ? HULL_DARK : [18, 26, 38];
      return [
        ...box(w * 0.86, 0.55, 2.0, tint, { taperTopW: 0.9 }),
        ...box(w * 0.62, 0.26, 1.5, inner as [number, number, number], { kind: "dark" }),
        ...panel(w * 0.9, 0.1, 0.35, scaleRgb(accent, 0.85), "emissive"),
      ];
    }

    case "engine-main": {
      const k = opts.engineScale ?? 1;
      const radius = (0.5 + part.geometry.span * 0.035) * k;
      return [
        ...cylinder(radius, 1.3 * k, tint, { seg }),
        ...cone(radius * 1.2, 0.7 * k, scaleRgb(tint, 0.82), { seg, hollow: true, glow: WARM }),
        ...cylinder(radius * 0.86, 0.35 * k, scaleRgb(HULL_DARK, 1.15), { seg: Math.max(8, seg - 4) }),
      ];
    }

    case "engine-light": {
      const radius = 0.24 + part.geometry.span * 0.02;
      return [
        ...cylinder(radius, 0.9, tint, { seg: Math.max(8, seg - 4) }),
        ...cone(radius * 1.3, 0.5, scaleRgb(tint, 0.8), { seg, hollow: true, glow: WARM }),
      ];
    }

    case "weapon": {
      const barrel = profile === "turret" || profile === "emitter-strip" ? 0.9 : 1.5;
      const r = profile === "turret" ? 0.22 : 0.11;
      const faces: Face3D[] = [
        ...box(0.44, 0.3, 0.7, scaleRgb(tint, 0.85)),
        ...cylinder(r, barrel, scaleRgb(tint, 0.7), { seg: 8 }),
      ];
      if (profile === "turret" || profile === "blade-emitter") {
        faces.push(
          ...cylinder(r * 1.9, 0.22, scaleRgb(HULL_DARK, 1.05), { seg: 8 }),
          ...cylinder(r * 1.2, 0.06, accent, { seg: 8, kind: "emissive" } as never),
        );
      }
      return faces;
    }

    case "shield": {
      // emitter housing only - the envelope is drawn as scene geometry
      return [...cylinder(0.3, 0.6, tint, { seg: 8, glowFront: accent, glowBack: accent })];
    }

    case "landing": {
      const isPad = profile === "pad" || profile === "thruster-pad";
      const legLen = opts.legLength ?? (isPad ? 0.5 : 1.2);
      const strut = box(0.22, legLen, 0.26, scaleRgb(tint, 0.92));
      const foot = isPad
        ? cylinder(0.36, 0.2, scaleRgb(tint, 0.8), { seg: 10, glowBack: accent })
        : box(0.62, 0.16, 0.78, scaleRgb(tint, 0.8));
      const ankle = box(0.3, 0.18, 0.34, scaleRgb(tint, 0.72));
      return [
        ...transformFaces(strut, { pos: [0, -legLen / 2, 0], rotZ: 0.14 }),
        ...transformFaces(ankle, { pos: [0.08, -legLen + 0.06, 0] }),
        ...transformFaces(foot, { pos: [0.1, -legLen, 0] }),
      ];
    }

    case "wing": {
      const span = 1.6 + part.geometry.span * 0.16;
      const chord = 1.1 + part.geometry.span * 0.06;
      if (profile === "s-foil") {
        // the X pattern: two foils per side, splayed in a cross
        return [
          ...foil(span, chord * 0.85, 0.16, 0.35, 0.42, tint, { taper: 0.55 }),
          ...transformFaces(foil(span * 0.95, chord * 0.8, 0.15, 0.3, -0.38, tint, { taper: 0.6 }), {
            pos: [0, -0.35, 0.15],
          }),
        ];
      }
      if (profile === "box") {
        return [...foil(span * 0.8, chord * 1.15, 0.34, 0.05, 0.1, tint, { taper: 0.85 })];
      }
      if (profile === "pylon") {
        return [...foil(span, chord, 0.18, 0.15, 0.16, tint, { taper: 0.62 })];
      }
      if (profile === "winglet" || profile === "vent-plate" || profile === "fairing" || profile === "cowling") {
        const kind: FaceKind = "panel";
        return [
          ...panel(0.5 + part.geometry.span * 0.12, 0.42 + part.geometry.span * 0.06, 0.9 + part.geometry.span * 0.1, scaleRgb(tint, 0.95), kind),
        ];
      }
      const sweep = profile === "swept" ? 0.5 : profile === "angled" ? 0.3 : 0.15;
      return [...foil(span, chord, 0.2, sweep, profile === "angled" ? 0.34 : 0.18, tint, { taper: 0.68 })];
    }

    default:
      return [...box(1, 1, 1, tint)];
  }
}

/* ------------------------------------------------------------------ */
/* build -> scene                                                      */
/* ------------------------------------------------------------------ */

/**
 * Assemble the selected modules into a world-space scene.
 * Layout mirrors schematic.ts: landing gear first, then the hull grows
 * outward from a spine of Habitation modules and Walkways.
 */
export function buildShipMesh(build: Build, opts: { palette?: string } = {}): ShipMesh {
  const all = expandParts(build);
  const moduleCount = all.length;
  const density: "low" | "high" = moduleCount > 55 ? "low" : "high";
  const hullBase = hexToRgb(paletteById(opts.palette).base);

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

  const parts: PartMesh[] = [];
  const plumes: PlumeSpec[] = [];
  const push = (part: Part, faces: Face3D[]) => {
    if (faces.length === 0) return;
    parts.push({ partId: part.id, partName: part.name, category: part.category, faces });
  };

  // ---- hull footprint ----------------------------------------------------
  // Habitation modules are laid out on a widening footprint so a hab-heavy
  // build grows into a disc/slab hull rather than one long tube. +Z is aft.
  const habWidth = habs.length > 0 ? 1.2 + Math.max(...habs.map((h) => h.geometry.span)) * 0.1 : 1.5;
  const halfWidth = habWidth / 2;
  // Corvette hulls are wide and shallow - keeps hab clusters reading as a
  // saucer/slab rather than a tower of cubes.
  const halfHeight = 0.46;
  const ctx: HullContext = { halfWidth, halfHeight, density, hullBase };

  const cockpitLen = cockpits.length > 0 ? 2.4 : 0;
  // Tiles are square and alternate 90 degrees, so a hand-placed hull fills a
  // disc instead of stacking into a corridor.
  const habLen = habWidth * 1.04;

  // Spiral outward from the centre so hulls grow as discs first and only
  // then spread sideways - a 3-hab ship should be a saucer, not a corridor.
  const FOOTPRINT: [number, number][] = [
    [0, 0],
    [-1, 0],
    [0, -1],
    [-1, -1],
    [1, 0],
    [1, -1],
    [0, 1],
    [-1, 1],
    [1, 1],
    [-2, 0],
    [-2, -1],
    [2, 0],
    [2, -1],
    [-2, 1],
    [2, 1],
    [-2, -2],
    [-1, -2],
    [0, -2],
    [1, -2],
    [2, -2],
  ];
  const stepX = habWidth * 1.0;
  const stepZ = habLen * 1.0;

  const placedHabs: { hab: Part; x: number; z: number; rot: number }[] = habs.map((hab, index) => {
    const [cx, cz] = FOOTPRINT[index % FOOTPRINT.length];
    // checkerboard rotation keeps the cluster gap-free and disc-like
    const rot = ((cx + cz) % 2 === 0 ? 1 : -1) * 0.06 + (Math.abs(cx + cz) % 2 === 1 ? Math.PI / 2 : 0);
    return { hab, x: cx * stepX, z: cz * stepZ, rot };
  });

  const rows = placedHabs.map((h) => h.z);
  const zFront = rows.length > 0 ? Math.min(...rows) : 0;
  const zBack = rows.length > 0 ? Math.max(...rows) : 0;
  const colsX = placedHabs.map((h) => h.x);
  const xMin = colsX.length > 0 ? Math.min(...colsX) : 0;
  const xMax = colsX.length > 0 ? Math.max(...colsX) : 0;

  // Hull plates: a thin deck spanning the whole hab cluster turns a pile of
  // modules into one continuous ship, and gives walkways something to sit on.
  const podDepthFor = (span: number) => (1.2 + span * 0.1) * 1.3;
  if (habs.length >= 2) {
    const plateW = Math.max(1, xMax - xMin) + habWidth * 1.14;
    const plateD = Math.max(1, zBack - zFront) + podDepthFor(habs[0].geometry.span) * 1.02;
    const plateX = (xMin + xMax) / 2;
    const plateZ = (zFront + zBack) / 2;
    const hullRgb = mix(ctx.hullBase, [0, 0, 0], 0.26);
    // single tapered slab forms the hull body; pods sit flush inside it
    push(habs[0], transformFaces(
      box(plateW, halfHeight * 2, plateD, hullRgb, { taperTopW: 0.88 }),
      { pos: [plateX, 0, plateZ] },
    ));
    // inset dorsal deck so the top reads as structure, not a flat lid
    push(habs[0], transformFaces(
      box(plateW * 0.86, 0.1, plateD * 0.88, scaleRgb(hullRgb, 1.12), { taperTopW: 0.94 }),
      { pos: [plateX, halfHeight + 0.03, plateZ] },
    ));
    // spine rail along the centreline
    push(habs[0], transformFaces(
      box(plateW * 0.16, 0.14, plateD * 0.98, scaleRgb(hullRgb, 1.2)),
      { pos: [plateX, halfHeight + 0.09, plateZ] },
    ));
  }

  // cockpit sits at the very nose, offset to one side for offset-dome bridges
  const noseZ = zFront - habLen / 2 - cockpitLen / 2;
  if (cockpits[0]) {
    const isOffset = cockpits[0].geometry.profile === "offset-dome";
    const faces = transformFaces(moduleFaces(cockpits[0], ctx), {
      pos: [isOffset ? stepX * 0.5 : 0, isOffset ? 0.22 : 0, noseZ],
    });
    push(cockpits[0], faces);
  }

  for (const { hab, x, z, rot } of placedHabs) {
    push(hab, transformFaces(moduleFaces(hab, ctx), { pos: [x, 0, z], rotY: rot }));
  }

  // Walkways continue the same spiral aft-ward, so they extend the hull
  // without turning the silhouette into a pencil.
  const walkwayLen = 1.5;
  const walkwaySpanX = stepX * 0.72;
  let walkwayTailZ = zBack;
  walkways.forEach((walkway, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const spread = walkways.length === 1 ? 0 : (col === 0 ? -1 : 1) * walkwaySpanX * 0.85;
    const z = zBack + habLen / 2 + walkwayLen * (0.55 + row * 0.95);
    walkwayTailZ = Math.max(walkwayTailZ, z);
    push(walkway, transformFaces(moduleFaces(walkway, ctx), { pos: [spread, 0, z] }));
  });

  const tailZ = walkways.length > 0
    ? walkwayTailZ + walkwayLen / 2
    : zBack + habLen / 2;
  const hullZMin = Math.min(noseZ - cockpitLen / 2, zFront - habLen / 2);
  const hullZMax = tailZ;
  const hullMidZ = (hullZMin + hullZMax) / 2;
  const hullTop = halfHeight;
  const hullBottom = -halfHeight;

  // ---- dorsal reactors ---------------------------------------------------
  reactors.forEach((reactor, index) => {
    const t = reactors.length === 1 ? 0.45 : index / (reactors.length - 1);
    const z = zFront - habLen / 2 + 0.9 + t * Math.max(1, zBack - zFront + habLen - 1.8);
    const x = reactors.length > 3 ? (index % 2 === 0 ? -halfWidth * 0.5 : halfWidth * 0.5) : 0;
    push(
      reactor,
      transformFaces(moduleFaces(reactor, ctx, { reactorLength: 1.15 }), {
        pos: [x, hullTop - 0.02, z],
        rotX: Math.PI / 2,
      }),
    );
  });

  // ---- ventral landing bays ---------------------------------------------
  bays.forEach((bay, index) => {
    const t = bays.length === 1 ? 0.45 : index / (bays.length - 1);
    const z = zFront + 0.4 + t * Math.max(1, zBack - zFront - 0.8);
    push(bay, transformFaces(moduleFaces(bay, ctx), { pos: [0, -halfHeight - 0.22, z] }));
  });

  // ---- wings -------------------------------------------------------------
  // Heavy hulls get relatively smaller wings: a 40-module ship with fighter
  // wings looks like a toy.
  const bulkPenalty = all.length > 26 ? Math.max(0.45, 1 - (all.length - 26) * 0.012) : 1;
  const wingSpanBase =
    (1.7 + Math.max(0, ...wings.map((w) => w.geometry.span)) * 0.2) * bulkPenalty;
  const wingPairs: Part[][] = [];
  for (let i = 0; i < wings.length; i += 2) wingPairs.push(wings.slice(i, i + 2));
  wingPairs.forEach((pair, index) => {
    const sample = pair[0];
    const t = wingPairs.length === 1 ? 0.55 : 0.22 + (index / Math.max(1, wingPairs.length - 1)) * 0.6;
    const z = zFront - habLen / 2 + 0.5 + t * Math.max(1.5, tailZ - zFront + habLen);
    const isSFoil = sample.geometry.profile === "s-foil";
    for (const [sideIndex, side] of ([-1, 1] as const).entries()) {
      const part = pair[sideIndex] ?? sample;
      const extra = pair[sideIndex + 2];
      const placed = transformFaces(moduleFaces(part, ctx), {
        pos: [side * (halfWidth + 0.05), isSFoil ? 0.08 : side < 0 ? -0.06 : 0.06, z],
        rotY: side < 0 ? Math.PI : 0,
        rotZ: side * 0.05,
      });
      push(part, placed);
      if (extra) {
        push(
          extra,
          transformFaces(moduleFaces(extra, ctx), {
            pos: [side * (halfWidth + 0.05), isSFoil ? -0.32 : -0.24, z + 0.25],
            rotY: side < 0 ? Math.PI : 0,
            rotZ: side * 0.08,
          }),
        );
      }
    }
  });

  // ---- external plating (clads the outer hull edges) ---------------------
  platings.forEach((plate, index) => {
    const t = platings.length === 1 ? 0.5 : (index + 1) / (platings.length + 1);
    const z = zFront - habLen / 2 + t * Math.max(1, zBack - zFront + habLen);
    for (const side of [-1, 1] as const) {
      push(
        plate,
        transformFaces(moduleFaces(plate, ctx), {
          pos: [side * (halfWidth + 0.1), 0.04 * side, z],
          rotY: side < 0 ? Math.PI : 0,
        }),
      );
    }
  });

  // ---- weapon hardpoints -------------------------------------------------
  const outerX = wingPairs.length > 0 ? halfWidth + wingSpanBase * 0.95 : halfWidth + 0.4;
  weapons.forEach((weapon, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const row = Math.floor(index / 2);
    const onWing = wingPairs.length > 0 && index < wingPairs.length * 2;
    const z = zFront - habLen / 2 + 1.0 + row * 1.15;
    const y = row % 2 === 0 ? 0.2 : -0.24;
    const x = onWing
      ? halfWidth + wingSpanBase * (0.85 + (row % 2) * 0.1)
      : halfWidth + 0.3 + row * 0.12;
    push(
      weapon,
      transformFaces(moduleFaces(weapon, ctx), {
        pos: [side * x, y, z],
        rotY: side < 0 ? Math.PI : 0,
      }),
    );
  });

  // ---- main engines ------------------------------------------------------
  const spacing = Math.min(1.45, 3.4 / Math.max(1, mains.length));
  mains.forEach((engine, index) => {
    const offset = (index - (mains.length - 1) / 2) * spacing;
    const z = tailZ + 0.55;
    push(
      engine,
      transformFaces(moduleFaces(engine, ctx, { engineScale: 0.8 }), {
        pos: [offset, -0.04, z],
        rotX: Math.PI / 2,
      }),
    );
    const radius = (0.42 + engine.geometry.span * 0.028) * 0.82;
    plumes.push({ origin: [offset, -0.04, z + 1.0], radius, length: 1.35 + radius * 0.7, rgb: WARM });
  });

  // ---- light thrusters ---------------------------------------------------
  lights.forEach((engine, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const row = Math.floor(index / 2);
    const offset = side * (halfWidth * 0.85 + row * 0.7);
    const z = tailZ + 0.28 + row * 0.2;
    const y = mains.length > 0 ? (row % 2 === 0 ? 0.38 : -0.38) : 0;
    push(
      engine,
      transformFaces(moduleFaces(engine, ctx), { pos: [offset, y, z], rotX: Math.PI / 2 }),
    );
    plumes.push({
      origin: [offset, y, z + 0.58],
      radius: 0.2,
      length: 0.85,
      rgb: mix(WARM, [120, 200, 255], 0.35),
    });
  });

  // ---- landing gear ------------------------------------------------------
  const needsTallLegs = gears.some((g) => g.geometry.profile === "leg" || g.geometry.profile === "heavy-strut");
  const gearClearance = needsTallLegs ? 1.5 : 1.05;
  const groundY = -halfHeight - gearClearance;
  const gearSpread = Math.max(0.6, halfWidth * 0.6);
  gears.forEach((gear, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const row = Math.floor(index / 2);
    const zs = [zFront - habLen * 0.28, zFront + habLen * 0.15, zBack + habLen * 0.3];
    const x = gears.length <= 2 ? side * gearSpread : side * (gearSpread + row * 0.3);
    const z = zs[Math.min(row, zs.length - 1)];
    push(
      gear,
      transformFaces(moduleFaces(gear, ctx, { legLength: gearClearance }), {
        pos: [x, -halfHeight, z],
      }),
    );
  });

  // ---- shield envelope ---------------------------------------------------
  const shieldRings: V3[][] = [];
  if (shields.length > 0) {
    const radiusX = halfWidth + 0.85;
    const radiusY = halfHeight + gearClearance * 0.75 + 0.35;
    const radiusZ = (hullZMax - hullZMin) / 2 + 0.9;
    const seg = 26;
    for (const tilt of [0]) {
      const ring: V3[] = [];
      for (let i = 0; i < seg; i += 1) {
        const a = (i / seg) * Math.PI * 2;
        const x = Math.cos(a) * radiusX;
        const z = Math.sin(a) * radiusZ;
        ring.push([x, Math.sin(tilt) * z * 0.55 + 0.1, z * Math.cos(tilt) + hullMidZ]);
      }
      shieldRings.push(ring);
    }
    for (const tilt of [-0.5]) {
      const ring: V3[] = [];
      for (let i = 0; i < seg; i += 1) {
        const a = (i / seg) * Math.PI * 2;
        const x = Math.cos(a) * radiusX * 0.8;
        const y = Math.sin(a) * radiusY;
        ring.push([x, y, Math.sin(tilt) * radiusZ * 0.85 + hullMidZ]);
      }
      shieldRings.push(ring);
    }
  }

  // ---- bounds ------------------------------------------------------------
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
  if (!Number.isFinite(min[0])) {
    min[0] = min[1] = min[2] = -1;
    max[0] = max[1] = max[2] = 1;
  }
  if (parts.length === 0) {
    min[0] = -1;
    max[0] = 1;
    min[1] = -1;
    max[1] = 1;
    min[2] = -1.6;
    max[2] = 1.6;
  }

  return {
    parts,
    shieldRings,
    plumes,
    bounds: { min, max },
    groundY: parts.length > 0 ? groundY : -1.2,
    moduleCount,
  };
}

/**
 * A single module rendered on its own, for the part portraits in the picker.
 * Returns the same projected face structure as a full ship so it can be drawn
 * with the same component.
 */
export function buildPartMesh(part: Part, opts: { palette?: string } = {}): ShipMesh {
  const span = part.geometry.span;
  const halfWidth = 1.0 + span * 0.06;
  const ctx: HullContext = {
    halfWidth,
    halfHeight: 0.8,
    density: "high",
    hullBase: hexToRgb(paletteById(opts.palette).base),
  };
  const faces = moduleFaces(part, ctx);

  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const face of faces) {
    for (const p of face.pts) {
      min[0] = Math.min(min[0], p[0]);
      min[1] = Math.min(min[1], p[1]);
      min[2] = Math.min(min[2], p[2]);
      max[0] = Math.max(max[0], p[0]);
      max[1] = Math.max(max[1], p[1]);
      max[2] = Math.max(max[2], p[2]);
    }
  }

  return {
    parts: [{ partId: part.id, partName: part.name, category: part.category, faces }],
    shieldRings: [],
    plumes: [],
    bounds: { min, max },
    groundY: -2,
    moduleCount: 1,
  };
}

export const categoryAccent = (category: PartCategoryId): string =>
  categoryById[category]?.accent ?? "#38bdf8";

export function partByIdSafe(id: string): Part | undefined {
  return partById[id];
}
