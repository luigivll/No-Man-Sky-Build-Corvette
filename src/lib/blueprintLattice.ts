/**
 * Blueprint → lattice compiler.
 *
 * A blueprint says WHAT to buy ("two Thunderbird habs, six Arcadia S-foils, four
 * photon cannons"); the lattice says WHERE things snap.  This module bridges the
 * two so the 21 iconics render from the same real-asset engine as the hand-built
 * probe, instead of the old stand-in polygons.
 *
 * The rules are deliberately boring and deterministic — same blueprint, same
 * ship, every time:
 *
 *   spine      cockpit → habitation → landing bays → walkways → armoured cap
 *   wings      distributed in pairs along the spine, canards forward
 *   boosters   heavy mains aft, light thrusters amidships
 *   weapons    alternating dorsal / ventral
 *   gear       evenly spaced under the hull
 *   dorsal kit shields and reactors on the module's own top face
 *
 * Every asset id comes from `data/parts.json` (each catalogue part carries the
 * game asset backing it), so the compiler never invents hardware.
 */

import { parts as catalogueParts, partById } from "./data";
import { styleById } from "./shipStyles";
import {
  chainZ,
  flank,
  placedBox,
  stack,
  type LatticePlacement,
} from "./lattice";
import type { NamedRecipe } from "./fleet";
import type { Blueprint, Part } from "./types";

interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Per-blueprint art direction.
 *
 * The compiler is generic, which is what keeps 21 ships consistent — but a
 * TIE Interceptor and a Star Destroyer do not want the same wings.  These are
 * the few numbers that have to be nudged by eye; everything else is derived.
 */
export interface LayoutHint {
  /** station along the spine (0 nose, 1 tail) the main wing pair sits at */
  wingT?: number;
  /** vertical separation between wing pairs — the "X" in an X-Wing */
  wingSplit?: number;
  /** uniform scale for wings (1 = true game size) */
  wingScale?: number;
  /** uniform scale for heavy boosters */
  mainScale?: number;
  /** how far wings are pushed outboard of the hull edge */
  wingOverlap?: number;
}

const HINTS: Record<string, LayoutHint> = {
  // four big foils that would otherwise swallow a six-unit fuselage
  "x-wing-t65": { wingT: 0.5, wingSplit: 0.78, wingScale: 0.72 },
  "n1-starfighter": { wingT: 0.52, wingSplit: 0.62, wingScale: 0.6 },
  "delta-7-jedi": { wingT: 0.48, wingSplit: 0.5, wingScale: 0.55 },
  "eta-2-jedi": { wingT: 0.48, wingSplit: 0.5, wingScale: 0.55 },
  // flat side panels on a short ball cockpit
  "tie-interceptor": { wingT: 0.52, wingSplit: 0.42, wingScale: 1.05, mainScale: 0.8 },
  "viper-mk2": { wingT: 0.5, wingSplit: 0.7, wingScale: 0.78 },
  // blended flying wings
  batwing: { wingT: 0.55, wingSplit: 0.3, wingScale: 0.62 },
  "xmen-blackbird": { wingT: 0.58, wingSplit: 0.36, wingScale: 0.66 },
  "sentinel-interceptor": { wingT: 0.6, wingSplit: 0.42, wingScale: 0.72 },
  // long hulls: keep the wings modest so the spine stays the star
  "imperial-star-destroyer": { wingT: 0.82, wingScale: 0.8 },
  "corrupted-dreadnought": { wingT: 0.84, wingScale: 0.8, mainScale: 0.85 },
  nostromo: { mainScale: 0.85 },
  "uss-enterprise": { wingT: 0.72, wingScale: 0.6 },
  serenity: { wingT: 0.68, wingScale: 0.62 },
  "millennium-falcon": { mainScale: 0.9 },
  "firespray-slave-one": { wingT: 0.62, wingScale: 0.7, mainScale: 0.85 },
  "thunderbird-2": { mainScale: 0.85 },
  "rocinante": { mainScale: 0.9 },
  "razor-crest": { mainScale: 0.92 },
  "normandy-sr2": { wingT: 0.6, wingScale: 0.7, mainScale: 0.88 },
  "unsc-pelican": { wingT: 0.6, wingScale: 0.7 },
};

const TAIL_CAPS = ["B_STR_A_N", "B_STR_B_N", "B_STR_C_N", "B_STR_D_N", "B_STR_E_N"];

/** deterministic 32-bit hash so a blueprint always picks the same trim */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Reverse of the catalogue: which catalogue part is this game asset?
 *
 * The compiler works in asset ids (B_TRU_A) but a human reads part names
 * ("Titan Heavy Booster"), so the manual needs the way back.
 */
const ASSET_TO_PART = new Map<string, Part>();
for (const part of catalogueParts) {
  if (part.assetId && !ASSET_TO_PART.has(part.assetId)) ASSET_TO_PART.set(part.assetId, part);
}

/** asset code -> what the family actually is, for the 440 structural pieces */
const ASSET_FAMILY: Record<string, string> = {
  STR: "Structural frame",
  STAIRS0: "Boarding stair",
  WNG: "Wing panel",
  CON: "Connector",
  CON2: "Landing bay frame",
  ALK: "Walkway",
  DECO: "Hull trim",
  WALL: "Wall panel",
  TRU: "Thruster",
  HAB: "Habitation module",
  HAB1: "Habitation module",
  COK: "Cockpit",
  TUR: "Turret ring",
  SHL: "Shield generator",
  GEN: "Reactor core",
  LND: "Landing gear",
};

/** the _N/_E/_S/_W mount suffix: which face of the cell the part bolts to */
const ASSET_FACE: Record<string, string> = {
  N: "north face",
  E: "east face",
  S: "south face",
  W: "west face",
};

export function assetLabel(assetId: string): string {
  const catalogue = ASSET_TO_PART.get(assetId);
  if (catalogue) return catalogue.name;
  const [, family, ...rest] = assetId.split("_");
  const word = ASSET_FAMILY[family];
  if (!word) return assetId.replace(/_/g, " ");
  const variant = rest.length > 1 ? rest[0] : null;
  const face = rest.length ? ASSET_FACE[rest[rest.length - 1]] : null;
  return [word, variant ? `type ${variant}` : null, face].filter(Boolean).join(" · ");
}

export function partForAsset(assetId: string): Part | undefined {
  return ASSET_TO_PART.get(assetId);
}

function assetOf(partId: string): string | null {
  const part = partById[partId] as Part | undefined;
  return part?.assetId ?? null;
}

/** expand the blueprint's refs into a flat list of asset ids per family */
function collect(bp: Blueprint) {
  const gear: string[] = [];
  const wings: string[] = [];
  const mains: string[] = [];
  const lights: string[] = [];
  const weapons: string[] = [];
  const shields: string[] = [];
  const reactors: string[] = [];
  const habs: string[] = [];
  const walkways: string[] = [];
  const bays: string[] = [];
  let cockpit: string | null = null;

  for (const ref of bp.parts) {
    const asset = assetOf(ref.id);
    if (!asset) continue;
    const qty = Math.max(1, ref.qty ?? 1);
    const bucket =
      ref.id.startsWith("cockpit") ? null
      : ref.id.startsWith("hab-") ? habs
      : ref.id.startsWith("walkway") ? walkways
      : ref.id.startsWith("bay-") ? bays
      : ref.id.startsWith("gear-") ? gear
      : ref.id.startsWith("wing-") ? wings
      : ref.id.startsWith("weapon-") ? weapons
      : ref.id.startsWith("shield-") ? shields
      : ref.id.startsWith("reactor-") ? reactors
      : ref.id.startsWith("engine-main") ? mains
      : ref.id.startsWith("engine-light") ? lights
      : null;
    if (bucket === null && ref.id.startsWith("cockpit")) {
      cockpit = asset;
      continue;
    }
    if (!bucket) continue;
    for (let i = 0; i < qty; i++) bucket.push(asset);
  }

  return { cockpit, habs, walkways, bays, gear, wings, mains, lights, weapons, shields, reactors };
}

interface Hosted {
  place: LatticePlacement;
  box: Box;
}

/** the asset's own box, expressed relative to its snap point, at `scale` */
function localBox(assetId: string, scale: number): Box | null {
  return placedBox(assetId, [0, 0, 0], 0, false, scale);
}

/**
 * Pulls an outboard part back onto the hull.
 *
 * Wings, boosters and pods are all mounted by anchoring their INBOARD face to
 * the hull edge, then shifting them up or down to get the silhouette the
 * blueprint asks for.  On a tall hab that is free; on a half-unit walkway the
 * same shift leaves the part hanging in space next to the ship — the exact
 * "floating module between the wings" that real corvettes never have.  So the
 * requested offset is clamped: at least `min(0.30 × child, 0.12)` of the part's
 * height has to stay buried in the host.
 */
function fitY(assetId: string, scale: number, hostBox: Box, want: number): number {
  const local = localBox(assetId, scale);
  if (!local) return want;
  const height = local.max[1] - local.min[1];
  const need = Math.min(0.30 * height, Math.max(0.12, 0.30 * height));
  const lo = hostBox.min[1] + need - local.max[1];
  const hi = hostBox.max[1] - need - local.min[1];
  if (lo > hi) {
    // host thinner than the required bite — centre the part on the host instead
    return (hostBox.min[1] + hostBox.max[1]) / 2 - (local.min[1] + local.max[1]) / 2;
  }
  return Math.max(lo, Math.min(hi, want));
}

/** Bolts a part behind the host, on the centreline, so a lone unit still fits. */
function abaft(assetId: string, host: LatticePlacement, scale = 1): LatticePlacement {
  const hostBox = placedBox(host.assetId, host.pos, host.yaw ?? 0, host.mirror, host.scale ?? 1);
  const local = localBox(assetId, scale);
  const z = hostBox && local ? hostBox.min[2] - local.max[2] : host.pos[2] - 1;
  return { assetId, pos: [0, host.pos[1], z], role: "tail", scale };
}

/**
 * Mounts a family of outboard parts (wings, nacelles) as mirrored pairs.
 *
 * Identical parts are grouped first, because the interesting case is a pair of
 * the SAME asset: those must sit at one station with opposite sides, or the ship
 * comes out with, say, its starboard booster amidships and its port booster at
 * the stern.  A group of odd size finishes with a single unit on the centreline.
 */
function mountFamily(
  assets: string[],
  lo: number,
  hi: number,
  hosts: Hosted[],
  opts: { scale?: number; yOffset?: number; overlap?: number; clamp?: boolean } = {},
): LatticePlacement[] {
  const scale = opts.scale ?? 1;
  const groups = new Map<string, number>();
  for (const a of assets) groups.set(a, (groups.get(a) ?? 0) + 1);

  const out: LatticePlacement[] = [];
  for (const [asset, count] of groups) {
    const ts = spread(Math.ceil(count / 2), lo, hi);
    for (let j = 0; j < count; j++) {
      const host = hostAt(hosts, ts[Math.floor(j / 2)]);
      if (count % 2 === 1 && j === count - 1) {
        out.push(abaft(asset, host.place, scale));
        continue;
      }
      const side: 1 | -1 = j % 2 === 0 ? 1 : -1;
      const yOffset = opts.clamp === false
        ? opts.yOffset ?? 0
        : fitY(asset, scale, host.box, opts.yOffset ?? 0);
      out.push(
        flank(asset, host.place, {
          side,
          yOffset,
          overlap: opts.overlap ?? 0,
          scale,
        }),
      );
    }
  }
  return out;
}

/** the spine module whose centre sits closest to `t` (0 = nose, 1 = tail) */
function hostAt(hosts: Hosted[], t: number): Hosted {
  const zs = hosts.map((h) => (h.box.min[2] + h.box.max[2]) / 2);
  const nose = Math.max(...zs);
  const tail = Math.min(...zs);
  const want = nose + (tail - nose) * Math.max(0, Math.min(1, t));
  let best = hosts[0];
  let bestD = Infinity;
  hosts.forEach((h, i) => {
    const d = Math.abs(zs[i] - want);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  });
  return best;
}

function spread(n: number, lo: number, hi: number): number[] {
  if (n <= 1) return [(lo + hi) / 2];
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

export function blueprintToRecipe(bp: Blueprint): NamedRecipe {
  const bag = collect(bp);
  const style = styleById(bp.style ?? "corvette", hash(bp.id) % 97);
  const seed = hash(bp.id);

  // ---- 1. spine --------------------------------------------------------- //
  const spineIds: string[] = [];
  if (bag.cockpit) spineIds.push(bag.cockpit);
  // habitation runs down the middle; walkways break it up so the hull is not a
  // wall of identical pods
  const walkPerHab = bag.habs.length ? bag.walkways.length / bag.habs.length : 0;
  let walkCursor = 0;
  bag.habs.forEach((hab, i) => {
    spineIds.push(hab);
    const due = Math.round((i + 1) * walkPerHab) - walkCursor;
    for (let w = 0; w < due && walkCursor < bag.walkways.length; w++) {
      spineIds.push(bag.walkways[walkCursor++]);
    }
  });
  while (walkCursor < bag.walkways.length) spineIds.push(bag.walkways[walkCursor++]);
  spineIds.push(...bag.bays);

  const spine = chainZ(spineIds);
  const tailCap = TAIL_CAPS[seed % TAIL_CAPS.length];
  const hosts: Hosted[] = spine.map((place) => ({
    place,
    box: placedBox(place.assetId, place.pos, place.yaw, place.mirror)!,
  }));

  const parts: LatticePlacement[] = [...spine];

  // the armoured cap rides on the last spine module
  const lastHost = hosts[hosts.length - 1];
  const lastBox = lastHost.box;
  // chain rule: the newcomer slides back until its leading face meets the cursor
  // (pos.z = prev.z + prev.zMin − next.zMax) — a fixed gap leaves a hole
  const capLocal = localBox(tailCap, 1);
  const capPlace: LatticePlacement = {
    assetId: tailCap,
    pos: [0, lastHost.place.pos[1], lastBox.min[2] - (capLocal?.max[2] ?? 0)],
    role: "tail",
  };
  const capBox = placedBox(capPlace.assetId, capPlace.pos, 0, false)!;
  parts.push(capPlace);
  hosts.push({ place: capPlace, box: capBox });

  // ---- 2. wings --------------------------------------------------------- //
  // paired along the spine; a lone wing still gets mounted rather than dropped
  const hint = HINTS[bp.slug] ?? {};
  const wingPairs = Math.ceil(bag.wings.length / 2);
  // Big wing sets get shrunk, otherwise a four-foil interceptor ends up as one
  // undifferentiated slab of wing.
  const wingScale = hint.wingScale ?? Math.min(1, 1.25 / Math.sqrt(wingPairs));
  const wingSplit = hint.wingSplit ?? (wingPairs === 2 ? 0.7 : 0.4);
  bag.wings.forEach((asset, i) => {
    const pair = Math.floor(i / 2);
    const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
    // A two-pair set is the classic X: both pairs on one station, split high and
    // low. Anything wider lays out along the spine instead, so a six- or
    // eight-wing hull reads as a ladder rather than a stack.
    const t = hint.wingT ?? (wingPairs <= 2 ? 0.48 : spread(wingPairs, 0.26, 0.76)[pair]);
    const y =
      wingPairs === 2
        ? (pair === 0 ? wingSplit : -wingSplit)
        : wingPairs >= 3
          ? (pair % 2 === 0 ? wingSplit * 0.55 : -wingSplit * 0.55)
          : 0;
    const host = hostAt(hosts, t);
    parts.push(
      flank(asset, host.place, {
        side,
        yOffset: fitY(asset, wingScale, host.box, y),
        zOffset: 0,
        overlap: hint.wingOverlap ?? 0,
        scale: wingScale,
      }),
    );
  });

  // ---- 3. propulsion ---------------------------------------------------- //
  // heavy boosters aft, light thrusters amidships
  parts.push(
    ...mountFamily(bag.mains, 0.74, 0.95, hosts, { scale: hint.mainScale ?? 1, yOffset: -0.02 }),
    ...mountFamily(bag.lights, 0.34, 0.66, hosts, { scale: hint.mainScale ?? 1, yOffset: -0.04 }),
  );

  // ---- 4. landing gear -------------------------------------------------- //
  // struts come in left/right pairs under the hull; an odd leg lands on the
  // centreline so a three-leg ship still stands on three points
  const gearTs = spread(Math.ceil(bag.gear.length / 2), 0.16, 0.88);
  const gearX = 0.34;
  bag.gear.forEach((asset, i) => {
    const host = hostAt(hosts, gearTs[Math.floor(i / 2)]).place;
    const odd = bag.gear.length % 2 === 1 && i === bag.gear.length - 1;
    parts.push(stack(asset, host, { xOffset: odd ? 0 : i % 2 === 0 ? gearX : -gearX }));
  });

  // ---- 5. weapons: alternate dorsal / ventral --------------------------- //
  const weaponTs = spread(bag.weapons.length, 0.2, 0.86);
  bag.weapons.forEach((asset, i) => {
    const host = hostAt(hosts, weaponTs[i]).place;
    parts.push(
      i % 2 === 0
        ? stack(asset, host, { below: false })
        : stack(asset, host, { below: true }),
    );
  });

  // ---- 6. dorsal kit ---------------------------------------------------- //
  const kitTs = spread(bag.shields.length + bag.reactors.length, 0.24, 0.8);
  [...bag.shields, ...bag.reactors].forEach((asset, i) => {
    parts.push(stack(asset, hostAt(hosts, kitTs[i]).place, { below: false }));
  });

  return {
    id: bp.slug,
    name: bp.name,
    role: `${bp.role} · ${bp.classification}`,
    blurb: bp.blurb,
    hull: style.hullBase,
    hullDark: style.hullDark,
    emissive: style.emissive,
    glow: style.family === "sentinel" || style.family === "stealth" ? 0.72 : 0.55,
    environment: style.environment,
    parts,
  };
}
