import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Procedural high-detail geometry for every corvette archetype.
 *
 * Each archetype returns four merged buffers — hull, detail (greebles /
 * armour), glass and glow — so a part costs four draw calls no matter how much
 * surface detail it carries. Everything is deterministic and cached, so a
 * hundred identical thrusters share one geometry.
 *
 * When a real extracted mesh exists in `public/models/` the registry in
 * `ModelRegistry.ts` wins and these builders are only the fallback.
 */

export interface PartGeometrySet {
  hull: THREE.BufferGeometry;
  detail: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
}

const EMPTY = new THREE.BufferGeometry();

/* ------------------------------------------------------------------ */
/* Primitive helpers                                                   */
/* ------------------------------------------------------------------ */

const bx = (w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, d));
  g.translate(x, y, z);
  return g;
};

const cyl = (
  r: number,
  h: number,
  axis: "x" | "y" | "z" = "y",
  x = 0,
  y = 0,
  z = 0,
  segments = 18,
): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(Math.max(0.01, r), Math.max(0.01, r), Math.max(0.01, h), segments);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  if (axis === "z") g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
};

const sphere = (r: number, x = 0, y = 0, z = 0, seg = 20): THREE.BufferGeometry => {
  const g = new THREE.SphereGeometry(Math.max(0.01, r), seg, Math.max(8, seg / 2));
  g.translate(x, y, z);
  return g;
};

/** Tapered box: a nose cone / wedge without needing an extrude profile. */
const taper = (
  w: number,
  h: number,
  d: number,
  scaleFront: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(
    Math.max(0.02, (Math.min(w, h) / 2) * scaleFront),
    Math.max(0.02, Math.min(w, h) / 2),
    Math.max(0.01, d),
    4,
    1,
  );
  g.rotateX(Math.PI / 2);
  g.rotateZ(Math.PI / 4);
  g.scale(w / Math.max(0.02, Math.min(w, h)), h / Math.max(0.02, Math.min(w, h)), 1);
  g.translate(x, y, z);
  return g;
};

const merge = (geoms: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const clean = geoms.filter((g) => g.attributes.position && g.attributes.position.count > 0);
  if (clean.length === 0) return EMPTY.clone();
  if (clean.length === 1) return clean[0]!;
  const merged = mergeGeometries(clean, false);
  return merged ?? EMPTY.clone();
};

/** Deterministic pseudo-random so greebles never shimmer between renders. */
const seeded = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
};

/** Small panel lines / vents scattered over a face. */
function greebles(
  size: { x: number; y: number; z: number },
  count: number,
  face: "x" | "y" | "z" | "all" = "all",
  seed = 7,
): THREE.BufferGeometry {
  const rng = seeded(seed);
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i += 1) {
    const axis = face === "all" ? (["x", "y", "z"] as const)[Math.floor(rng() * 3)]! : face;
    const w = 0.1 + rng() * 0.35;
    const h = 0.06 + rng() * 0.18;
    const depth = 0.05 + rng() * 0.09;
    if (axis === "x") {
      const s = rng() > 0.5 ? 1 : -1;
      out.push(bx(depth, h, w, s * (size.x / 2 + depth / 2 - 0.02), (rng() - 0.5) * size.y * 0.7, (rng() - 0.5) * size.z * 0.7));
    } else if (axis === "y") {
      const s = rng() > 0.5 ? 1 : -1;
      out.push(bx(w, depth, h, (rng() - 0.5) * size.x * 0.7, s * (size.y / 2 + depth / 2 - 0.02), (rng() - 0.5) * size.z * 0.7));
    } else {
      const s = rng() > 0.5 ? 1 : -1;
      out.push(bx(w, h, depth, (rng() - 0.5) * size.x * 0.7, (rng() - 0.5) * size.y * 0.7, s * (size.z / 2 + depth / 2 - 0.02)));
    }
  }
  return merge(out);
}

/** Ring of bolts around a cylinder. */
const boltRing = (r: number, z: number, count = 8): THREE.BufferGeometry => {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    out.push(bx(0.09, 0.09, 0.09, Math.cos(angle) * r, Math.sin(angle) * r, z));
  }
  return merge(out);
};

/* ------------------------------------------------------------------ */
/* Archetype recipes                                                   */
/* ------------------------------------------------------------------ */

type Recipe = (size: THREE.Vector3) => PartGeometrySet;

const set = (
  hull: THREE.BufferGeometry[],
  detail: THREE.BufferGeometry[] = [],
  glass: THREE.BufferGeometry[] = [],
  glow: THREE.BufferGeometry[] = [],
): PartGeometrySet => ({
  hull: merge(hull),
  detail: merge(detail),
  glass: merge(glass),
  glow: merge(glow),
});

const RECIPES: Record<string, Recipe> = {
  /* ---------------- cockpits ---------------- */
  "cockpit-wedge": (s) =>
    set(
      [bx(s.x, s.y * 0.62, s.z, 0, -s.y * 0.19, 0), taper(s.x * 0.9, s.y * 0.7, s.z * 0.6, 0.45, 0, s.y * 0.05, s.z * 0.5)],
      [greebles(s, 10, "all", 11), bx(s.x * 0.9, 0.08, s.z * 0.5, 0, s.y * 0.32, -s.z * 0.1)],
      [bx(s.x * 0.74, s.y * 0.3, s.z * 0.42, 0, s.y * 0.2, s.z * 0.22)],
      [bx(s.x * 0.5, 0.07, 0.07, 0, -s.y * 0.1, s.z * 0.5)],
    ),
  "cockpit-dome": (s) =>
    set(
      [bx(s.x, s.y * 0.55, s.z, 0, -s.y * 0.22, 0)],
      [greebles(s, 8, "all", 23), cyl(s.x * 0.42, 0.14, "y", 0, -s.y * 0.5, 0)],
      [sphere(s.x * 0.42, 0, s.y * 0.12, s.z * 0.08)],
      [bx(s.x * 0.4, 0.06, 0.06, 0, -s.y * 0.16, s.z * 0.48)],
    ),
  "cockpit-mack": (s) =>
    set(
      [bx(s.x, s.y * 0.78, s.z * 0.92, 0, -s.y * 0.1, 0), bx(s.x * 0.8, s.y * 0.3, s.z * 0.3, 0, s.y * 0.3, s.z * 0.4)],
      [greebles(s, 12, "all", 31), bx(s.x * 1.02, 0.12, 0.12, 0, -s.y * 0.44, 0)],
      [bx(s.x * 0.86, s.y * 0.34, 0.14, 0, s.y * 0.18, s.z * 0.47)],
      [bx(s.x * 0.6, 0.07, 0.07, 0, s.y * 0.36, s.z * 0.42)],
    ),

  /* ---------------- habitation ---------------- */
  "hab-box": (s) =>
    set(
      [bx(s.x, s.y, s.z), bx(s.x * 1.03, s.y * 0.1, s.z * 1.03, 0, s.y * 0.42, 0), bx(s.x * 1.03, s.y * 0.1, s.z * 1.03, 0, -s.y * 0.42, 0)],
      [greebles(s, 26, "all", 41), cyl(s.x * 0.16, s.y * 1.02, "y", s.x * 0.36, 0, s.z * 0.36), cyl(s.x * 0.16, s.y * 1.02, "y", -s.x * 0.36, 0, -s.z * 0.36)],
      [bx(s.x * 0.5, s.y * 0.24, 0.08, 0, s.y * 0.1, s.z * 0.51), bx(s.x * 0.5, s.y * 0.24, 0.08, 0, s.y * 0.1, -s.z * 0.51)],
      [bx(s.x * 0.34, 0.07, 0.07, 0, -s.y * 0.3, s.z * 0.51)],
    ),
  "hab-curved": (s) =>
    set(
      [cyl(s.x * 0.5, s.z, "z", 0, 0, 0, 20), bx(s.x, s.y * 0.4, s.z, 0, -s.y * 0.3, 0)],
      [greebles(s, 20, "all", 53), cyl(s.x * 0.52, 0.14, "z", 0, 0, s.z * 0.3, 20), cyl(s.x * 0.52, 0.14, "z", 0, 0, -s.z * 0.3, 20)],
      [bx(s.x * 0.6, s.y * 0.2, 0.08, 0, s.y * 0.16, s.z * 0.5), bx(s.x * 0.6, s.y * 0.2, 0.08, 0, s.y * 0.16, -s.z * 0.5)],
      [bx(s.x * 0.4, 0.07, 0.07, 0, -s.y * 0.24, s.z * 0.5)],
    ),
  walkway: (s) =>
    set(
      [bx(s.x, s.y, s.z), bx(s.x * 0.6, s.y * 1.06, s.z * 0.3, 0, 0, 0)],
      [greebles(s, 12, "all", 67), bx(s.x * 1.04, 0.1, s.z * 1.04, 0, s.y * 0.44, 0)],
      [bx(s.x * 0.7, s.y * 0.4, 0.06, 0, s.y * 0.1, s.z * 0.51), bx(s.x * 0.7, s.y * 0.4, 0.06, 0, s.y * 0.1, -s.z * 0.51)],
      [bx(s.x * 0.3, 0.06, 0.06, 0, -s.y * 0.3, s.z * 0.51)],
    ),
  "walkway-curved": (s) =>
    set(
      [cyl(s.x * 0.48, s.z, "z", 0, 0, 0, 18)],
      [greebles(s, 10, "all", 71), cyl(s.x * 0.5, 0.12, "z", 0, 0, 0, 18)],
      [bx(s.x * 0.6, s.y * 0.34, 0.06, 0, s.y * 0.14, s.z * 0.5)],
      [bx(s.x * 0.3, 0.06, 0.06, 0, -s.y * 0.26, s.z * 0.5)],
    ),

  /* ---------------- docking ---------------- */
  "landing-bay": (s) =>
    set(
      [bx(s.x, s.y, s.z * 0.5, 0, 0, -s.z * 0.25), bx(s.x * 0.86, s.y * 0.72, s.z * 0.56, 0, -s.y * 0.1, s.z * 0.24)],
      [greebles(s, 14, "all", 83), bx(s.x * 0.9, 0.1, s.z * 0.6, 0, s.y * 0.44, s.z * 0.1)],
      [bx(s.x * 0.6, s.y * 0.2, 0.08, 0, s.y * 0.26, -s.z * 0.5)],
      [bx(s.x * 0.7, 0.06, s.z * 0.4, 0, -s.y * 0.44, s.z * 0.24)],
    ),
  "landing-bay-curved": (s) =>
    set(
      [cyl(s.x * 0.5, s.z * 0.6, "z", 0, 0, -s.z * 0.2, 18), bx(s.x * 0.84, s.y * 0.7, s.z * 0.5, 0, -s.y * 0.12, s.z * 0.24)],
      [greebles(s, 12, "all", 89)],
      [bx(s.x * 0.5, s.y * 0.2, 0.08, 0, s.y * 0.24, -s.z * 0.5)],
      [bx(s.x * 0.66, 0.06, s.z * 0.36, 0, -s.y * 0.44, s.z * 0.24)],
    ),

  /* ---------------- landing gear ---------------- */
  "gear-strut": (s) =>
    set(
      [cyl(s.x * 0.16, s.y * 0.8, "y", 0, s.y * 0.1, 0), bx(s.x * 0.62, s.y * 0.22, s.z * 0.62, 0, -s.y * 0.36, 0)],
      [cyl(s.x * 0.22, s.y * 0.2, "y", 0, s.y * 0.4, 0), greebles(s, 4, "y", 97)],
      [],
      [bx(s.x * 0.3, 0.05, s.z * 0.3, 0, -s.y * 0.46, 0)],
    ),
  "gear-magfield": (s) =>
    set(
      [cyl(s.x * 0.24, s.y * 0.5, "y", 0, s.y * 0.2, 0), cyl(s.x * 0.42, s.y * 0.24, "y", 0, -s.y * 0.28, 0, 20)],
      [cyl(s.x * 0.3, s.y * 0.1, "y", 0, s.y * 0.44, 0)],
      [],
      [cyl(s.x * 0.44, 0.08, "y", 0, -s.y * 0.42, 0, 20), cyl(s.x * 0.2, 0.06, "y", 0, -s.y * 0.1, 0, 16)],
    ),
  "gear-quad": (s) =>
    set(
      [bx(s.x * 0.4, s.y * 0.3, s.z * 0.4, 0, s.y * 0.3, 0), ...[1, -1].flatMap((sx) =>
        [1, -1].map((sz) => cyl(s.x * 0.09, s.y * 0.7, "y", sx * s.x * 0.3, -s.y * 0.05, sz * s.z * 0.3, 10)),
      ), ...[1, -1].flatMap((sx) =>
        [1, -1].map((sz) => bx(s.x * 0.22, s.y * 0.12, s.z * 0.22, sx * s.x * 0.3, -s.y * 0.42, sz * s.z * 0.3)),
      )],
      [greebles(s, 4, "y", 101)],
      [],
      [],
    ),
  "gear-thruster": (s) =>
    set(
      [cyl(s.x * 0.34, s.z * 0.8, "z", 0, 0, 0, 16), cyl(s.x * 0.1, s.y * 0.5, "y", 0, s.y * 0.3, 0, 10)],
      [boltRing(s.x * 0.34, -s.z * 0.4)],
      [],
      [cyl(s.x * 0.22, 0.1, "z", 0, 0, -s.z * 0.42, 16)],
    ),

  /* ---------------- reactor ---------------- */
  reactor: (s) =>
    set(
      [cyl(s.x * 0.44, s.y * 0.94, "y", 0, 0, 0, 22), bx(s.x * 0.8, s.y * 0.3, s.z * 0.8, 0, -s.y * 0.36, 0)],
      [boltRing(0, 0, 1), cyl(s.x * 0.5, s.y * 0.16, "y", 0, s.y * 0.24, 0, 22), greebles(s, 8, "y", 113)],
      [],
      [
        cyl(s.x * 0.2, s.y * 1.0, "y", 0, 0, 0, 16),
        cyl(s.x * 0.3, 0.08, "y", 0, -s.y * 0.46, 0, 18),
        cyl(s.x * 0.3, 0.08, "y", 0, s.y * 0.46, 0, 18),
      ],
    ),

  /* ---------------- thrusters & engines ---------------- */
  "thruster-nacelle": (s) =>
    set(
      [cyl(s.x * 0.44, s.z * 0.86, "z", 0, 0, 0, 20), bx(s.x * 0.34, s.y * 0.4, s.z * 0.5, 0, s.y * 0.32, 0)],
      [boltRing(s.x * 0.44, -s.z * 0.4, 10), cyl(s.x * 0.46, 0.16, "z", 0, 0, s.z * 0.2, 20)],
      [],
      [cyl(s.x * 0.3, 0.12, "z", 0, 0, -s.z * 0.46, 18)],
    ),
  "thruster-curved": (s) =>
    set(
      [sphere(s.x * 0.44, 0, 0, s.z * 0.12), cyl(s.x * 0.36, s.z * 0.6, "z", 0, 0, -s.z * 0.2, 20)],
      [cyl(s.x * 0.4, 0.14, "z", 0, 0, s.z * 0.1, 20)],
      [],
      [cyl(s.x * 0.26, 0.12, "z", 0, 0, -s.z * 0.48, 18)],
    ),
  "thruster-slim": (s) =>
    set(
      [cyl(s.x * 0.4, s.z * 0.9, "z", 0, 0, 0, 18), taper(s.x * 0.8, s.y * 0.8, s.z * 0.3, 0.4, 0, 0, s.z * 0.55)],
      [cyl(s.x * 0.44, 0.12, "z", 0, 0, -s.z * 0.1, 18)],
      [],
      [cyl(s.x * 0.28, 0.1, "z", 0, 0, -s.z * 0.48, 16)],
    ),
  "thruster-twin": (s) =>
    set(
      [cyl(s.x * 0.2, s.z * 0.8, "z", -s.x * 0.24, 0, 0, 14), cyl(s.x * 0.2, s.z * 0.8, "z", s.x * 0.24, 0, 0, 14), bx(s.x * 0.9, s.y * 0.34, s.z * 0.4, 0, s.y * 0.2, 0)],
      [boltRing(0, 0, 1), bx(s.x * 0.5, 0.1, s.z * 0.2, 0, s.y * 0.4, 0)],
      [],
      [cyl(s.x * 0.14, 0.1, "z", -s.x * 0.24, 0, -s.z * 0.44, 12), cyl(s.x * 0.14, 0.1, "z", s.x * 0.24, 0, -s.z * 0.44, 12)],
    ),
  "thruster-box": (s) =>
    set(
      [bx(s.x * 0.9, s.y * 0.9, s.z * 0.8), bx(s.x * 0.6, s.y * 0.6, s.z * 0.3, 0, 0, -s.z * 0.5)],
      [greebles(s, 8, "all", 127)],
      [],
      [bx(s.x * 0.44, s.y * 0.44, 0.1, 0, 0, -s.z * 0.62)],
    ),
  "thruster-wide": (s) =>
    set(
      [bx(s.x * 0.94, s.y * 0.8, s.z * 0.7), cyl(s.x * 0.24, s.z * 0.4, "z", 0, 0, -s.z * 0.5, 18)],
      [greebles(s, 8, "all", 131), bx(s.x * 0.98, 0.1, s.z * 0.4, 0, s.y * 0.42, 0)],
      [],
      [cyl(s.x * 0.18, 0.1, "z", 0, 0, -s.z * 0.68, 16)],
    ),
  booster: (s) =>
    set(
      [cyl(s.x * 0.46, s.z * 0.78, "z", 0, 0, 0, 22), bx(s.x * 0.5, s.y * 0.36, s.z * 0.5, 0, s.y * 0.3, 0)],
      [boltRing(s.x * 0.46, -s.z * 0.38, 12), cyl(s.x * 0.5, 0.18, "z", 0, 0, s.z * 0.16, 22), greebles(s, 6, "z", 137)],
      [],
      [cyl(s.x * 0.34, 0.16, "z", 0, 0, -s.z * 0.46, 20)],
    ),
  "booster-curved": (s) =>
    set(
      [sphere(s.x * 0.46, 0, 0, s.z * 0.14), cyl(s.x * 0.38, s.z * 0.6, "z", 0, 0, -s.z * 0.2, 22)],
      [cyl(s.x * 0.42, 0.16, "z", 0, 0, s.z * 0.1, 22)],
      [],
      [cyl(s.x * 0.28, 0.14, "z", 0, 0, -s.z * 0.48, 20)],
    ),
  "booster-slim": (s) =>
    set(
      [cyl(s.x * 0.42, s.z * 0.86, "z", 0, 0, 0, 20), taper(s.x * 0.84, s.y * 0.84, s.z * 0.28, 0.35, 0, 0, s.z * 0.56)],
      [cyl(s.x * 0.46, 0.14, "z", 0, 0, -s.z * 0.14, 20)],
      [],
      [cyl(s.x * 0.3, 0.14, "z", 0, 0, -s.z * 0.48, 18)],
    ),

  /* ---------------- shields ---------------- */
  "shield-disc": (s) =>
    set(
      [cyl(s.x * 0.48, s.y * 0.5, "y", 0, 0, 0, 26), cyl(s.x * 0.3, s.y * 0.9, "y", 0, 0, 0, 20)],
      [boltRing(s.x * 0.44, 0, 12)],
      [],
      [cyl(s.x * 0.5, 0.05, "y", 0, s.y * 0.3, 0, 26)],
    ),
  "shield-ring": (s) =>
    set(
      [new THREE.TorusGeometry(s.x * 0.4, s.y * 0.2, 12, 26).rotateX(Math.PI / 2).translate(0, 0, 0), cyl(s.x * 0.16, s.y * 0.9, "y", 0, 0, 0, 16)],
      [boltRing(s.x * 0.16, 0, 8)],
      [],
      [new THREE.TorusGeometry(s.x * 0.4, 0.05, 8, 26).rotateX(Math.PI / 2)],
    ),
  "shield-dome": (s) =>
    set(
      [sphere(s.x * 0.44, 0, -s.y * 0.06, 0), cyl(s.x * 0.46, s.y * 0.3, "y", 0, -s.y * 0.3, 0, 22)],
      [boltRing(s.x * 0.44, 0, 12)],
      [sphere(s.x * 0.3, 0, s.y * 0.06, 0, 14)],
      [cyl(s.x * 0.2, 0.06, "y", 0, s.y * 0.34, 0, 16)],
    ),

  /* ---------------- weapons ---------------- */
  "turret-cannon": (s) =>
    set(
      [cyl(s.x * 0.4, s.y * 0.4, "y", 0, -s.y * 0.24, 0, 20), bx(s.x * 0.6, s.y * 0.44, s.z * 0.7, 0, s.y * 0.1, 0), cyl(s.x * 0.1, s.z * 0.9, "z", 0, s.y * 0.16, s.z * 0.5, 12)],
      [greebles(s, 6, "all", 149), boltRing(s.x * 0.38, 0, 10)],
      [],
      [cyl(s.x * 0.07, 0.1, "z", 0, s.y * 0.16, s.z * 0.98, 10)],
    ),
  "turret-beam": (s) =>
    set(
      [cyl(s.x * 0.38, s.y * 0.36, "y", 0, -s.y * 0.26, 0, 20), bx(s.x * 0.7, s.y * 0.36, s.z * 0.6, 0, s.y * 0.08, 0)],
      [cyl(s.x * 0.07, s.z * 0.8, "z", -s.x * 0.24, s.y * 0.18, s.z * 0.44, 10), cyl(s.x * 0.07, s.z * 0.8, "z", s.x * 0.24, s.y * 0.18, s.z * 0.44, 10)],
      [],
      [bx(s.x * 0.5, 0.06, 0.1, 0, s.y * 0.26, s.z * 0.3)],
    ),
  "turret-launcher": (s) =>
    set(
      [bx(s.x * 0.86, s.y * 0.6, s.z * 0.8, 0, 0, 0), cyl(s.x * 0.36, s.y * 0.3, "y", 0, -s.y * 0.34, 0, 18)],
      [
        ...[1, -1].flatMap((sx) =>
          [1, -1].map((sy) => cyl(s.x * 0.14, s.z * 0.86, "z", sx * s.x * 0.22, sy * s.y * 0.16, s.z * 0.1, 12)),
        ),
      ],
      [],
      [
        ...[1, -1].flatMap((sx) =>
          [1, -1].map((sy) => cyl(s.x * 0.1, 0.06, "z", sx * s.x * 0.22, sy * s.y * 0.16, s.z * 0.54, 10)),
        ),
      ],
    ),
  "turret-cyclotron": (s) =>
    set(
      [cyl(s.x * 0.42, s.y * 0.5, "y", 0, -s.y * 0.2, 0, 22), cyl(s.x * 0.28, s.y * 0.7, "y", 0, s.y * 0.2, 0, 18)],
      [boltRing(s.x * 0.4, 0, 12), bx(s.x * 0.1, s.y * 0.3, s.z * 0.6, 0, s.y * 0.3, 0)],
      [],
      [cyl(s.x * 0.18, 0.08, "y", 0, s.y * 0.5, 0, 16)],
    ),
  "turret-platform": (s) =>
    set(
      [bx(s.x * 0.94, s.y * 0.3, s.z * 0.94, 0, -s.y * 0.3, 0), cyl(s.x * 0.34, s.y * 0.5, "y", 0, s.y * 0.02, 0, 20), bx(s.x * 0.5, s.y * 0.3, s.z * 0.4, 0, s.y * 0.34, 0)],
      [greebles(s, 6, "y", 157)],
      [],
      [bx(s.x * 0.2, 0.06, 0.14, 0, s.y * 0.48, s.z * 0.1)],
    ),

  /* ---------------- wings & foils ---------------- */
  "foil-s": (s) =>
    set(
      [bx(s.x * 0.9, s.y, s.z * 0.86, 0, 0, s.z * 0.02), taper(s.x * 0.7, s.y * 0.9, s.z * 0.3, 0.2, 0, 0, s.z * 0.58)],
      [bx(s.x * 0.2, s.y * 1.5, s.z * 0.5, -s.x * 0.42, 0, 0), greebles(s, 6, "y", 163)],
      [],
      [bx(s.x * 0.16, s.y * 0.5, s.z * 0.7, s.x * 0.42, 0, 0)],
    ),
  "foil-flat": (s) =>
    set(
      [bx(s.x, s.y * 0.7, s.z), bx(s.x * 0.16, s.y * 1.6, s.z * 0.9, -s.x * 0.44, 0, 0)],
      [
        ...Array.from({ length: 5 }, (_, i) =>
          bx(s.x * 0.86, s.y * 0.2, 0.06, 0, 0, -s.z * 0.4 + (i * s.z * 0.8) / 4),
        ),
      ],
      [],
      [bx(s.x * 0.1, s.y * 0.4, s.z * 0.8, s.x * 0.44, 0, 0)],
    ),
  "foil-tapered": (s) =>
    set(
      [taper(s.x * 0.9, s.y * 2, s.z, 0.25, 0, 0, 0).rotateY(Math.PI / 2)],
      [bx(s.x * 0.2, s.y * 1.4, s.z * 0.4, -s.x * 0.4, 0, 0)],
      [],
      [bx(s.x * 0.14, s.y * 0.6, s.z * 0.6, s.x * 0.4, 0, 0)],
    ),
  "foil-curved": (s) =>
    set(
      [bx(s.x * 0.9, s.y, s.z * 0.84), cyl(s.z * 0.2, s.x * 0.4, "x", 0, 0, s.z * 0.42, 12)],
      [bx(s.x * 0.2, s.y * 1.4, s.z * 0.5, -s.x * 0.42, 0, 0)],
      [],
      [bx(s.x * 0.12, s.y * 0.4, s.z * 0.7, s.x * 0.42, 0, 0)],
    ),
  "foil-swept": (s) =>
    set(
      [bx(s.x * 0.86, s.y, s.z * 0.7, 0, 0, -s.z * 0.1), bx(s.x * 0.5, s.y * 0.9, s.z * 0.5, 0, 0, s.z * 0.34)],
      [bx(s.x * 0.2, s.y * 1.4, s.z * 0.46, -s.x * 0.4, 0, -s.z * 0.1), greebles(s, 4, "y", 167)],
      [],
      [bx(s.x * 0.14, s.y * 0.5, s.z * 0.6, s.x * 0.4, 0, -s.z * 0.1)],
    ),
  "foil-armoured": (s) =>
    set(
      [bx(s.x * 0.94, s.y, s.z * 0.9), bx(s.x * 0.98, s.y * 0.4, s.z * 0.3, 0, s.y * 0.4, 0)],
      [greebles(s, 10, "y", 173), bx(s.x * 0.24, s.y * 1.3, s.z * 0.5, -s.x * 0.4, 0, 0)],
      [],
      [bx(s.x * 0.16, s.y * 0.4, s.z * 0.7, s.x * 0.42, 0, 0)],
    ),
  "foil-ragged": (s) =>
    set(
      [bx(s.x * 0.8, s.y * 0.8, s.z * 0.8), bx(s.x * 0.4, s.y * 0.6, s.z * 0.3, s.x * 0.1, s.y * 0.3, -s.z * 0.3)],
      [
        ...Array.from({ length: 6 }, (_, i) => bx(0.08, s.y * 1.2, 0.08, -s.x * 0.3 + (i * s.x * 0.6) / 5, 0, -s.z * 0.2)),
        greebles(s, 8, "all", 179),
      ],
      [],
      [bx(s.x * 0.12, s.y * 0.4, s.z * 0.6, s.x * 0.4, 0, 0)],
    ),
  "foil-prop": (s) =>
    set(
      [cyl(s.x * 0.2, s.z * 0.6, "z", 0, 0, 0, 16), ...Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2;
        return bx(0.14, s.y * 0.7, s.z * 0.3, Math.cos(a) * s.x * 0.24, Math.sin(a) * s.y * 0.3, 0).rotateZ(a);
      })],
      [cyl(s.x * 0.26, 0.14, "z", 0, 0, 0, 16)],
      [],
      [cyl(s.x * 0.12, 0.08, "z", 0, 0, -s.z * 0.34, 12)],
    ),
  "foil-fin": (s) =>
    set(
      [bx(s.x, s.y * 0.92, s.z * 0.8, 0, 0, 0), taper(s.x * 0.9, s.z * 0.4, s.y * 0.3, 0.3, 0, s.y * 0.5, 0).rotateX(Math.PI / 2)],
      [greebles(s, 6, "x", 181)],
      [],
      [bx(s.x * 0.5, 0.08, s.z * 0.5, 0, s.y * 0.46, 0)],
    ),

  /* ---------------- plating ---------------- */
  "plate-cowl": (s) =>
    set(
      [bx(s.x * 0.96, s.y * 0.96, s.z * 0.5), taper(s.x * 0.9, s.y * 0.9, s.z * 0.7, 0.6, 0, 0, s.z * 0.4)],
      [greebles(s, 8, "z", 191)],
      [],
      [bx(s.x * 0.2, s.y * 0.2, 0.06, 0, s.y * 0.3, s.z * 0.5)],
    ),
  "plate-frame": (s) =>
    set(
      [bx(s.x * 0.96, s.y * 0.16, s.z * 0.6, 0, s.y * 0.4, 0), bx(s.x * 0.96, s.y * 0.16, s.z * 0.6, 0, -s.y * 0.4, 0), bx(s.x * 0.14, s.y, s.z * 0.6, -s.x * 0.42, 0, 0), bx(s.x * 0.14, s.y, s.z * 0.6, s.x * 0.42, 0, 0)],
      [...Array.from({ length: 4 }, (_, i) => bx(s.x * 0.8, 0.1, 0.1, 0, -s.y * 0.3 + (i * s.y * 0.6) / 3, 0)), greebles(s, 6, "all", 193)],
      [],
      [],
    ),
  "plate-foil": (s) =>
    set([taper(s.x * 0.94, s.y * 3, s.z, 0.18, 0, 0, 0).rotateY(Math.PI / 2)], [bx(s.x * 0.2, s.y * 1.2, s.z * 0.4, -s.x * 0.4, 0, 0)], [], []),
  "plate-winglet": (s) =>
    set(
      [bx(s.x * 0.9, s.y * 0.5, s.z * 0.9, 0, -s.y * 0.2, 0), bx(s.x * 0.6, s.y * 0.7, s.z * 0.24, 0, s.y * 0.2, -s.z * 0.3)],
      [greebles(s, 4, "all", 197)],
      [],
      [bx(s.x * 0.3, 0.06, s.z * 0.3, 0, s.y * 0.44, -s.z * 0.3)],
    ),
  "plate-blade": (s) =>
    set(
      [taper(s.x * 1.6, s.y * 1.4, s.z, 0.1, 0, 0, 0)],
      [bx(s.x * 0.4, s.y * 0.4, s.z * 0.3, 0, 0, -s.z * 0.3)],
      [],
      [bx(s.x * 0.2, 0.05, s.z * 0.6, 0, s.y * 0.3, 0)],
    ),
  "plate-flat": (s) =>
    set(
      [bx(s.x, s.y, s.z * 0.4), bx(s.x * 0.9, s.y * 0.9, s.z * 0.4, 0, 0, s.z * 0.3)],
      [
        ...Array.from({ length: 4 }, (_, i) => bx(s.x * 0.86, 0.05, s.z * 0.2, 0, -s.y * 0.3 + (i * s.y * 0.6) / 3, s.z * 0.5)),
        greebles(s, 6, "z", 199),
      ],
      [],
      [],
    ),
  "plate-angled": (s) =>
    set(
      [bx(s.x * 0.96, s.y * 0.7, s.z * 0.4, 0, -s.y * 0.14, 0), taper(s.x * 0.94, s.y * 0.8, s.z * 0.8, 0.35, 0, s.y * 0.3, 0).rotateX(-Math.PI / 2)],
      [greebles(s, 8, "all", 211)],
      [],
      [],
    ),
  "pod-side": (s) =>
    set(
      [cyl(s.x * 0.46, s.z * 0.9, "z", 0, 0, 0, 20), bx(s.x * 0.4, s.y * 0.5, s.z * 0.4, -s.x * 0.3, 0, 0)],
      [boltRing(s.x * 0.44, s.z * 0.3, 10), boltRing(s.x * 0.44, -s.z * 0.3, 10)],
      [],
      [cyl(s.x * 0.2, 0.08, "z", 0, 0, -s.z * 0.46, 16)],
    ),

  /* ---------------- cargo ---------------- */
  tank: (s) =>
    set(
      [cyl(s.x * 0.46, s.z * 0.74, "z", 0, 0, 0, 22), sphere(s.x * 0.46, 0, 0, s.z * 0.38, 18), sphere(s.x * 0.46, 0, 0, -s.z * 0.38, 18)],
      [boltRing(s.x * 0.46, s.z * 0.16, 12), boltRing(s.x * 0.46, -s.z * 0.16, 12), greebles(s, 4, "all", 223)],
      [],
      [bx(s.x * 0.1, 0.06, s.z * 0.3, 0, s.x * 0.44, 0)],
    ),
  "cargo-capsule": (s) =>
    set(
      [cyl(s.x * 0.46, s.z * 0.7, "z", 0, 0, 0, 20), sphere(s.x * 0.46, 0, 0, s.z * 0.36, 16), sphere(s.x * 0.46, 0, 0, -s.z * 0.36, 16)],
      [greebles(s, 6, "all", 227)],
      [],
      [bx(s.x * 0.2, 0.06, 0.06, 0, s.x * 0.4, 0)],
    ),
  "cargo-box": (s) =>
    set(
      [bx(s.x * 0.96, s.y * 0.96, s.z * 0.96)],
      [
        bx(s.x, s.y * 0.1, s.z * 0.1, 0, s.y * 0.44, s.z * 0.44),
        bx(s.x, s.y * 0.1, s.z * 0.1, 0, -s.y * 0.44, s.z * 0.44),
        greebles(s, 10, "all", 229),
      ],
      [],
      [bx(s.x * 0.3, s.y * 0.16, 0.06, 0, 0, s.z * 0.5)],
    ),
  "cargo-sphere": (s) =>
    set(
      [sphere(Math.min(s.x, s.y, s.z) * 0.48)],
      [new THREE.TorusGeometry(Math.min(s.x, s.y, s.z) * 0.48, 0.06, 8, 24).rotateY(Math.PI / 2), greebles(s, 6, "all", 233)],
      [],
      [bx(0.1, 0.1, 0.1, 0, Math.min(s.x, s.y, s.z) * 0.46, 0)],
    ),

  /* ---------------- detail ---------------- */
  mast: (s) =>
    set(
      [cyl(s.x * 0.16, s.y * 0.9, "y", 0, 0, 0, 10), cyl(s.x * 0.5, s.y * 0.12, "y", 0, s.y * 0.44, 0, 16)],
      [bx(s.x * 0.5, 0.06, 0.06, 0, s.y * 0.2, 0)],
      [],
      [sphere(s.x * 0.2, 0, s.y * 0.52, 0, 12)],
    ),
  antenna: (s) =>
    set(
      [bx(s.x * 0.9, s.y * 0.7, s.z * 0.3), bx(s.x * 0.2, s.y * 0.3, s.z, 0, -s.y * 0.3, 0)],
      [
        ...Array.from({ length: 4 }, (_, i) => bx(0.06, s.y * 0.6, 0.06, -s.x * 0.3 + (i * s.x * 0.6) / 3, 0, 0)),
      ],
      [],
      [bx(s.x * 0.3, 0.05, 0.05, 0, s.y * 0.36, 0)],
    ),
  vent: (s) =>
    set(
      [bx(s.x * 0.9, s.y * 0.7, s.z * 0.9), cyl(s.x * 0.2, s.y * 0.5, "y", 0, s.y * 0.5, 0, 12)],
      [...Array.from({ length: 5 }, (_, i) => bx(s.x * 0.8, 0.06, 0.1, 0, -s.y * 0.2 + (i * s.y * 0.4) / 4, s.z * 0.46))],
      [],
      [...Array.from({ length: 5 }, (_, i) => bx(s.x * 0.7, 0.04, 0.05, 0, -s.y * 0.2 + (i * s.y * 0.4) / 4, s.z * 0.48))],
    ),
  lights: (s) =>
    set(
      [bx(s.x * 0.9, s.y * 0.5, s.z * 0.6)],
      [bx(s.x * 0.2, s.y * 0.8, s.z * 0.2, 0, s.y * 0.4, 0)],
      [],
      [
        ...Array.from({ length: 4 }, (_, i) =>
          sphere(s.x * 0.1, -s.x * 0.3 + (i * s.x * 0.6) / 3, 0, s.z * 0.3, 10),
        ),
      ],
    ),
};

/* Aliases so every catalogue archetype resolves to a real recipe. */
const FALLBACK: Record<string, string> = {
  "cockpit-wedge": "cockpit-wedge",
  "hab-box": "hab-box",
};

const cache = new Map<string, PartGeometrySet>();

export function getPartGeometry(archetype: string, size: { x: number; y: number; z: number }): PartGeometrySet {
  const key = `${archetype}|${size.x}|${size.y}|${size.z}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const recipe = RECIPES[archetype] ?? RECIPES[FALLBACK[archetype] ?? ""] ?? RECIPES["hab-box"]!;
  const built = recipe(new THREE.Vector3(size.x, size.y, size.z));
  for (const geometry of [built.hull, built.detail, built.glass, built.glow]) {
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
  cache.set(key, built);
  return built;
}

export const hasRecipe = (archetype: string): boolean => archetype in RECIPES;
