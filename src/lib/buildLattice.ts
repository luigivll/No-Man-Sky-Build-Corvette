/**
 * Build → lattice compiler.
 *
 * The blueprint compiler turns a parts LIST into a ship; this does the same for a
 * Build, which is what the manual builder and the randomizer produce. Without it
 * those two screens fall back to the polygon stand-ins in `render3d`, which is
 * exactly the "todo cubiculado y sin sentido" the real-mesh engine was built to
 * replace.
 *
 * A Build is a bag of part ids per category, so the layout is chosen from the
 * ship's shape rather than from a hand-drawn plan:
 *
 *   - nothing in `wing`      → a broadside: spine, flank kit, dorsal battery
 *   - nothing in `habitation` → a gunship: tight spine, heavy flank armament
 *   - heavy `habitation`     → a freighter: long spine, dorsal kit amidships
 *   - at least four wings    → a starfighter: wings from one station, canted
 *
 * Everything is placed with the same grid rules as the iconics, so a random
 * roll, a manual build and a T-65 all assemble through one engine.
 */

import { chainZ, placedBox, type LatticePlacement } from "./lattice";
import { deg, pod, put, row, span, spanPair } from "./iconics/dsl";
import { styleById } from "./shipStyles";
import { partById } from "./data";
import type { NamedRecipe } from "./fleet";
import type { Build, Part, PartCategoryId } from "./types";
import type { V3 } from "./render3d";

/** every asset in the build, grouped by the category the player put it in */
function bagOf(build: Build) {
  const out = {
    cockpit: null as string | null,
    habs: [] as string[],
    walkways: [] as string[],
    bays: [] as string[],
    gear: [] as string[],
    wings: [] as string[],
    mains: [] as string[],
    lights: [] as string[],
    weapons: [] as string[],
    shields: [] as string[],
    reactors: [] as string[],
  };

  const assetOf = (id: string) => (partById[id] as Part | undefined)?.assetId ?? null;

  for (const [category, ids] of Object.entries(build.slots) as [PartCategoryId, string[]][]) {
    for (const id of ids ?? []) {
      const asset = assetOf(id);
      if (!asset) continue;
      switch (category) {
        case "cockpit":
          out.cockpit = asset;
          break;
        case "habitation":
          if (id.startsWith("walkway")) out.walkways.push(asset);
          else out.habs.push(asset);
          break;
        // walkways are habitation-category parts whose ids start with "walkway";
        // any access module that is not a landing bay is structural, so it rides
        // the spine as a link
        case "access":
          if (id.startsWith("bay-")) out.bays.push(asset);
          else out.walkways.push(asset);
          break;
        case "landing":
          out.gear.push(asset);
          break;
        case "wing":
          out.wings.push(asset);
          break;
        case "engine-main":
          out.mains.push(asset);
          break;
        case "engine-light":
          out.lights.push(asset);
          break;
        case "weapon":
          out.weapons.push(asset);
          break;
        case "shield":
          out.shields.push(asset);
          break;
        case "reactor":
          out.reactors.push(asset);
          break;
        default:
          break;
      }
    }
  }
  return out;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TAIL_CAPS = ["B_STR_A_N", "B_STR_B_N", "B_STR_C_N", "B_STR_D_N", "B_STR_E_N"];

export function buildToRecipe(build: Build): NamedRecipe {
  const bag = bagOf(build);
  const seed = hash(build.id);
  const familyIds = build.styleIds?.length ? build.styleIds : ["corvette"];
  const style = styleById(familyIds[seed % familyIds.length], seed % 97);
  const parts: LatticePlacement[] = [];

  const isFighter = bag.wings.length >= 4;
  const isFreighter = bag.habs.length >= 4;
  const isGunship = bag.habs.length === 0 && bag.weapons.length >= 3;

  // ---- 1. spine ---------------------------------------------------------- //
  const spineIds: string[] = [];
  if (bag.cockpit) spineIds.push(bag.cockpit);
  // walkways break the habitation run up so the hull is not a wall of pods
  const perHab = bag.habs.length ? bag.walkways.length / bag.habs.length : 0;
  let cursor = 0;
  bag.habs.forEach((hab, i) => {
    spineIds.push(hab);
    const due = Math.round((i + 1) * perHab) - cursor;
    for (let w = 0; w < due && cursor < bag.walkways.length; w++) spineIds.push(bag.walkways[cursor++]);
  });
  while (cursor < bag.walkways.length) spineIds.push(bag.walkways[cursor++]);
  spineIds.push(...bag.bays);
  if (!spineIds.length) spineIds.push("B_STR_A_N");

  const spine = chainZ(spineIds);
  parts.push(...spine);

  const boxOf = (p: LatticePlacement) => placedBox(p.assetId, p.pos, p.yaw ?? 0, p.mirror ?? false, p.scale ?? 1, p.roll ?? 0, p.stretchX ?? 1);
  const hosts = spine
    .map((place) => ({ place, box: boxOf(place) }))
    .filter((h): h is { place: LatticePlacement; box: NonNullable<ReturnType<typeof boxOf>> } => Boolean(h.box));

  const hostAt = (t: number) => {
    const zs = hosts.map((h) => (h.box.min[2] + h.box.max[2]) / 2);
    const nose = Math.max(...zs);
    const tail = Math.min(...zs);
    const want = nose + (tail - nose) * Math.max(0, Math.min(1, t));
    return hosts.reduce((best, h, i) =>
      Math.abs(zs[i] - want) < Math.abs(zs[hosts.indexOf(best)] - want) ? h : best,
    );
  };

  // tail cap chains off the last spine module
  const last = hosts[hosts.length - 1];
  const capAsset = TAIL_CAPS[seed % TAIL_CAPS.length];
  const capLocal = boxOf({ assetId: capAsset, pos: [0, 0, 0] });
  parts.push({
    assetId: capAsset,
    pos: [0, last.place.pos[1], last.box.min[2] - (capLocal?.max[2] ?? 0)],
    role: "tail cap",
  });

  // ---- 2. wings ---------------------------------------------------------- //
  if (bag.wings.length) {
    const pairs = Math.ceil(bag.wings.length / 2);
    // four foils on one station and canted; anything else spreads along the spine
    const canted = isFighter;
    const t = canted ? 0.45 : pairs === 1 ? 0.55 : 0.4;
    const spread = (n: number, lo: number, hi: number) =>
      Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / Math.max(1, n - 1));

    bag.wings.forEach((asset, i) => {
      const pair = Math.floor(i / 2);
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const host = hostAt(canted ? t : pairs === 1 ? t : spread(pairs, 0.25, 0.72)[pair]);
      const root: V3 = [host.box.max[0] - 0.05, host.place.pos[1] + (canted && pair > 0 ? -0.15 : 0.1), host.place.pos[2]];
      const reach = canted ? 2.5 : 1.9;
      const dy = canted ? (pair % 2 === 0 ? 1 : -1) * 1.6 : 0.35;
      const wing = span(asset, root, [root[0] + reach, root[1] + dy, root[2]], {
        scale: canted ? 0.7 : 0.85,
        mirror: side < 0,
        role: canted ? (pair % 2 === 0 ? "upper wing" : "lower wing") : "wing",
      });
      parts.push(wing);
    });
  }

  // ---- 3. propulsion: heavy mains aft, light thrusters amidships ---------- //
  const placeEngines = (assets: string[], lo: number, hi: number, scale: number) => {
    const ts = spread(assets.length, lo, hi);
    assets.forEach((asset, i) => {
      const host = hostAt(ts[i]);
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const edge = side > 0 ? host.box.max[0] : host.box.min[0];
      parts.push(
        put(asset, [edge + side * 0.45, host.place.pos[1] - 0.02, host.place.pos[2] - 0.3], {
          mirror: side < 0,
          scale,
          role: side < 0 ? "port engine" : "starboard engine",
        }),
      );
    });
  };
  const spread = (n: number, lo: number, hi: number) =>
    n <= 1 ? [(lo + hi) / 2] : Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
  if (bag.mains.length) placeEngines(bag.mains, 0.78, 0.94, 1);
  if (bag.lights.length) placeEngines(bag.lights, 0.35, 0.6, 1);

  // a big ship with no heavy booster still needs a plume to look alive
  if (!bag.mains.length && !bag.lights.length) {
    const host = hostAt(0.92);
    parts.push(
      put("B_TRU_A", [0, host.place.pos[1], host.box.min[2] - 0.6], { mirror: true, role: "engine" }),
      put("B_TRU_A", [0.5, host.place.pos[1], host.box.min[2] - 0.6], { role: "engine" }),
      put("B_TRU_A", [-0.5, host.place.pos[1], host.box.min[2] - 0.6], { mirror: true, role: "engine" }),
    );
  }

  // ---- 4. landing gear: struts under the hull --------------------------- // ✓
  const gearTs = spread(bag.gear.length, isFighter ? 0.3 : 0.18, 0.86);
  bag.gear.forEach((asset, i) => {
    const host = hostAt(gearTs[i]);
    const odd = bag.gear.length % 2 === 1 && i === bag.gear.length - 1;
    const x = odd ? 0 : i % 2 === 0 ? 0.4 : -0.4;
    const local = boxOf({ assetId: asset, pos: [0, 0, 0] });
    const drop = local ? host.box.min[1] - local.max[1] : host.box.min[1];
    parts.push(put(asset, [x, drop, host.place.pos[2]], { role: "landing gear" }));
  });

  // ---- 5. weapons: alternate dorsal / ventral --------------------------- //
  const weaponTs = spread(bag.weapons.length, 0.2, 0.85);
  bag.weapons.forEach((asset, i) => {
    const host = hostAt(weaponTs[i]);
    const local = boxOf({ assetId: asset, pos: [0, 0, 0] });
    const up = i % 2 === 0;
    const y = local
      ? up
        ? host.box.max[1] - local.min[1]
        : host.box.min[1] - local.max[1]
      : host.place.pos[1];
    parts.push(put(asset, [0, y, host.place.pos[2]], { role: up ? "dorsal mount" : "ventral mount" }));
  });

  // ---- 6. shield and reactor kit, on the deck amidships ------------------ //
  const kit = [...bag.shields, ...bag.reactors];
  const kitTs = spread(kit.length, isFreighter ? 0.45 : 0.3, 0.68);
  kit.forEach((asset, i) => {
    const host = hostAt(kitTs[i]);
    const local = boxOf({ assetId: asset, pos: [0, 0, 0] });
    const y = local ? host.box.max[1] - local.min[1] : host.place.pos[1];
    parts.push(put(asset, [0, y, host.place.pos[2]], { role: "deck mount" }));
  });

  const role = isFighter
    ? "strike craft · randomised"
    : isGunship
      ? "gunship · randomised"
      : isFreighter
        ? "freighter · randomised"
        : "corvette · randomised";

  void pod;
  void row;
  void spanPair;
  void deg;

  return {
    id: build.id,
    name: build.name,
    role,
    blurb: build.rationale?.length
      ? build.rationale.join(" ")
      : `Laid out as a ${role.split(" ·")[0]}: ${spine.length} spine modules with everything else bolted to their own faces.`,
    hull: style.hullBase,
    hullDark: style.hullDark,
    emissive: style.emissive,
    glow: build.styleIds?.some((s) => s.includes("sentinel") || s.includes("stealth")) ? 0.72 : 0.55,
    environment: style.environment,
    parts,
    view: isFighter ? { yaw: 0, pitch: -0.12, zoom: 1 } : { yaw: 0.55, pitch: -0.38, zoom: 1 },
  };
}
