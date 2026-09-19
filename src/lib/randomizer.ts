import { categories, meta, partsByCategory, requirements } from "./data";
import {
  cloneBuild,
  computeStats,
  countParts,
  createBuild,
  inventorySlots,
  requirementStatus,
} from "./build";
import type { Build, BuildSlots, Part, PartCategoryId, RoleId } from "./types";
import {
  generateDesignation,
  generateShipName,
  intBetween,
  mulberry32,
  pickWeighted,
  type Rng,
} from "./names";

export interface RoleDef {
  id: RoleId;
  label: string;
  short: string;
  tagline: string;
  icon: string;
  accent: string;
  rules: string[];
}

export const ROLE_DEFS: RoleDef[] = [
  {
    id: "combat",
    label: "Combat Heavy",
    short: "Combat",
    tagline: "Gunship loadout: maximum damage, stacked shields, fast reactor.",
    icon: "Crosshair",
    accent: "#ef4444",
    rules: [
      "Forces at least one Deadeye Cannon and a High-Energy Shield",
      "3-6 weapon hardpoints and 2+ shield generators",
      "Medusa or Azimuth reactor for turn rate",
    ],
  },
  {
    id: "exploration",
    label: "Sleek Explorer",
    short: "Exploration",
    tagline: "Long-range survey rig: warp range, cargo slots, light weapons.",
    icon: "Compass",
    accent: "#22d3ee",
    rules: [
      "Zenith-Class reactor for maximum Warp distance",
      "Extra Habitation and Walkway sections for inventory slots",
      "Weapon count capped so mass stays low",
    ],
  },
  {
    id: "massive",
    label: "Massive / Freighter-lite",
    short: "Massive",
    tagline: "Flying base: many Habs, Heavy Landing Gear, engine walls.",
    icon: "Layers",
    accent: "#f59e0b",
    rules: [
      "Forces multiple Habitation modules and Heavy Landing Gear",
      "Multiple main engines and 2 landing bays",
      "Pads the hull with plating toward the 160-part cap",
    ],
  },
  {
    id: "minimalist",
    label: "Minimalist",
    short: "Minimalist",
    tagline: "Bare hull: the smallest legal Corvette that still flies well.",
    icon: "Feather",
    accent: "#a3e635",
    rules: [
      "Targets 20 modules or fewer",
      "Lightest parts by mass - Ion Barrier, Speedbird winglets",
      "One weapon, one hab, no plating",
    ],
  },
];

export const roleById: Record<RoleId, RoleDef> = Object.fromEntries(
  ROLE_DEFS.map((r) => [r.id, r]),
) as Record<RoleId, RoleDef>;

export type SizeId = "minimal" | "light" | "standard" | "heavy" | "auto";

export const SIZE_OPTIONS: { id: SizeId; label: string; budget: number }[] = [
  { id: "minimal", label: "Skeleton (≤16)", budget: 16 },
  { id: "light", label: "Light (≈26)", budget: 26 },
  { id: "standard", label: "Standard (≈42)", budget: 42 },
  { id: "heavy", label: "Heavy (≈80)", budget: 80 },
  { id: "auto", label: "Match the role", budget: 0 },
];

export interface GeneratorOptions {
  roles: RoleId[];
  size: SizeId;
  salvageOnly: boolean;
  symmetry: boolean;
  seed: number;
}

interface Plan {
  habs: number;
  walkways: number;
  reactors: number;
  bays: number;
  mains: number;
  lights: number;
  gears: number;
  weapons: number;
  shields: number;
  wings: number;
}

const SIZE_PLANS: Record<Exclude<SizeId, "auto">, Plan> = {
  minimal: { habs: 1, walkways: 0, reactors: 1, bays: 1, mains: 1, lights: 2, gears: 2, weapons: 1, shields: 0, wings: 0 },
  light: { habs: 2, walkways: 1, reactors: 1, bays: 1, mains: 1, lights: 2, gears: 2, weapons: 2, shields: 1, wings: 2 },
  standard: { habs: 3, walkways: 3, reactors: 2, bays: 1, mains: 2, lights: 3, gears: 2, weapons: 3, shields: 2, wings: 4 },
  heavy: { habs: 7, walkways: 7, reactors: 4, bays: 2, mains: 3, lights: 5, gears: 4, weapons: 5, shields: 2, wings: 7 },
};

function resolveSize(options: GeneratorOptions): Exclude<SizeId, "auto"> {
  if (options.size !== "auto") return options.size;
  const { roles } = options;
  if (roles.includes("massive")) return "heavy";
  if (roles.includes("minimalist") && roles.length === 1) return "minimal";
  if (roles.includes("minimalist")) return "light";
  return "standard";
}

function planFor(size: Exclude<SizeId, "auto">, roles: RoleId[]): Plan {
  const plan: Plan = { ...SIZE_PLANS[size] };
  if (roles.length === 0) return plan;
  if (roles.includes("combat")) {
    plan.weapons = Math.min(6, plan.weapons + 2);
    plan.shields += 1;
    plan.habs = Math.max(1, plan.habs - 1);
    plan.mains = Math.max(2, plan.mains);
    plan.lights = Math.max(3, plan.lights);
  }
  if (roles.includes("exploration")) {
    plan.reactors += 1;
    plan.walkways += 2;
    plan.weapons = Math.min(2, plan.weapons);
    plan.shields = Math.max(1, plan.shields);
    plan.lights += 1;
  }
  if (roles.includes("massive")) {
    plan.habs = Math.round(plan.habs * 1.5) + 1;
    plan.walkways += 4;
    plan.gears = Math.max(3, plan.gears);
    plan.mains += 1;
    plan.bays = Math.max(2, plan.bays);
    plan.reactors += 2;
    plan.wings += 3;
  }
  if (roles.includes("minimalist")) {
    plan.habs = Math.min(plan.habs, 1);
    plan.walkways = Math.min(plan.walkways, 1);
    plan.reactors = Math.min(plan.reactors, 1);
    plan.bays = 1;
    plan.mains = 1;
    plan.lights = 2;
    plan.gears = Math.min(plan.gears, 2);
    plan.weapons = Math.min(plan.weapons, 1);
    plan.shields = Math.min(plan.shields, 1);
    plan.wings = Math.min(plan.wings, 1);
  }
  plan.reactors = Math.min(plan.reactors, meta.maxReactorModules);
  return plan;
}

/** How well a part expresses a role. Higher = more "on theme". */
export function fitScore(part: Part, role: RoleId): number {
  switch (role) {
    case "combat":
      return part.stats.damage * 1.5 + part.stats.shield * 1.0 + part.stats.maneuver * 0.35;
    case "exploration":
      return part.stats.hyperdrive * 2.0 + part.stats.cargo * 0.4 + part.stats.maneuver * 0.4 + part.stats.shield * 0.3;
    case "massive":
      return part.mass * 0.7 + part.stats.cargo * 0.6 + part.cargoSlots * 2.0;
    case "minimalist":
      return Math.max(0.5, 26 - part.mass * 1.3 + part.stats.maneuver * 0.5 - part.price / 150000);
    default:
      return 1;
  }
}

function weightFor(part: Part, roles: RoleId[], salvageOnly: boolean): number {
  let weight = 1;
  if (roles.length === 0) {
    weight = 1 + part.stats.damage * 0.05 + part.stats.shield * 0.05;
  } else {
    for (const role of roles) {
      const onTheme = part.roles.includes(role);
      weight *= 1 + (onTheme ? 0.9 : -0.45) + fitScore(part, role) / 45;
    }
  }
  if (salvageOnly && !part.buyable) weight *= 2.2;
  return Math.max(0.05, weight);
}

function poolFor(
  category: PartCategoryId,
  options: GeneratorOptions,
  extras: Part[] = [],
): Part[] {
  const base = partsByCategory[category] ?? [];
  const combined = [...base, ...extras];
  if (!options.salvageOnly) return combined;
  const nonBuyable = combined.filter((p) => !p.buyable);
  // Reactors and a few basics cannot be salvaged at all - fall back to vendor stock.
  return nonBuyable.length > 0 ? nonBuyable : combined;
}

interface Allocation {
  category: PartCategoryId;
  qty: number;
  pool?: Part[];
  guarantee?: (pool: Part[]) => Part | undefined;
  label: string;
}

function choose(rng: Rng, pool: Part[], options: GeneratorOptions): Part {
  return pickWeighted(rng, pool, (part) => weightFor(part, options.roles, options.salvageOnly));
}

function push(slots: BuildSlots, category: PartCategoryId, id: string) {
  slots[category] = [...(slots[category] ?? []), id];
}

export interface GeneratedBuild extends Build {
  rationale: string[];
}

export function generateBuild(options: GeneratorOptions): GeneratedBuild {
  const rng = mulberry32(options.seed || Math.floor(Math.random() * 1e9));
  const size = resolveSize(options);
  const plan = planFor(size, options.roles);
  const slots: BuildSlots = {};
  const rationale: string[] = [];
  const roles = options.roles;

  const place = (
    category: PartCategoryId,
    qty: number,
    choices: Part[],
    note?: string,
  ) => {
    if (qty <= 0 || choices.length === 0) return;
    let remaining = qty;
    if (options.symmetry && qty >= 2) {
      // Keep symmetric clusters to 1-2 distinct module types.
      const types = Math.min(choices.length, qty % 4 === 0 ? 2 : 1);
      const picked = new Set<Part>();
      let guard = 0;
      while (picked.size < types && guard < 24) {
        picked.add(choose(rng, choices, options));
        guard += 1;
      }
      const list = [...picked];
      let i = 0;
      while (remaining > 0) {
        push(slots, category, list[i % list.length].id);
        i += 1;
        remaining -= 1;
      }
    } else {
      while (remaining > 0) {
        push(slots, category, choose(rng, choices, options).id);
        remaining -= 1;
      }
    }
    if (note) rationale.push(note);
  };

  // ---- Guarantees that make the roles feel intentional -------------------
  const guarantees: string[] = [];
  const cockpitPool = poolFor("cockpit", options);

  if (roles.includes("combat")) {
    const weaponPool = poolFor("weapon", options);
    const forcedWeapon =
      weaponPool.find((p) => p.id === "weapon-deadeye") ??
      weaponPool.find((p) => p.id === "weapon-infraknife");
    if (forcedWeapon) {
      push(slots, "weapon", forcedWeapon.id);
      plan.weapons -= 1;
      guarantees.push(`Combat doctrine: ${forcedWeapon.name} hard-locked`);
    }
    const shieldPool = poolFor("shield", options);
    const forcedShield = shieldPool.find((p) => p.id === "shield-highenergy");
    if (forcedShield) {
      push(slots, "shield", forcedShield.id);
      plan.shields -= 1;
      guarantees.push(`Combat doctrine: ${forcedShield.name} hard-locked`);
    }
  }

  if (roles.includes("exploration")) {
    const reactorPool = poolFor("reactor", options);
    const forced = reactorPool.find((p) => p.id === "reactor-zenith");
    if (forced) {
      push(slots, "reactor", forced.id);
      plan.reactors -= 1;
      guarantees.push("Explorer doctrine: Zenith-Class reactor for maximum warp range");
    }
  }

  if (roles.includes("massive")) {
    const gearPool = poolFor("landing", options);
    const forced = gearPool.find((p) => p.id === "gear-heavy");
    if (forced) {
      push(slots, "landing", forced.id);
      plan.gears -= 1;
      guarantees.push("Massive doctrine: Heavy Landing Gear fitted under the main hull");
    }
  }

  // ---- Core placement ----------------------------------------------------
  place("cockpit", 1, cockpitPool);
  place("reactor", plan.reactors, poolFor("reactor", options));
  place("habitation", plan.habs, partsByCategory.habitation.filter((p) => p.cargoSlots === 3));

  const walkwayCount = plan.walkways;
  const habCategory = partsByCategory.habitation.filter((p) => p.tags.includes("corridor"));
  place("habitation", walkwayCount, habCategory.length ? habCategory : partsByCategory.habitation);

  place("access", plan.bays, poolFor("access", options));
  place("engine-main", plan.mains, poolFor("engine-main", options));
  place("engine-light", plan.lights, poolFor("engine-light", options));
  place("landing", plan.gears, poolFor("landing", options));
  place("weapon", plan.weapons, poolFor("weapon", options));
  place("shield", plan.shields, poolFor("shield", options));
  place("wing", plan.wings, poolFor("wing", options));

  // ---- Padding toward the target part budget -----------------------------
  const budget = SIZE_OPTIONS.find((s) => s.id === size)?.budget ?? 42;
  let target = roles.includes("massive") ? Math.round(budget * 1.25) : budget;
  // Minimalist doctrine wins over an oversized preset: a "skeleton" hull that
  // pads itself out to 80 modules is not a skeleton.
  const minimalClamp = roles.includes("minimalist") && target > 24 ? 24 : 0;
  if (minimalClamp > 0) target = minimalClamp;
  const wingPool = poolFor("wing", options);
  const platingPool = wingPool.filter((p) => p.tags.includes("plating"));
  // In salvage-first mode every plating module is vendor-only, so pad with
  // stabilisers instead - they can at least be pulled out of a derelict.
  const padPool = platingPool.length > 0 ? platingPool : wingPool;
  const habPool = partsByCategory.habitation;
  let guard = 0;
  while (countParts({ ...createBuild(), slots }) < target && guard < 200) {
    guard += 1;
    const usePlating = rng() < 0.55 && padPool.length > 0;
    const pool = usePlating ? padPool : habPool;
    const chosen = choose(rng, pool, options);
    push(slots, chosen.category, chosen.id);
  }

  // ---- Safety net: never hand back an unspaceworthy build ----------------
  for (const requirement of requirements) {
    const have = slots[requirement.categoryId]?.length ?? 0;
    while ((slots[requirement.categoryId]?.length ?? 0) < requirement.min) {
      const pool = poolFor(requirement.categoryId, options);
      const chosen = choose(rng, pool, options);
      push(slots, chosen.category, chosen.id);
    }
    if (have < requirement.min) {
      rationale.push(
        `Topped up ${requirement.categoryId} to meet the Workshop minimum of ${requirement.min}`,
      );
    }
  }

  const build = createBuild({
    name: generateShipName(rng, roles),
    designation: generateDesignation(rng, roles),
    slots,
    roles,
    origin: "randomizer",
    seed: options.seed,
  });

  const stats = computeStats(build);
  const total = countParts(build);
  const habCount = (slots.habitation ?? []).filter(
    (id) => !id.includes("walkway"),
  ).length;
  rationale.unshift(
    `Generated ${total} modules (${stats.profile.join(", ") || "balanced"}) - +${inventorySlots(build)} inventory slots, ${stats.ratings.maneuver}/100 manoeuvrability`,
  );
  if (roles.length > 0) {
    rationale.push(
      `Role weighting: ${roles.map((r) => roleById[r].label).join(" + ")}`,
    );
  }
  if (options.salvageOnly) {
    rationale.push("Salvage-first sourcing: vendor-only modules avoided where a drop exists");
  }
  if (options.symmetry) {
    rationale.push("Symmetry lock: matched pairs/triples on wings, engines, guns and gear");
  }
  if (minimalClamp > 0) {
    rationale.push(
      `Minimalist doctrine capped the hull at ${minimalClamp} modules even though the size preset was larger`,
    );
  }
  if (habCount >= 4) {
    rationale.push(`${habCount} Habitation modules - a genuinely live-aboard hull`);
  }
  for (const g of guarantees) rationale.push(g);

  return { ...cloneBuild(build), rationale };
}

export function buildGeneratorUrl(options: GeneratorOptions): string {
  const params = new URLSearchParams({
    roles: options.roles.join(","),
    size: options.size,
    seed: String(options.seed),
  });
  if (options.salvageOnly) params.set("salvage", "1");
  if (options.symmetry) params.set("symmetry", "1");
  return `/randomizer?${params.toString()}`;
}

export function randomSeed(): number {
  return intBetween(mulberry32(Date.now() >>> 0), 1, 999_999);
}
