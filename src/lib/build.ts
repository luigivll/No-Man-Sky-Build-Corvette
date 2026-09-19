import {
  categoryById,
  categories,
  meta,
  partById,
  parts,
  requirements,
} from "./data";
import type {
  Blueprint,
  Build,
  BuildSlots,
  Part,
  PartCategoryId,
  RequirementStatus,
  StatId,
  StatTotals,
} from "./types";

export const STAT_IDS: StatId[] = [
  "damage",
  "shield",
  "maneuver",
  "hyperdrive",
  "cargo",
];

/**
 * Reference values used to turn raw stat points into a 0-100 index.
 * They approximate a "very strong end-game Corvette" in each axis.
 */
export const STAT_REFS: Record<StatId, number> = {
  damage: 72,
  shield: 68,
  maneuver: 78,
  hyperdrive: 34,
  cargo: 84,
};

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function createBuild(partial: Partial<Build> = {}): Build {
  return {
    id: partial.id ?? newId(),
    name: partial.name ?? "Untitled Corvette",
    createdAt: partial.createdAt ?? Date.now(),
    slots: partial.slots ?? {},
    roles: partial.roles ?? [],
    origin: partial.origin ?? "manual",
    blueprintId: partial.blueprintId,
    seed: partial.seed,
    designation: partial.designation,
    rationale: partial.rationale,
    styleIds: partial.styleIds,
  };
}

export function cloneBuild(build: Build): Build {
  return {
    ...build,
    slots: Object.fromEntries(
      Object.entries(build.slots).map(([k, v]) => [k, [...(v ?? [])]]),
    ) as BuildSlots,
  };
}

export function slotsOf(build: Build, category: PartCategoryId): string[] {
  return build.slots[category] ?? [];
}

export function addPart(build: Build, partId: string): Build {
  const part = partById[partId];
  if (!part) return build;
  const next = cloneBuild(build);
  next.slots[part.category] = [...slotsOf(build, part.category), partId];
  return next;
}

export function addParts(build: Build, partId: string, qty: number): Build {
  let next = build;
  for (let i = 0; i < qty; i += 1) next = addPart(next, partId);
  return next;
}

export function removeFromCategory(
  build: Build,
  category: PartCategoryId,
  index: number,
): Build {
  const next = cloneBuild(build);
  const list = [...slotsOf(build, category)];
  if (index < 0 || index >= list.length) return build;
  list.splice(index, 1);
  if (list.length === 0) delete next.slots[category];
  else next.slots[category] = list;
  return next;
}

export function removePartId(build: Build, partId: string): Build {
  const part = partById[partId];
  if (!part) return build;
  const index = slotsOf(build, part.category).lastIndexOf(partId);
  if (index === -1) return build;
  return removeFromCategory(build, part.category, index);
}

export function clearCategory(
  build: Build,
  category: PartCategoryId,
): Build {
  const next = cloneBuild(build);
  delete next.slots[category];
  return next;
}

export function clearBuild(build: Build): Build {
  return cloneBuild({ ...build, slots: {} });
}

export function setCategory(
  build: Build,
  category: PartCategoryId,
  ids: string[],
): Build {
  const next = cloneBuild(build);
  if (ids.length === 0) delete next.slots[category];
  else next.slots[category] = ids;
  return next;
}

/** One entry per physical module, in category build order. */
export function expandParts(build: Build): Part[] {
  return categories.flatMap((category) =>
    slotsOf(build, category.id)
      .map((id) => partById[id])
      .filter((p): p is Part => Boolean(p)),
  );
}

export function countParts(build: Build): number {
  return Object.values(build.slots).reduce(
    (total, list) => total + (list?.length ?? 0),
    0,
  );
}

export function countByCategory(build: Build): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const category of categories) {
    counts[category.id] = slotsOf(build, category.id).length;
  }
  return counts;
}

export function totalMass(build: Build): number {
  return expandParts(build).reduce((sum, part) => sum + part.mass, 0);
}

export function inventorySlots(build: Build): number {
  return expandParts(build).reduce((sum, part) => sum + part.cargoSlots, 0);
}

export function reactorModules(build: Build): number {
  return slotsOf(build, "reactor").length;
}

export function computeStats(build: Build): StatTotals {
  const totals = {
    damage: 0,
    shield: 0,
    maneuver: 0,
    hyperdrive: 0,
    cargo: 0,
  };
  for (const part of expandParts(build)) {
    for (const stat of STAT_IDS) totals[stat] += part.stats[stat];
  }
  const ratings = Object.fromEntries(
    STAT_IDS.map((stat) => [
      stat,
      Math.max(
        0,
        Math.min(100, Math.round((totals[stat] / STAT_REFS[stat]) * 100)),
      ),
    ]),
  ) as Record<StatId, number>;

  return { totals, ratings, profile: classifyBuild(build, ratings) };
}

export function classifyBuild(
  build: Build,
  ratings?: Record<StatId, number>,
): string[] {
  const r = ratings ?? computeStats(build).ratings;
  const count = countParts(build);
  const labels: string[] = [];
  if (r.damage >= 55) labels.push("Combat Heavy");
  if (r.shield >= 50) labels.push("Shield Tank");
  if (r.maneuver >= 60) labels.push("Sleek Flyer");
  if (r.hyperdrive >= 50) labels.push("Deep-Space Explorer");
  if (r.cargo >= 55) labels.push("Heavy Hauler");
  if (count >= 60) labels.push("Massive Hull");
  if (count > 0 && count <= 20) labels.push("Minimalist Frame");
  return labels;
}

export function requirementStatus(build: Build): RequirementStatus[] {
  return requirements.map((requirement) => {
    const have = slotsOf(build, requirement.categoryId).length;
    return {
      requirement,
      category: categoryById[requirement.categoryId],
      have,
      met: have >= requirement.min,
      legacyMet: have >= requirement.legacyMin,
    };
  });
}

export function isSpaceworthy(build: Build): boolean {
  return requirementStatus(build).every((status) => status.met);
}

export interface ShoppingEntry {
  part: Part;
  qty: number;
  lineTotal: number;
}

export interface ShoppingGroup {
  category: (typeof categories)[number];
  entries: ShoppingEntry[];
}

export interface CostBreakdown {
  total: number;
  buyable: number;
  salvage: number;
  perCategory: Record<string, number>;
}

export function costBreakdown(build: Build): CostBreakdown {
  let total = 0;
  let buyable = 0;
  let salvage = 0;
  const perCategory: Record<string, number> = {};
  for (const part of expandParts(build)) {
    total += part.price;
    if (part.buyable) buyable += part.price;
    else salvage += part.price;
    perCategory[part.category] = (perCategory[part.category] ?? 0) + part.price;
  }
  return { total, buyable, salvage, perCategory };
}

export function shoppingList(build: Build): ShoppingGroup[] {
  return categories
    .map((category) => {
      const counts = new Map<string, number>();
      for (const id of slotsOf(build, category.id)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const entries: ShoppingEntry[] = [...counts.entries()]
        .map(([id, qty]) => {
          const part = partById[id];
          return { part, qty, lineTotal: part.price * qty };
        })
        .sort((a, b) => b.qty - a.qty || b.lineTotal - a.lineTotal);
      return { category, entries };
    })
    .filter((group) => group.entries.length > 0);
}

export function buildFromBlueprint(blueprint: Blueprint): Build {
  const slots: BuildSlots = {};
  for (const ref of blueprint.parts) {
    if (ref.optional) continue;
    const part = partById[ref.id];
    if (!part) continue;
    slots[part.category] = [...(slots[part.category] ?? [])];
    for (let i = 0; i < ref.qty; i += 1) {
      (slots[part.category] as string[]).push(ref.id);
    }
  }
  return createBuild({
    name: blueprint.name,
    designation: blueprint.designation,
    slots,
    origin: "blueprint",
    blueprintId: blueprint.id,
  });
}

export function partsBySource(build: Build): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of expandParts(build)) {
    for (const source of part.sources) {
      out[source] = (out[source] ?? 0) + 1;
    }
  }
  return out;
}

/** Plain-text/markdown version of the shopping list, for clipboard + export. */
export function buildToMarkdown(
  build: Build,
  options: { withCosts?: boolean } = { withCosts: true },
): string {
  const groups = shoppingList(build);
  const cost = costBreakdown(build);
  const stats = computeStats(build);
  const lines: string[] = [];
  lines.push(`# ${build.name}`);
  if (build.designation) lines.push(`_${build.designation}_`);
  lines.push("");
  lines.push(
    `Modules: ${countParts(build)}/${meta.maxParts} | Inventory: +${inventorySlots(build)} slots | Mass: ${totalMass(build)}t`,
  );
  if (options.withCosts) {
    lines.push(
      `Cost: ${formatUnits(cost.total)} Units (${formatUnits(cost.buyable)} at the Workshop + ${formatUnits(cost.salvage)} salvage value) + ${meta.naniteUpgradeCtoS.toLocaleString()} Nanites for C->S`,
    );
  }
  lines.push(
    `Ratings: ${STAT_IDS.map((s) => `${s} ${stats.ratings[s]}`).join(" | ")}`,
  );
  lines.push("");
  for (const group of groups) {
    lines.push(`## ${group.category.label}`);
    for (const entry of group.entries) {
      const cost = options.withCosts
        ? ` - ${formatUnits(entry.lineTotal)} Units`
        : "";
      const where = entry.part.buyable ? "Workshop" : "Salvage/Trade";
      lines.push(
        `- [ ] ${entry.qty}x ${entry.part.name} (${where})${cost}${entry.part.notes ? ` - ${entry.part.notes}` : ""}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function formatUnits(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toLocaleString();
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export function allParts(): Part[] {
  return parts;
}
