import type { NmsIdMapping, PartDef } from "@/domain/types";
import { PARTS } from "@/domain/parts";

/**
 * NMS internal id mapping.
 *
 * Corvettes are stored as *both* a ship and a base. The module layout lives in
 * `PersistentPlayerBases[].Objects` where each object carries an `ObjectId`
 * matching the in-game scene-node name, while the parts themselves are
 * inventory items with their own id.
 *
 * The `objectId` column below follows the scene-node naming used by the ship
 * parts themselves (`BIG_COK1X2_A`, `BIG_TRU1X1_C`, ...). Those that were read
 * straight off the game's part icons/meshes are flagged `verified`; the rest are
 * inferred from the same convention and should be confirmed against your own
 * save before you rely on them.
 *
 * You can override any entry from the UI (Export ▸ Edit id mapping) or by
 * loading a JSON file of `{ partId: { objectId, itemId, verified } }`.
 */

const VERIFIED_SCENE_IDS = new Set<string>([
  "BIG_COK1X2_A",
  "BIG_COK1X2_D",
  "BIG_HAB1X2_A",
  "BIG_HAB1X2_B",
  "BIG_HAB1X2_C",
  "BIG_HAB1X1_A",
  "BIG_HAB1X1_B",
  "BIG_HAB1X1_C",
  "BIG_ALK1X1_A",
  "BIG_ALK1X1_B",
  "BIG_ALK1X1_C",
  "BIG_LND1X1_A",
  "BIG_LND1X1_B",
  "BIG_LND1X1_C",
  "BIG_WNG1X2_A",
  "BIG_WNG1X2_B",
  "BIG_WNG1X2_C",
  "BIG_WNG1X2_D",
  "BIG_WNG1X2_E",
  "BIG_WNG1X2_F",
  "BIG_WNG1X2_G",
  "BIG_WNG1X2_H",
  "BIG_WNG1X2_I",
  "BIG_WNG1X2_J",
  "BIG_WNG1X2_K",
  "BIG_WNG1X2_L",
  "BIG_WNG1X2_M",
  "BIG_WNG1X2_N",
  "BIG_WNG1X2_O_0",
  "BIG_WNG1X2_O_1",
  "BIG_WNG1X2_O_2",
  "BIG_TRU1X1_A",
  "BIG_TRU1X1_B",
  "BIG_TRU1X1_C",
  "BIG_TRU1X1_D",
  "BIG_TRU1X1_G",
  "BIG_TRU1X1_H",
  "BIG_SHL1X1_A",
  "BIG_SHL1X1_B",
  "BIG_SHL1X1_C",
  "BIG_SHL1X1_D",
  "BIG_TUR1X1_A",
  "BIG_TUR1X1_C",
  "BIG_TUR1X1_D",
  "BIG_TUR1X1_E",
  "BIG_GEN1X1_0",
  "BIG_GEN1X1_1",
  "BIG_GEN1X1_2",
  "BIG_GEN1X1_3",
  "BIG_STR1X1_K_N",
  "BIG_STR1X1_L_N",
  "BIG_STR1X1_K_NE",
  "BIG_DECO1X1_I",
]);

const DEFAULT_TABLE: ReadonlyMap<string, NmsIdMapping> = new Map(
  PARTS.map((part) => [
    part.id,
    {
      objectId: part.sceneId,
      itemId: part.sceneId,
      verified: VERIFIED_SCENE_IDS.has(part.sceneId),
    } satisfies NmsIdMapping,
  ]),
);

const STORAGE_KEY = "nms-shipyard:id-overrides";

let overrides: Record<string, NmsIdMapping> = {};

export function loadIdOverrides(): Record<string, NmsIdMapping> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    overrides = raw ? (JSON.parse(raw) as Record<string, NmsIdMapping>) : {};
  } catch {
    overrides = {};
  }
  return overrides;
}

export function saveIdOverrides(next: Record<string, NmsIdMapping>): void {
  overrides = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}

export function getIds(part: PartDef): NmsIdMapping {
  const fallback = DEFAULT_TABLE.get(part.id) ?? {
    objectId: part.sceneId,
    itemId: part.sceneId,
    verified: false,
  };
  const override = overrides[part.id];
  return override ? { ...fallback, ...override } : fallback;
}

export const verifiedCount = (): number =>
  PARTS.filter((part) => getIds(part).verified).length;

export const idTable = (): Array<{ partId: string; name: string } & NmsIdMapping> =>
  PARTS.map((part) => ({ partId: part.id, name: part.name, ...getIds(part) }));
