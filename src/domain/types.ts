/**
 * Core domain types for the NMS Corvette Shipyard.
 *
 * The whole application — 3D preview, validation, the fusion generator, the
 * PDF manual and the NMS Save Editor exporter — is expressed in terms of these
 * types. Nothing in `domain/` imports React or three, which keeps the rules
 * engine testable in plain Node.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Part categories, mirroring the Corvette Workshop console grouping.
 * `wing` / `plating` / `cargo` / `decoration` are structural decoration and are
 * never required for flight.
 */
export type PartCategory =
  | "cockpit"
  | "habitation"
  | "walkway"
  | "landingBay"
  | "landingGear"
  | "reactor"
  | "thruster"
  | "engine"
  | "shield"
  | "weapon"
  | "wing"
  | "plating"
  | "cargo"
  | "decoration";

/** Categories that a corvette must contain at least one of to be finalised. */
export const FLIGHT_CRITICAL: readonly PartCategory[] = [
  "cockpit",
  "habitation",
  "landingBay",
  "landingGear",
  "reactor",
  "thruster",
  "weapon",
] as const;

export type PartClass = "S" | "A" | "B" | "C";

export type AcquisitionKind = "starter" | "trade" | "salvage";

export type DesignStyle =
  | "titan"
  | "ambassador"
  | "thunderbird"
  | "arcadia"
  | "rockhopper"
  | "argonaut"
  | "albatross"
  | "supercruise"
  | "hardframe"
  | "generic";

export type NodeDirection = "front" | "rear" | "port" | "starboard" | "top" | "bottom";

export type NodeKind = "module" | "hardpoint";

export interface SnapNode {
  /** Stable, human readable id — unique within the part. */
  id: string;
  direction: NodeDirection;
  /**
   * `module` nodes keep the child upright and aligned with the parent (rooms,
   * corridors). `hardpoint` nodes align the child's forward axis with the
   * outward surface normal (weapons, engines, foils, plating).
   */
  kind: NodeKind;
  /** Position of the node in the parent part's local space (build units). */
  position: Vec3;
  /**
   * Unit surface normal of the node in the parent's local space. Children are
   * pushed along this vector by half of their own extent so that they always
   * sit flush against the parent instead of floating or intersecting it.
   */
  outward: Vec3;
  /** Euler angles (radians) applied to a child attached to this node. */
  rotation: Vec3;
  /** Categories allowed to snap here. */
  accepts: readonly PartCategory[];
  /** How many children may share this node before it reports as full. */
  slots: number;
  /** Local axis children are distributed along when several share the node. */
  spread: Vec3;
  /** Distance between siblings sharing the node. */
  spacing: number;
}

export interface PartDef {
  id: string;
  name: string;
  category: PartCategory;
  style: DesignStyle;
  /**
   * Identifier of the procedural mesh builder used when no extracted GLB is
   * available for `sceneId`. See `src/three/procedural/builders.ts`.
   */
  archetype: string;
  /** Bounding box of the part in build units: x = width, y = height, z = depth. */
  size: Vec3;
  sceneId: string;
  itemId: string;
  class: PartClass;
  acquisition: AcquisitionKind;
  /** Workshop price in Units, or `null` when the part cannot be purchased. */
  price: number | null;
  mass: number;
  /** Positive = supplies power, negative = draws power. */
  power: number;
  shield: number;
  weapon: number;
  /** Cargo slots granted (habitation +3, walkway +1). */
  cargoSlots: number;
  /** Contribution to sublight speed / manoeuvrability. */
  speed: number;
  manoeuvre: number;
  boost: number;
  /** Free-form tags consumed by the fusion generator. */
  tags: readonly string[];
  nodes: readonly SnapNode[];
  /** Per-role material defaults used by the renderer. */
  finish?: PartFinish;
  blurb?: string;
}

export interface PartFinish {
  metalness?: number;
  roughness?: number;
  /** Detail density 0..1 drives the greeble count of procedural meshes. */
  detail?: number;
  emissiveIntensity?: number;
}

/* ------------------------------------------------------------------ */
/* Paint                                                               */
/* ------------------------------------------------------------------ */

export type PaintRole = "primary" | "secondary" | "accent" | "trim" | "glass" | "emissive";

export const PAINT_ROLES: readonly PaintRole[] = [
  "primary",
  "secondary",
  "accent",
  "trim",
  "glass",
  "emissive",
] as const;

export interface Palette {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  trim: string;
  glass: string;
  emissive: string;
  /** 0..1 weathering: raises roughness and adds grime to procedural meshes. */
  wear: number;
}

export interface PaintOverride {
  color?: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

/* ------------------------------------------------------------------ */
/* Placement / assembly                                                */
/* ------------------------------------------------------------------ */

export interface Placement {
  /** Stable instance id (never reused across an assembly). */
  id: string;
  partId: string;
  /** Instance id of the parent placement, or `null` for the root part. */
  parentId: string | null;
  /** Snap node id on the parent, or `null` for the root part. */
  node: string | null;
  /** Extra offset applied after snapping (build units, parent-local). */
  offset?: Vec3;
  /** Extra euler rotation in degrees, applied after the node rotation. */
  rotation?: Vec3;
  /** Paint role this instance borrows from the active palette. */
  role?: PaintRole;
  /** Direct material overrides, they win over the palette role. */
  paint?: Partial<Record<PaintRole, PaintOverride>>;
  hidden?: boolean;
}

export interface AssemblyDocument {
  version: 1;
  name: string;
  author?: string;
  palette: Palette;
  placements: Placement[];
  createdAt?: string;
}

import type { AABB } from "./vec";

export type { AABB };

export interface FreeNode {
  placementId: string;
  node: SnapNode;
  occupied: number;
}

export interface AssembledPart {
  placement: Placement;
  part: PartDef;
  /** World position of the part origin. */
  position: Vec3;
  /** World euler angles (radians, YXZ). */
  rotation: Vec3;
  /** World-space local axes (columns of the rotation matrix). */
  basis: import("./vec").Basis;
  /** Column-major 4x4 world matrix. */
  matrix: readonly number[];
  bounds: AABB;
  /** Distance from the root of the snap tree. */
  depth: number;
  /** 0-based vertical storey derived from world Y. */
  floor: number;
  /** Sibling index within its snap node (drives symmetric distribution). */
  siblingIndex: number;
  siblingCount: number;
}

export interface CollisionPair {
  a: string;
  b: string;
  penetration: number;
}

export interface ShipStats {
  partCount: number;
  floors: number;
  height: number;
  length: number;
  width: number;
  mass: number;
  powerSupply: number;
  powerDraw: number;
  shield: number;
  weapon: number;
  cargoSlots: number;
  speed: number;
  manoeuvre: number;
  boost: number;
  estimatedCost: number;
  bestClass: PartClass;
}

export interface ValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  placementIds?: string[];
}

export interface ValidationResult {
  flyable: boolean;
  issues: ValidationIssue[];
  missing: PartCategory[];
  counts: Partial<Record<PartCategory, number>>;
}

export interface AssemblyResult {
  parts: AssembledPart[];
  bounds: AABB;
  stats: ShipStats;
  freeNodes: FreeNode[];
  orphans: string[];
  collisions: CollisionPair[];
  /** Placement ids that could not be resolved (unknown part / broken link). */
  unresolved: string[];
}

/* ------------------------------------------------------------------ */
/* Blueprints                                                          */
/* ------------------------------------------------------------------ */

/**
 * Compact authoring form used by the Badass Hangar catalogue. It is expanded to
 * `Placement[]` by `expandBlueprint` using the `key` references.
 */
export interface BlueprintNodeSpec {
  /** Local key, referenced by children as `"<key>:<nodeId>"`. */
  key: string;
  /** Part id from the catalogue. */
  part: string;
  /** `"<parentKey>:<nodeId>"`, or `null` for the root part. */
  at: string | null;
  role?: PaintRole;
  /** Extra euler rotation in degrees. */
  rot?: Vec3;
  /** Extra offset in build units. */
  off?: Vec3;
}

export interface Blueprint {
  id: string;
  name: string;
  /** Franchise label shown on the hangar card, e.g. "Star Wars". */
  franchise: string;
  group: BlueprintGroup;
  tagline: string;
  notes: string;
  palette: Palette;
  build: BlueprintNodeSpec[];
  /** Preferred orbit distance for the hangar preview camera. */
  cameraDistance?: number;
}

export type BlueprintGroup =
  | "star-wars"
  | "marvel"
  | "dc"
  | "classic-scifi"
  | "anime"
  | "videogames";

export const BLUEPRINT_GROUPS: readonly BlueprintGroup[] = [
  "star-wars",
  "marvel",
  "dc",
  "classic-scifi",
  "anime",
  "videogames",
] as const;

/* ------------------------------------------------------------------ */
/* Fusion generator                                                    */
/* ------------------------------------------------------------------ */

export type DesignTag =
  | "combat-heavy"
  | "sleek-explorer"
  | "gunship"
  | "cargo-hauler"
  | "interceptor"
  | "industrial";

export type DesignBase = "sentinel" | "exotic" | "normal" | "hybrid";

export interface GeneratorOptions {
  tag: DesignTag;
  base: DesignBase;
  /** Deterministic seed — the same seed always yields the same corvette. */
  seed: number;
  /** Target part count, clamped to the hard 160-part cap. */
  complexity: number;
  symmetrical: boolean;
  palette: Palette;
}

export interface GeneratorResult {
  placements: Placement[];
  options: GeneratorOptions;
}

/* ------------------------------------------------------------------ */
/* NMS Save Editor interop                                             */
/* ------------------------------------------------------------------ */

export interface NmsIdMapping {
  /** Base-building object id used inside `PersistentPlayerBases[].Objects`. */
  objectId: string;
  /** Inventory item id used by the save editor's inventory editor. */
  itemId: string;
  /** `true` once cross-checked against a real save / the mod's item.mbin. */
  verified: boolean;
}
