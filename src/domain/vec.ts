import type { Vec3 } from "./types";

/**
 * Minimal, dependency-free vector / rigid-body maths.
 *
 * Rotations are stored as YXZ euler angles (yaw → pitch → roll), the same
 * convention three.js uses for `Object3D.rotation`. `Basis` stores the three
 * world-space columns of the rotation matrix, i.e. the part's local X/Y/Z axes
 * expressed in world space — which is exactly what oriented bounding box tests
 * and matrix composition need.
 */

export const V0: Vec3 = { x: 0, y: 0, z: 0 };
export const FORWARD: Vec3 = { x: 0, y: 0, z: 1 };
export const UP: Vec3 = { x: 0, y: 1, z: 0 };
export const RIGHT: Vec3 = { x: 1, y: 0, z: 0 };
export const DEG = Math.PI / 180;

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const negate = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export const normalize = (a: Vec3): Vec3 => {
  const len = length(a);
  return len < 1e-9 ? V0 : scale(a, 1 / len);
};

export const equals = (a: Vec3, b: Vec3, eps = 1e-6): boolean =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps;

export const roundTo = (value: number, decimals = 4): number => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

export const roundVec = (a: Vec3, decimals = 4): Vec3 => ({
  x: roundTo(a.x, decimals),
  y: roundTo(a.y, decimals),
  z: roundTo(a.z, decimals),
});

/* ------------------------------------------------------------------ */
/* Rotations                                                           */
/* ------------------------------------------------------------------ */

/** World-space columns of a rotation matrix: the local X, Y and Z axes. */
export type Basis = readonly [Vec3, Vec3, Vec3];

export const IDENTITY_BASIS: Basis = [RIGHT, UP, FORWARD];

export function eulerToBasis(e: Vec3): Basis {
  const cx = Math.cos(e.x);
  const sx = Math.sin(e.x);
  const cy = Math.cos(e.y);
  const sy = Math.sin(e.y);
  const cz = Math.cos(e.z);
  const sz = Math.sin(e.z);

  return [
    { x: cy * cz + sy * sx * sz, y: cx * sz, z: -sy * cz + cy * sx * sz },
    { x: -cy * sz + sy * sx * cz, y: cx * cz, z: sy * sz + cy * sx * cz },
    { x: sy * cx, y: -sx, z: cy * cx },
  ];
}

/** Rotates `v` from local space into the frame described by `e`. */
export function rotateBy(v: Vec3, e: Vec3): Vec3 {
  return rotateByBasis(v, eulerToBasis(e));
}

export function rotateByBasis(v: Vec3, b: Basis): Vec3 {
  return {
    x: b[0]!.x * v.x + b[1]!.x * v.y + b[2]!.x * v.z,
    y: b[0]!.y * v.x + b[1]!.y * v.y + b[2]!.y * v.z,
    z: b[0]!.z * v.x + b[1]!.z * v.y + b[2]!.z * v.z,
  };
}

/** Rotates `v` from the frame `b` back into its parent frame. */
export function unrotateByBasis(v: Vec3, b: Basis): Vec3 {
  return { x: dot(v, b[0]!), y: dot(v, b[1]!), z: dot(v, b[2]!) };
}

/** Composes two frames: first `inner`, then `outer`. */
export function composeBasis(outer: Basis, inner: Basis): Basis {
  return [
    rotateByBasis(inner[0]!, outer),
    rotateByBasis(inner[1]!, outer),
    rotateByBasis(inner[2]!, outer),
  ];
}

/** Serialises a basis + origin into a column-major 4x4 matrix (three.js order). */
export function toMatrix4(position: Vec3, basis: Basis): readonly number[] {
  return [
    basis[0]!.x,
    basis[0]!.y,
    basis[0]!.z,
    0,
    basis[1]!.x,
    basis[1]!.y,
    basis[1]!.z,
    0,
    basis[2]!.x,
    basis[2]!.y,
    basis[2]!.z,
    0,
    position.x,
    position.y,
    position.z,
    1,
  ];
}

/**
 * Recovers a YXZ euler triple from a basis — the exact inverse of
 * `eulerToBasis`. Reading the columns as M[col][row]:
 *
 *   x = asin(−M[1][2])   →  −b[2].y
 *   y = atan2(M[0][2], M[2][2])  →  b[2].x, b[2].z
 *   z = atan2(M[1][0], M[1][1])  →  b[0].y, b[1].y
 *
 * The z arguments are easy to transpose; doing so silently adds 90° of roll to
 * every axis-aligned frame, so the round trip is covered by tests.
 * At pitch ±90° yaw and roll become degenerate (gimbal lock) and the split is
 * arbitrary, though the resulting frame is still correct.
 */
export function basisToEuler(b: Basis): Vec3 {
  const x = Math.asin(clamp(-b[2]!.y, -1, 1));
  const y = Math.atan2(b[2]!.x, b[2]!.z);
  const z = Math.atan2(b[0]!.y, b[1]!.y);
  return { x, y, z };
}

/* ------------------------------------------------------------------ */
/* Boxes                                                               */
/* ------------------------------------------------------------------ */

export interface AABB {
  min: Vec3;
  max: Vec3;
}

export const aabbFromCenter = (center: Vec3, size: Vec3): AABB => ({
  min: sub(center, scale(size, 0.5)),
  max: add(center, scale(size, 0.5)),
});

export function unionAABB(a: AABB, b: AABB): AABB {
  return {
    min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
    max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) },
  };
}

export const aabbSize = (a: AABB): Vec3 => sub(a.max, a.min);

export const aabbOverlaps = (a: AABB, b: AABB): boolean =>
  a.min.x < b.max.x &&
  a.max.x > b.min.x &&
  a.min.y < b.max.y &&
  a.max.y > b.min.y &&
  a.min.z < b.max.z &&
  a.max.z > b.min.z;

/** Half-extent of a *full-size* box along a direction. */
export function extentAlong(size: Vec3, dir: Vec3): number {
  return (Math.abs(size.x * dir.x) + Math.abs(size.y * dir.y) + Math.abs(size.z * dir.z)) / 2;
}

/** Half-extent of an already-halved box along a direction. */
export function projectHalf(half: Vec3, dir: Vec3): number {
  return Math.abs(half.x * dir.x) + Math.abs(half.y * dir.y) + Math.abs(half.z * dir.z);
}

export interface Obb {
  center: Vec3;
  half: Vec3;
  basis: Basis;
}

export const toObb = (center: Vec3, rotation: Vec3, size: Vec3): Obb => ({
  center,
  half: scale(size, 0.5),
  basis: eulerToBasis(rotation),
});

/**
 * Separating-axis penetration depth between two oriented boxes. Returns 0 when
 * they are separated, otherwise the smallest overlap found across the 15 axes.
 */
export function obbPenetration(a: Obb, b: Obb): number {
  const axes: Vec3[] = [];
  for (const box of [a, b]) {
    for (const axis of box.basis) axes.push(axis);
  }
  for (const u of a.basis) {
    for (const v of b.basis) {
      const c = cross(u, v);
      if (length(c) > 1e-6) axes.push(normalize(c));
    }
  }

  let minPenetration = Number.POSITIVE_INFINITY;
  for (const axis of axes) {
    const ra = projectHalf(a.half, axis);
    const rb = projectHalf(b.half, axis);
    const distance = Math.abs(dot(sub(b.center, a.center), axis));
    const overlap = ra + rb - distance;
    if (overlap <= 0) return 0;
    if (overlap < minPenetration) minPenetration = overlap;
  }
  return Number.isFinite(minPenetration) ? minPenetration : 0;
}

/** Shrink an OBB uniformly so that flush-but-touching neighbours do not collide. */
export function shrinkObb(box: Obb, amount: number): Obb {
  return {
    center: box.center,
    half: {
      x: Math.max(0.01, box.half.x - amount),
      y: Math.max(0.01, box.half.y - amount),
      z: Math.max(0.01, box.half.z - amount),
    },
    basis: box.basis,
  };
}
