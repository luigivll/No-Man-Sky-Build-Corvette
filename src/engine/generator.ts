import type {
  DesignBase,
  DesignTag,
  GeneratorOptions,
  GeneratorResult,
  PartCategory,
  PartDef,
  Placement,
  SnapNode,
} from "@/domain/types";
import { PARTS } from "@/domain/parts";
import { BUILD_LIMITS, HARDPOINT_CATEGORIES } from "@/domain/constants";
import { createId } from "@/lib/id";

/**
 * Random fusion generator.
 *
 * A corvette is grown from a core deck outward, biased by two independent
 * dials: a *tag* (what the ship is for) and a *design base* (which visual
 * language the parts come from). Selection is weighted, seeded and mirror-aware
 * so the same seed always rebuilds exactly the same hull.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAG_WEIGHTS: Record<DesignTag, Partial<Record<PartCategory, number>>> = {
  "combat-heavy": {
    weapon: 3.4,
    shield: 2.6,
    plating: 2.2,
    reactor: 1.6,
    engine: 1.3,
    thruster: 1.1,
    wing: 0.7,
    habitation: 0.9,
    cargo: 0.4,
    decoration: 0.8,
  },
  "sleek-explorer": {
    thruster: 2.4,
    engine: 2.2,
    wing: 1.6,
    cockpit: 1.2,
    plating: 1.5,
    weapon: 0.7,
    shield: 0.8,
    habitation: 0.8,
    walkway: 1.4,
    cargo: 0.5,
    decoration: 1.1,
  },
  gunship: {
    weapon: 2.8,
    plating: 1.8,
    thruster: 1.6,
    engine: 1.4,
    landingGear: 1.6,
    habitation: 1.2,
    shield: 1.4,
    wing: 1.0,
    cargo: 0.8,
  },
  "cargo-hauler": {
    habitation: 2.6,
    walkway: 2.2,
    cargo: 2.4,
    landingBay: 1.8,
    landingGear: 1.6,
    plating: 1.4,
    thruster: 1.0,
    weapon: 0.5,
    shield: 0.8,
    decoration: 1.2,
  },
  interceptor: {
    thruster: 2.8,
    engine: 2.6,
    wing: 1.8,
    weapon: 1.6,
    plating: 1.2,
    cockpit: 1.4,
    habitation: 0.5,
    cargo: 0.2,
    shield: 0.9,
  },
  industrial: {
    cargo: 2.6,
    plating: 2.2,
    walkway: 1.8,
    landingGear: 1.8,
    thruster: 1.4,
    habitation: 1.4,
    decoration: 2.0,
    weapon: 0.9,
    shield: 0.9,
  },
};

const TAG_PREFERRED_TAGS: Record<DesignTag, readonly string[]> = {
  "combat-heavy": ["armoured", "combat", "heavy", "turret", "defence"],
  "sleek-explorer": ["sleek", "fast", "foil", "tapered", "long"],
  gunship: ["pod", "turret", "gunship", "combat", "heavy"],
  "cargo-hauler": ["hauler", "cargo", "container", "deck", "boxy"],
  interceptor: ["sleek", "fast", "agile", "long", "twin"],
  industrial: ["industrial", "ragged", "utility", "exposed", "boxy"],
};

const BASE_STYLES: Record<DesignBase, readonly string[]> = {
  sentinel: ["titan", "hardframe", "argonaut"],
  exotic: ["arcadia", "rockhopper", "albatross"],
  normal: ["titan", "ambassador", "thunderbird"],
  hybrid: ["titan", "ambassador", "thunderbird", "arcadia", "rockhopper", "argonaut", "albatross", "hardframe", "supercruise"],
};

interface Builder {
  placements: Placement[];
  partOf: Map<string, PartDef>;
  /** placementId -> node ids already used (with multiplicity). */
  usage: Map<string, number[]>;
  /** placementId -> vertical storey index, so growth can respect the 3-deck cap. */
  storey: Map<string, number>;
  /** Lowest / highest storey currently in use. */
  minStorey: number;
  maxStorey: number;
  rng: () => number;
  tag: DesignTag;
  base: DesignBase;
}

/** Vertical storeys are consumed by module faces pointing up or down. */
const STOREY_DELTA: Record<string, number> = {
  top: 1,
  bottom: -1,
};

const pick = <T>(rng: () => number, items: readonly T[]): T | undefined =>
  items.length === 0 ? undefined : items[Math.floor(rng() * items.length) % items.length];

const shuffle = <T>(rng: () => number, items: readonly T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

function candidates(builder: Builder, category: PartCategory): PartDef[] {
  const weights = TAG_WEIGHTS[builder.tag] ?? {};
  const preferredStyles = BASE_STYLES[builder.base];
  const preferredTags = TAG_PREFERRED_TAGS[builder.tag];
  const categoryWeight = weights[category] ?? 1;

  const scored = PARTS.filter((part) => part.category === category).map((part) => {
    let score = categoryWeight;
    if (preferredStyles.includes(part.style)) score *= 2.2;
    const tagHits = part.tags.filter((tag) => preferredTags.includes(tag)).length;
    score *= 1 + tagHits * 0.55;
    if (part.style === "generic") score *= 0.85;
    return { part, score };
  });

  if (scored.length === 0) return [];

  const total = scored.reduce((sum, entry) => sum + entry.score, 0);
  let roll = builder.rng() * total;
  for (const entry of scored) {
    roll -= entry.score;
    if (roll <= 0) return [entry.part];
  }
  return [scored[scored.length - 1]!.part];
}

function usedOn(builder: Builder, placementId: string, nodeId: string): number {
  const list = builder.usage.get(placementId);
  if (!list) return 0;
  const index = builder.partOf.get(placementId)!.nodes.findIndex((node) => node.id === nodeId);
  return list[index] ?? 0;
}

function markUsed(builder: Builder, placementId: string, nodeId: string): void {
  const part = builder.partOf.get(placementId)!;
  const index = part.nodes.findIndex((node) => node.id === nodeId);
  if (index === -1) return;
  const list = builder.usage.get(placementId) ?? part.nodes.map(() => 0);
  list[index] = (list[index] ?? 0) + 1;
  builder.usage.set(placementId, list);
}

interface Slot {
  placementId: string;
  node: SnapNode;
}

/**
 * Slots free for `category`. `maxDecks` caps the total number of distinct
 * vertical storeys (up and down) so the generator honours the in-game
 * recommendation of at most three decks.
 */
function freeSlots(builder: Builder, category: PartCategory, maxDecks = Infinity): Slot[] {
  const slots: Slot[] = [];
  for (const placement of builder.placements) {
    const part = builder.partOf.get(placement.id)!;
    const storey = builder.storey.get(placement.id) ?? 0;
    for (const node of part.nodes) {
      if (!node.accepts.includes(category)) continue;
      if (node.id.startsWith("hp-") && !HARDPOINT_CATEGORIES.includes(category)) continue;
      if (usedOn(builder, placement.id, node.id) >= node.slots) continue;
      const direction = node.id.startsWith("hp-") ? node.id.slice(3) : node.id;
      const childStorey = storey + (STOREY_DELTA[direction] ?? 0);
      const span = Math.max(builder.maxStorey, childStorey) - Math.min(builder.minStorey, childStorey) + 1;
      if (span > maxDecks) continue;
      slots.push({ placementId: placement.id, node });
    }
  }
  return slots;
}

/** The flight-critical categories a given design tag must additionally satisfy. */
function requiredCoverage(tag: DesignTag): PartCategory[] {
  const base: PartCategory[] = ["weapon", "shield", "cargo"];
  switch (tag) {
    case "combat-heavy":
      return ["weapon", "shield", "thruster", "engine"];
    case "sleek-explorer":
      return ["shield", "cargo", "engine", "walkway"];
    case "gunship":
      return ["weapon", "shield", "engine"];
    case "cargo-hauler":
      return ["cargo", "walkway", "shield"];
    case "interceptor":
      return ["weapon", "thruster", "engine"];
    case "industrial":
      return ["walkway", "cargo", "decoration", "shield"];
    default:
      return base;
  }
}

const MIRROR: Record<string, string> = {
  port: "starboard",
  starboard: "port",
  "hp-port": "hp-starboard",
  "hp-starboard": "hp-port",
};

function add(
  builder: Builder,
  partId: string,
  parentId: string | null,
  nodeId: string | null,
): Placement | null {
  if (builder.placements.length >= BUILD_LIMITS.maxParts) return null;
  const part = PARTS.find((candidate) => candidate.id === partId);
  if (!part) return null;

  const placement: Placement = { id: createId("g"), partId, parentId, node: nodeId };
  builder.placements.push(placement);
  builder.partOf.set(placement.id, part);

  const parentStorey = parentId ? (builder.storey.get(parentId) ?? 0) : 0;
  const direction = nodeId?.startsWith("hp-") ? nodeId.slice(3) : nodeId;
  const childStorey = parentStorey + (nodeId ? (STOREY_DELTA[direction ?? ""] ?? 0) : 0);
  builder.storey.set(placement.id, childStorey);
  builder.minStorey = Math.min(builder.minStorey, childStorey);
  builder.maxStorey = Math.max(builder.maxStorey, childStorey);

  if (parentId && nodeId) markUsed(builder, parentId, nodeId);
  return placement;
}

/** Places a part and, when the node has a left/right twin, a mirrored copy. */
function addMirrored(
  builder: Builder,
  category: PartCategory,
  options: { symmetrical: boolean; requireMirror?: boolean } = { symmetrical: true },
): Placement | null {
  const slots = shuffle(builder.rng, freeSlots(builder, category, BUILD_LIMITS.maxFloors));
  for (const slot of slots) {
    const part = candidates(builder, category)[0];
    if (!part) return null;
    const placed = add(builder, part.id, slot.placementId, slot.node.id);
    if (!placed) return null;

    if (options.symmetrical) {
      const mirrorId = MIRROR[slot.node.id];
      if (mirrorId) {
        const mirrorNode = builder.partOf.get(slot.placementId)!.nodes.find((n) => n.id === mirrorId);
        if (mirrorNode && usedOn(builder, slot.placementId, mirrorId) < mirrorNode.slots) {
          add(builder, part.id, slot.placementId, mirrorId);
        } else if (options.requireMirror) {
          return placed;
        }
      }
    }
    return placed;
  }
  return null;
}

export function generate(options: GeneratorOptions): GeneratorResult {
  const rng = mulberry32(options.seed);
  const placements: Placement[] = [];
  const partOf = new Map<string, PartDef>();
  const builder: Builder = {
    placements,
    partOf,
    usage: new Map(),
    storey: new Map(),
    minStorey: 0,
    maxStorey: 0,
    rng,
    tag: options.tag,
    base: options.base,
  };

  /* 1 — core deck -------------------------------------------------- */
  const corePart = candidates(builder, "habitation")[0] ?? PARTS.find((p) => p.category === "habitation")!;
  const core = add(builder, corePart.id, null, null)!;

  /* 2 — bridge at the front ---------------------------------------- */
  const cockpitSlot = freeSlots(builder, "cockpit", BUILD_LIMITS.maxFloors).find((slot) => slot.node.direction === "front");
  if (cockpitSlot) {
    const cockpit = candidates(builder, "cockpit")[0];
    if (cockpit) add(builder, cockpit.id, cockpitSlot.placementId, cockpitSlot.node.id);
  }

  /* 3 — docking ramp at the back ----------------------------------- */
  const baySlot = freeSlots(builder, "landingBay").find((slot) => slot.node.direction === "rear");
  if (baySlot) {
    const bayPart = candidates(builder, "landingBay")[0];
    if (bayPart) add(builder, bayPart.id, baySlot.placementId, baySlot.node.id);
  }

  /* 4 — undercarriage ---------------------------------------------- */
  const gearCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < gearCount; i += 1) {
    const slots = freeSlots(builder, "landingGear").filter((slot) => slot.node.direction === "bottom");
    const slot = slots[i % Math.max(1, slots.length)];
    if (!slot) break;
    const gear = candidates(builder, "landingGear")[0];
    if (!gear) break;
    add(builder, gear.id, slot.placementId, slot.node.id);
  }

  /* 5 — reactor + main drive --------------------------------------- */
  const reactorSlot =
    freeSlots(builder, "reactor").find((slot) => slot.node.direction === "rear") ??
    freeSlots(builder, "reactor").find((slot) => slot.node.direction === "top");
  const reactor = reactorSlot
    ? add(builder, candidates(builder, "reactor")[0]!.id, reactorSlot.placementId, reactorSlot.node.id)
    : null;

  if (reactor) {
    const engineSlot = freeSlots(builder, "engine").find((slot) => slot.placementId === reactor.id);
    if (engineSlot) {
      const engine = candidates(builder, "engine")[0];
      if (engine) {
        add(builder, engine.id, engineSlot.placementId, engineSlot.node.id);
        const mirror = MIRROR[engineSlot.node.id];
        if (mirror && engineSlot.node.slots >= 2) {
          // Twin main drives on a shared node are spread automatically.
          add(builder, engine.id, engineSlot.placementId, engineSlot.node.id);
        }
      }
    }
  }

  /* 6 — mandatory weapon ------------------------------------------- */
  addMirrored(builder, "weapon", { symmetrical: rng() > 0.35 });

  /* 7 — sublight thrusters ----------------------------------------- */
  const thrusterPairs = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < thrusterPairs; i += 1) {
    addMirrored(builder, "thruster", { symmetrical: true });
  }

  /* 8 — fill the remaining flight-critical categories ----------------- */
  const covered = new Set<PartCategory>([
    "habitation",
    "cockpit",
    "landingBay",
    "landingGear",
    "reactor",
    "engine",
    "weapon",
    "thruster",
  ]);
  for (const category of requiredCoverage(options.tag)) {
    if (covered.has(category)) continue;
    if (builder.placements.length >= BUILD_LIMITS.maxParts) break;
    const slots = freeSlots(builder, category, BUILD_LIMITS.maxFloors);
    if (slots.length === 0) continue;
    const slot = pick(rng, slots)!;
    const part = candidates(builder, category)[0];
    if (!part) continue;
    add(builder, part.id, slot.placementId, slot.node.id);
    covered.add(category);
  }

  /* 9 — grow toward the requested complexity ------------------------- */
  const target = Math.max(10, Math.min(options.complexity, BUILD_LIMITS.maxParts));
  const growthOrder: PartCategory[] = [
    "wing",
    "shield",
    "plating",
    "cargo",
    "decoration",
    "walkway",
    "habitation",
    "engine",
    "weapon",
    "thruster",
  ];

  let guard = 0;
  while (builder.placements.length < target && guard < target * 12) {
    guard += 1;
    const category = growthOrder[Math.floor(rng() * growthOrder.length)]!;
    const slots = freeSlots(builder, category, BUILD_LIMITS.maxFloors);
    if (slots.length === 0) continue;
    const slot = pick(rng, slots)!;
    const part = candidates(builder, category)[0];
    if (!part) continue;
    const mirrorId = options.symmetrical ? MIRROR[slot.node.id] : undefined;
    const mirrorNode = mirrorId ? part.nodes.find((node) => node.id === mirrorId) : undefined;
    // Strict symmetry: if the mirrored face is taken, place neither.
    if (options.symmetrical && mirrorNode && usedOn(builder, slot.placementId, mirrorId!) >= mirrorNode.slots) {
      continue;
    }
    add(builder, part.id, slot.placementId, slot.node.id);
    if (mirrorNode) add(builder, part.id, slot.placementId, mirrorId!);
  }

  /* 10 — surface detail --------------------------------------------- */
  const detailCategories: PartCategory[] = ["plating", "decoration", "shield", "cargo"];
  guard = 0;
  while (builder.placements.length < target + 6 && guard < 60) {
    guard += 1;
    const category = detailCategories[Math.floor(rng() * detailCategories.length)]!;
    const slots = freeSlots(builder, category, BUILD_LIMITS.maxFloors);
    if (slots.length === 0) break;
    const slot = pick(rng, slots)!;
    const part = candidates(builder, category)[0];
    if (!part) break;
    add(builder, part.id, slot.placementId, slot.node.id);
  }

  /* 11 — safety pass: never exceed the hard cap ---------------------- */
  pruneToLimit(builder);

  return { placements: [...builder.placements], options };
}

/** Drops trailing placements (and anything left dangling) until the cap holds. */
function pruneToLimit(builder: Builder): void {
  while (builder.placements.length > BUILD_LIMITS.maxParts) {
    builder.placements.pop();
    const alive = new Set(builder.placements.map((placement) => placement.id));
    for (let i = builder.placements.length - 1; i >= 0; i -= 1) {
      const placement = builder.placements[i]!;
      if (placement.parentId !== null && !alive.has(placement.parentId)) {
        builder.placements.splice(i, 1);
        alive.delete(placement.id);
      }
    }
  }
  for (const placement of builder.placements) {
    if (!builder.partOf.has(placement.id)) {
      const part = PARTS.find((candidate) => candidate.id === placement.partId);
      if (part) builder.partOf.set(placement.id, part);
    }
  }
}

/** Random seed in a shareable range. */
export const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff);
