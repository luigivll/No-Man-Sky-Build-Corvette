export type StatId = "damage" | "shield" | "maneuver" | "hyperdrive" | "cargo";
export type RoleId = "combat" | "exploration" | "massive" | "minimalist";

export type PartCategoryId =
  | "cockpit"
  | "reactor"
  | "habitation"
  | "access"
  | "wing"
  | "weapon"
  | "shield"
  | "engine-main"
  | "engine-light"
  | "landing";

export type PartStats = Record<StatId, number>;

export type Rarity = "common" | "uncommon" | "rare" | "exotic";

export interface Part {
  /** real game asset backing this module, e.g. "B_COK_A" (see public/models) */
  assetId?: string;
  id: string;
  name: string;
  category: PartCategoryId;
  manufacturer: string;
  /** In-game Vendor price for purchasable modules, estimated market value otherwise. */
  price: number;
  buyable: boolean;
  sources: string[];
  rarity: Rarity;
  mass: number;
  cargoSlots: number;
  techSlots: number;
  stats: PartStats;
  roles: RoleId[];
  tags: string[];
  notes: string;
  geometry: { mount: string; span: number; profile: string };
}

export interface PartCategory {
  id: PartCategoryId;
  label: string;
  singular: string;
  icon: string;
  buildOrder: number;
  accent: string;
  note: string;
}

export interface Requirement {
  categoryId: PartCategoryId;
  min: number;
  legacyMin: number;
  note: string;
}

export interface StatDefinition {
  id: StatId;
  label: string;
  icon: string;
  blurb: string;
}

export interface PartsMeta {
  dataset: string;
  gameVersion: string;
  patchNote: string;
  lastVerified: string;
  maxParts: number;
  softPartCap: number;
  maxReactorModules: number;
  maxRecommendedFloors: number;
  starterShipCost: number;
  naniteUpgradeCtoS: number;
  firstUpgradeNanites: number;
  workshopLocation: string;
  workshopOptions: string[];
  salvageSources: string[];
  adjacencyNote: string;
  priceDisclaimer: string;
  sources: string[];
}

export interface PartsDatabase {
  meta: PartsMeta;
  stats: StatDefinition[];
  requirements: Requirement[];
  categories: PartCategory[];
  parts: Part[];
}

export interface BlueprintPartRef {
  id: string;
  qty: number;
  note?: string;
  optional?: boolean;
}

export interface Blueprint {
  id: string;
  slug: string;
  name: string;
  designation: string;
  franchise: string;
  classification: string;
  role: string;
  difficulty: "C" | "B" | "A" | "S";
  accent: string;
  accent2: string;
  blurb: string;
  signatureLine: string;
  parts: BlueprintPartRef[];
  buildTips: string[];
  /** hull family this ship is meant to be rendered in (sentinel, solar, ...) */
  style?: string;
}

export interface BlueprintsFile {
  meta: {
    title: string;
    subtitle: string;
    disclaimer: string;
    costNote: string;
    naniteNote: string;
  };
  blueprints: Blueprint[];
}

/** A build is simply the list of part ids placed in each category slot. */
export type BuildSlots = Partial<Record<PartCategoryId, string[]>>;

export interface Build {
  id: string;
  name: string;
  createdAt: number;
  slots: BuildSlots;
  roles: RoleId[];
  origin: "manual" | "randomizer" | "blueprint";
  blueprintId?: string;
  seed?: number;
  designation?: string;
  rationale?: string[];
  /** hull family ids; more than one means a fused hull */
  styleIds?: string[];
}

export interface StatTotals {
  totals: PartStats;
  ratings: Record<StatId, number>;
  profile: string[];
}

export interface RequirementStatus {
  requirement: Requirement;
  category: PartCategory;
  have: number;
  met: boolean;
  legacyMet: boolean;
}
