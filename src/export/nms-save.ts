import type { AssemblyDocument, AssemblyResult, PartDef, Placement } from "@/domain/types";
import { PART_BY_ID } from "@/domain/parts";
import { getIds } from "./part-ids";
import { UNIT_TO_METRES } from "@/domain/constants";

/**
 * NMS Save Editor (GoatFungus) exporter.
 *
 * A corvette is two things at once: a *ship* (stats, name, inventory seed) and a
 * *base* (the actual module layout, stored under `PersistentPlayerBases`). The
 * editor's ship import/export only handles the first half, so the reliable
 * workflow — the one the community uses — is:
 *
 *   1. Build a throwaway corvette in-game and name it something findable.
 *   2. Open the save in the editor, `Edit ▸ Edit raw JSON`.
 *   3. Paste `playerShipBase.Objects` from this file over the `Objects` array of
 *      that corvette's entry in `BaseContext ▸ PlayerStateData ▸ PersistentPlayerBases`.
 *   4. Optionally paste `inventory` over `PlayerStateData ▸ CorvetteStorageInventory`
 *      (or your exosuit `Inventory`) to receive the modules as items.
 *   5. Save the file, launch, and finalise the design at the Corvette Workshop.
 *
 * Everything below is plain JSON matching the save's own shape, so it survives a
 * round trip through the editor's raw JSON pane.
 */

export interface NmsTransform {
  rot: { x: number; y: number; z: number; w: number };
  pos: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export interface NmsBaseObject {
  ObjectId: string;
  Name: string;
  Type: "Decoration" | "Normal";
  RegionId: number;
  Transform: NmsTransform;
  BaseBuildingData: {
    IsGroup: boolean;
    GroupId: number;
    ParentGroupId: number;
    PrimaryColour: { x: number; y: number; z: number };
    SecondaryColour: { x: number; y: number; z: number };
  };
  Item: { InventoryId: { x: number; y: number } };
}

export interface NmsInventorySlot {
  Inventory: {
    Type: "Substance" | "Product";
    Id: string;
    Count: number;
    CurrentDamage: number;
  };
  ItemLevelSeed: { x: number; y: number };
}

export interface NmsShipExport {
  $schema: "nms-corvette-shipyard/v1";
  generatedAt: string;
  target: string;
  shipName: string;
  moduleCount: number;
  instructions: string[];
  shipOwnershipEntry: Record<string, unknown>;
  playerShipBase: {
    BaseId: { x: number; y: number };
    Name: string;
    Type: "PlayerShipBase";
    Objects: NmsBaseObject[];
  };
  inventory: {
    Inventory: {
      Slots: NmsInventorySlot[];
      ValidSlotIndices: number[];
      Width: number;
      Height: number;
    };
  };
}

/** Deterministic 64-bit-ish id pair from a string, so exports stay stable. */
function hashPair(input: string): { x: number; y: number } {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    h1 = Math.imul(h1 ^ input.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + input.charCodeAt(i) * (i + 7), 2246822519) >>> 0;
  }
  return { x: h1 >>> 0, y: h2 >>> 0 };
}

function hexToRgb01(hex: string): { x: number; y: number; z: number } {
  const clean = hex.replace("#", "");
  const int = Number.parseInt(clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean, 16);
  const fallback = 0.5;
  if (Number.isNaN(int)) return { x: fallback, y: fallback, z: fallback };
  return {
    x: Math.round((((int >> 16) & 255) / 255) * 1000) / 1000,
    y: Math.round((((int >> 8) & 255) / 255) * 1000) / 1000,
    z: Math.round(((int & 255) / 255) * 1000) / 1000,
  };
}

/** Build-unit transforms → the metres/quaternion form the save uses. */
function toTransform(
  position: { x: number; y: number; z: number },
  matrix: readonly number[],
): NmsTransform {
  const q = quaternionFromMatrix(matrix);
  return {
    rot: { x: q.x, y: q.y, z: q.z, w: q.w },
    pos: {
      x: round(position.x * UNIT_TO_METRES),
      y: round(position.y * UNIT_TO_METRES),
      z: round(position.z * UNIT_TO_METRES),
    },
    scale: { x: 1, y: 1, z: 1 },
  };
}

function quaternionFromMatrix(m: readonly number[]): { x: number; y: number; z: number; w: number } {
  const m00 = m[0] ?? 1;
  const m11 = m[5] ?? 1;
  const m22 = m[10] ?? 1;
  const trace = m00 + m11 + m22;
  let x = 0;
  let y = 0;
  let z = 0;
  let w = 1;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = ((m[6] ?? 0) - (m[9] ?? 0)) / s;
    y = ((m[8] ?? 0) - (m[2] ?? 0)) / s;
    z = ((m[1] ?? 0) - (m[4] ?? 0)) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = ((m[6] ?? 0) - (m[9] ?? 0)) / s;
    x = 0.25 * s;
    y = ((m[4] ?? 0) + (m[1] ?? 0)) / s;
    z = ((m[8] ?? 0) + (m[2] ?? 0)) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = ((m[8] ?? 0) - (m[2] ?? 0)) / s;
    x = ((m[4] ?? 0) + (m[1] ?? 0)) / s;
    y = 0.25 * s;
    z = ((m[9] ?? 0) + (m[6] ?? 0)) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = ((m[1] ?? 0) - (m[4] ?? 0)) / s;
    x = ((m[8] ?? 0) + (m[2] ?? 0)) / s;
    y = ((m[9] ?? 0) + (m[6] ?? 0)) / s;
    z = 0.25 * s;
  }

  const len = Math.hypot(x, y, z, w) || 1;
  return { x: roundQ(x / len), y: roundQ(y / len), z: roundQ(z / len), w: roundQ(w / len) };
}

const round = (value: number): number => Math.round(value * 10000) / 10000;
/** Quaternions need more precision than positions or they stop being unit length. */
const roundQ = (value: number): number => Math.round(value * 1e7) / 1e7;

export const INSTRUCTIONS: readonly string[] = [
  "Back up your save folder before touching anything.",
  "In-game, build a throwaway corvette and give it a name you can search for.",
  "Sit in the pilot seat and stand up again so the game writes the corvette base to disk.",
  "Open the save in NMS Save Editor ▸ Edit ▸ Edit raw JSON.",
  "Expand BaseContext ▸ PlayerStateData ▸ PersistentPlayerBases and find your corvette by name.",
  "Paste the Objects array from this file over that entry's Objects array.",
  "Optional: paste the inventory block over PlayerStateData ▸ CorvetteStorageInventory to receive the modules.",
  "Save the file, load the game, and finalise the design at the Corvette Workshop.",
];

export function buildBaseObjects(
  document: AssemblyDocument,
  assembly: AssemblyResult,
): NmsBaseObject[] {
  const palette = document.palette;
  const primary = hexToRgb01(palette.primary);
  const secondary = hexToRgb01(palette.secondary);

  return assembly.parts.map((part) => {
    const ids = getIds(part.part);
    return {
      ObjectId: ids.objectId,
      Name: part.part.name,
      Type: part.part.category === "decoration" ? "Decoration" : "Normal",
      RegionId: 0,
      Transform: toTransform(part.position, part.matrix),
      BaseBuildingData: {
        IsGroup: false,
        GroupId: 0,
        ParentGroupId: 0,
        PrimaryColour: primary,
        SecondaryColour: secondary,
      },
      Item: { InventoryId: hashPair(part.placement.id) },
    };
  });
}

/** Shopping list: how many of each module the build needs. */
export function shoppingList(placements: readonly Placement[], parts: ReadonlyMap<string, PartDef>) {
  const counts = new Map<string, number>();
  for (const placement of placements) {
    counts.set(placement.partId, (counts.get(placement.partId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([partId, count]) => ({ part: parts.get(partId)!, count }))
    .filter((entry) => entry.part !== undefined)
    .sort((a, b) => b.count - a.count || a.part.name.localeCompare(b.part.name));
}

export function buildShipExport(document: AssemblyDocument, assembly: AssemblyResult): NmsShipExport {
  const objects = buildBaseObjects(document, assembly);
  const list = shoppingList(document.placements, PART_BY_ID);

  const slots: NmsInventorySlot[] = [];
  const validIndices: number[] = [];
  list.forEach((entry, index) => {
    const ids = getIds(entry.part);
    validIndices.push(index);
    slots.push({
      Inventory: {
        Type: "Product",
        Id: ids.itemId,
        Count: entry.count,
        CurrentDamage: 0,
      },
      ItemLevelSeed: hashPair(`${entry.part.id}:${entry.count}`),
    });
  });

  return {
    $schema: "nms-corvette-shipyard/v1",
    generatedAt: new Date().toISOString(),
    target: "NMSSaveEditor (GoatFungus) — Edit ▸ Edit raw JSON",
    shipName: document.name,
    moduleCount: objects.length,
    instructions: [...INSTRUCTIONS],
    shipOwnershipEntry: {
      Name: { Value: document.name },
      SpacecraftClass: { Value: "CORVETTE" },
      Class: { Value: assembly.stats.bestClass },
      Seed: hashPair(document.name),
      TotalInventorySlots: 16 + assembly.stats.cargoSlots,
    },
    playerShipBase: {
      BaseId: hashPair(document.name),
      Name: document.name,
      Type: "PlayerShipBase",
      Objects: objects,
    },
    inventory: {
      Inventory: {
        Slots: slots,
        ValidSlotIndices: validIndices,
        Width: 10,
        Height: 12,
      },
    },
  };
}

/** Inventory-only export: just the modules, no hull layout. */
export function buildInventoryExport(document: AssemblyDocument): {
  $schema: "nms-corvette-shipyard/inventory/v1";
  generatedAt: string;
  shipName: string;
  target: string;
  Inventory: NmsInventorySlot[];
  ValidSlotIndices: number[];
} {
  const list = shoppingList(document.placements, PART_BY_ID);
  return {
    $schema: "nms-corvette-shipyard/inventory/v1",
    generatedAt: new Date().toISOString(),
    shipName: document.name,
    target: "Paste over PlayerStateData ▸ CorvetteStorageInventory ▸ Inventory",
    Inventory: list.map((entry) => ({
      Inventory: {
        Type: "Product",
        Id: getIds(entry.part).itemId,
        Count: entry.count,
        CurrentDamage: 0,
      },
      ItemLevelSeed: hashPair(`${entry.part.id}:${entry.count}`),
    })),
    ValidSlotIndices: list.map((_, index) => index),
  };
}
