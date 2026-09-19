import partsJson from "../../data/parts.json";
import blueprintsJson from "../../data/blueprints.json";
import type {
  Blueprint,
  BlueprintsFile,
  Part,
  PartCategory,
  PartCategoryId,
  PartsDatabase,
  Requirement,
  StatDefinition,
} from "./types";

export const database = partsJson as unknown as PartsDatabase;
export const blueprintsFile = blueprintsJson as unknown as BlueprintsFile;

export const meta = database.meta;
export const categories: PartCategory[] = [...database.categories].sort(
  (a, b) => a.buildOrder - b.buildOrder,
);
export const requirements: Requirement[] = database.requirements;
export const statDefinitions: StatDefinition[] = database.stats;
export const parts: Part[] = database.parts;
export const blueprints: Blueprint[] = blueprintsFile.blueprints;

export const categoryById: Record<string, PartCategory> = Object.fromEntries(
  categories.map((c) => [c.id, c]),
);

export const partById: Record<string, Part> = Object.fromEntries(
  parts.map((p) => [p.id, p]),
);

export const partsByCategory: Record<PartCategoryId, Part[]> = categories.reduce(
  (acc, category) => {
    acc[category.id] = parts.filter((p) => p.category === category.id);
    return acc;
  },
  {} as Record<PartCategoryId, Part[]>,
);

export function blueprintBySlug(slug: string): Blueprint | undefined {
  return blueprints.find((b) => b.slug === slug || b.id === slug);
}

export function getPart(id: string): Part | undefined {
  return partById[id];
}

export function requirePart(id: string): Part {
  const part = partById[id];
  if (!part) throw new Error(`Unknown Corvette part id: ${id}`);
  return part;
}

export const rarityLabels: Record<string, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  exotic: "Exotic",
};

export const sourceLabels: Record<string, string> = {
  workshop: "Workshop vendor",
  salvage: "Planetary salvage",
  derelict: "Derelict freighter",
  pirates: "Pirate drops",
  trade: "Module trade-in",
};
