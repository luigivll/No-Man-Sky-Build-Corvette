/**
 * Vocabulary for hand-drawing iconic ships on the corvette grid.
 *
 * The generic compiler in `blueprintLattice.ts` lays a parts LIST out on the
 * grid; it has no idea what an X-Wing looks like.  These helpers are the other
 * half: a small rigging language for building a specific silhouette out of the
 * real 589 meshes.
 *
 *   put/pair/row     absolute placement, mirrored pairs, banks of engines
 *   pod              a chain of modules anchored at a lateral offset
 *   span/spanPair    "bolt this panel from A to B" — the wing primitive
 *   standing/hanging place on top of / under whatever is already there
 *   surfaceAt        where is the hull, right here
 *
 * Everything ends up as ordinary `LatticePlacement`s, so a hand-drawn ship is
 * still assembled, lit and walked through by the same engine as everything else.
 */

import { chainZ, decodeRaw, placedBox, rollXY, type LatticePlacement } from "../lattice";
import { packSync } from "../realMeshes";
import type { V3 } from "../render3d";

export const deg = (d: number) => (d * Math.PI) / 180;

export interface Box {
  min: V3;
  max: V3;
}

export interface Opts {
  /** quarter turns about Y (0-3) */
  yaw?: number;
  mirror?: boolean;
  scale?: number;
  /** radians, about the part's own snap point: cants a wing out of the flat */
  roll?: number;
  /** extra stretch along the part's local +x (its outboard axis) */
  stretchX?: number;
  role?: string;
  plume?: { radius?: number; length?: number } | false;
}

export function put(assetId: string, pos: V3, opts: Opts = {}): LatticePlacement {
  return { assetId, pos, ...opts };
}

/** world-space box of one placement */
export function boxOf(p: LatticePlacement | null): Box | null {
  if (!p) return null;
  return placedBox(
    p.assetId,
    p.pos,
    p.yaw ?? 0,
    p.mirror ?? false,
    p.scale ?? 1,
    p.roll ?? 0,
    p.stretchX ?? 1,
  );
}

/**
 * Where the part actually ENDS, from the part's own vertices.
 *
 * Snap points are origins, not outlines: a foil's bbox may claim one extent while
 * the metal tapers to a point somewhere else entirely. Anything that has to sit on
 * a tip — a wingtip cannon, a pod, a nav light — asks this instead of doing the
 * trigonometry by hand, which is how you end up with guns floating past the wing.
 */
export function extremeVertex(p: LatticePlacement, dir: [number, number, number]): V3 | null {
  const pack = packSync();
  const entry = pack?.byId.get(p.assetId);
  if (!pack || !entry) return null;
  const decoded = decodeCache.get(p.assetId) ?? decodeRaw(pack.bin, entry);
  decodeCache.set(p.assetId, decoded);

  const scale = p.scale ?? 1;
  const stretchX = p.stretchX ?? 1;
  const roll = p.roll ?? 0;
  const [dx, dy] = [dir[0], dir[1]];
  let best: V3 | null = null;
  let bestDot = -Infinity;
  for (let i = 0; i < decoded.positions.length; i += 3) {
    const [rx, ry] = rollXY(decoded.positions[i] * scale * stretchX, decoded.positions[i + 1] * scale, roll);
    const wx = p.mirror ? -rx : rx;
    const v: V3 = [p.pos[0] + wx, p.pos[1] + ry, p.pos[2] + decoded.positions[i + 2] * scale];
    const dot = v[0] * dx + v[1] * dy;
    if (dot > bestDot) {
      bestDot = dot;
      best = v;
    }
  }
  return best;
}

const decodeCache = new Map<string, ReturnType<typeof decodeRaw>>();

/** `extremeVertex` pulled back along `dir` so the newcomer overlaps the tip */
export function atTip(p: LatticePlacement, dir: [number, number, number], inset = 0.12): V3 | null {
  const tip = extremeVertex(p, dir);
  if (!tip) return null;
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return [tip[0] - (dir[0] / len) * inset, tip[1] - (dir[1] / len) * inset, tip[2]];
}

/** axis-aligned box of the raw asset at a given scale/stretch, origin at 0 */
export function rawBox(assetId: string, scale = 1, stretchX = 1): Box | null {
  return placedBox(assetId, [0, 0, 0], 0, false, scale, 0, stretchX);
}

/** starboard + port copies of one part at the same station */
export function pair(assetId: string, pos: V3, opts: Opts = {}): LatticePlacement[] {
  const [x, y, z] = pos;
  const role = opts.role;
  return [
    put(assetId, [x, y, z], { ...opts, role: role ? `${role} stbd` : "starboard" }),
    put(assetId, [-x, y, z], { ...opts, mirror: true, role: role ? `${role} port` : "port" }),
  ];
}

/** a bank of identical parts spread across x at one station */
export function row(
  assetId: string,
  xs: number[],
  y: number,
  z: number,
  opts: Opts = {},
): LatticePlacement[] {
  return xs.map((x, i) =>
    put(assetId, [x, y, z], { ...opts, role: opts.role ? `${opts.role} ${i + 1}` : undefined }),
  );
}

/** highest surface of `parts` under (x, z) — the deck you can bolt to */
export function surfaceAt(
  parts: (LatticePlacement | null)[],
  x: number,
  z: number,
  tol = 0.1,
): number {
  let best = -Infinity;
  for (const p of parts) {
    const b = boxOf(p);
    if (!b) continue;
    if (x < b.min[0] - tol || x > b.max[0] + tol) continue;
    if (z < b.min[2] - tol || z > b.max[2] + tol) continue;
    best = Math.max(best, b.max[1]);
  }
  return best;
}

/** lowest surface of `parts` over (x, z) — where a strut would hang from */
export function bellyAt(
  parts: (LatticePlacement | null)[],
  x: number,
  z: number,
  tol = 0.1,
): number {
  let best = Infinity;
  for (const p of parts) {
    const b = boxOf(p);
    if (!b) continue;
    if (x < b.min[0] - tol || x > b.max[0] + tol) continue;
    if (z < b.min[2] - tol || z > b.max[2] + tol) continue;
    best = Math.min(best, b.min[1]);
  }
  return best;
}

/**
 * Sits a part on the deck beneath it, so a stack of hardware always touches the
 * thing it stands on instead of hovering over it.
 */
export function standing(
  assetId: string,
  parts: (LatticePlacement | null)[],
  x: number,
  z: number,
  opts: Opts & { lift?: number } = {},
): LatticePlacement | null {
  const deck = surfaceAt(parts, x, z);
  if (!Number.isFinite(deck)) return null;
  const local = rawBox(assetId, opts.scale ?? 1, opts.stretchX ?? 1);
  if (!local) return null;
  return put(assetId, [x, deck - local.min[1] + (opts.lift ?? 0), z], opts);
}

/** The mirror of `standing`: hangs a part under the surface above it. */
export function hanging(
  assetId: string,
  parts: (LatticePlacement | null)[],
  x: number,
  z: number,
  opts: Opts & { drop?: number } = {},
): LatticePlacement | null {
  const roof = bellyAt(parts, x, z);
  if (!Number.isFinite(roof)) return null;
  const local = rawBox(assetId, opts.scale ?? 1, opts.stretchX ?? 1);
  if (!local) return null;
  return put(assetId, [x, roof - local.max[1] - (opts.drop ?? 0), z], opts);
}

/**
 * A chain of modules along the spine, anchored off-centre.
 *
 * `pod(["B_TRU_C", "B_TRU_D"], 1.6, 0.2, -2.4)` is "two thrusters in a line,
 * starting at x 1.6, z -2.4, running aft" — an engine nacelle, an outrigger, a
 * warp pylon pod.
 */
export function pod(
  ids: string[],
  x: number,
  y: number,
  z: number,
  opts: { scale?: number; role?: string; startIndex?: number } = {},
): LatticePlacement[] {
  return chainZ(ids, 0, { startIndex: opts.startIndex }).map((p, i) => ({
    ...p,
    pos: [p.pos[0] + x, p.pos[1] + y, p.pos[2] + z],
    scale: opts.scale ?? 1,
    role: opts.role ?? (i === 0 ? "pod" : `pod +${i}`),
  }));
}

/**
 * A vertical fin: the part is rolled 90 degrees so its span points straight up,
 * and its origin is set ON the deck.
 *
 * `standing` cannot be used for a rolled part — it measures the flat box and
 * would leave the fin floating a half-thickness above the hull.
 */
export function fin(
  assetId: string,
  parts: (LatticePlacement | null)[],
  x: number,
  z: number,
  opts: Opts & { embed?: number } = {},
): LatticePlacement | null {
  const deck = surfaceAt(parts, x, z);
  if (!Number.isFinite(deck)) return null;
  return put(assetId, [x, deck - (opts.embed ?? 0.12), z], { ...opts, roll: deg(90) });
}

/**
 * A chain that runs FORWARD from `zFront` — a towing arm, a nose boom, a prong.
 * `chainZ` only ever lays modules aft, so the list is reversed and the whole
 * chain is slid forward until its leading face lands on `zFront`.
 */
export function prong(
  ids: string[],
  x: number,
  y: number,
  zFront: number,
  opts: { scale?: number; role?: string } = {},
): LatticePlacement[] {
  const chain = chainZ([...ids].reverse());
  const front = Math.max(...chain.map((p) => boxOf(p)?.max[2] ?? 0));
  const shift = zFront - front;
  return chain.map((p, i) => ({
    ...p,
    pos: [p.pos[0] + x, p.pos[1] + y, p.pos[2] + shift] as V3,
    scale: opts.scale ?? 1,
    role: opts.role ?? (i === chain.length - 1 ? "prong root" : "prong"),
  }));
}

export interface SpanOpts extends Opts {
  /** trim the reach: 0.9 stops the panel just short of B */
  reach?: number;
  /** where along the chord to centre the panel (defaults to A's z) */
  chordCenter?: number;
}

/** the point `t` of the way from A to B */
export function tipOf(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Bolts a panel from A to B.
 *
 * The part's own +x axis is aimed at B and `stretchX` is solved so its span
 * reaches exactly that far, which is why one number can size an entire wing.
 * The chord (the part's z extent) stays parallel to the ship's centreline and is
 * centred on A.
 */
export function span(assetId: string, a: V3, b: V3, opts: SpanOpts = {}): LatticePlacement {
  const scale = opts.scale ?? 1;
  const local = rawBox(assetId, scale, 1);
  if (!local) return put(assetId, a, opts);
  const spanLen = Math.max(0.05, local.max[0] - local.min[0]);
  const dx = (b[0] - a[0]) * (opts.reach ?? 1);
  const dy = (b[1] - a[1]) * (opts.reach ?? 1);
  const roll = opts.roll ?? Math.atan2(dy, dx);
  const stretchX = Math.max(0.1, Math.hypot(dx, dy) / spanLen);
  // A mirrored part maps local +x onto world -x, so the root lands on the other
  // side of the anchor. Both cases put the part's INBOARD face on the anchor,
  // which is the whole contract of this helper.
  const inboard = local.min[0] * stretchX;
  const px = opts.mirror ? -a[0] + inboard : a[0] - inboard;
  const py = a[1] - (local.min[1] + local.max[1]) / 2;
  const chord = (local.min[2] + local.max[2]) / 2;
  const pz = (opts.chordCenter ?? a[2]) - chord;
  return put(assetId, [px, py, pz], { ...opts, roll, stretchX });
}

/** the same panel on both sides: mirrored root, mirrored tip, same roll */
export function spanPair(assetId: string, a: V3, b: V3, opts: SpanOpts = {}): LatticePlacement[] {
  const starboard = span(assetId, a, b, opts);
  // a and b are always the STARBOARD reference: `span` mirrors the root itself,
  // so passing already-negated coordinates back in negates them twice and lands
  // the port wing on top of the starboard one.
  const port = span(assetId, a, b, { ...opts, roll: starboard.roll, mirror: true });
  return [starboard, port];
}

/** the tip point of a span, for hanging a cannon on the end of a wing */
export function tipPoint(a: V3, b: V3, opts: SpanOpts = {}): V3 {
  return tipOf(a, b, opts.reach ?? 1);
}
