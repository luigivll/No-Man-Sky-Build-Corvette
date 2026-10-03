import type { Blueprint, BlueprintNodeSpec, Palette, Placement } from "@/domain/types";
import { stableId } from "@/lib/id";
import { PART_BY_ID } from "@/domain/parts";

/**
 * Expands the compact hangar authoring form into real placements.
 *
 * Keys are resolved depth-first in declaration order, so a parent must always
 * be declared before its children. Ids are deterministic (`blueprintId·key`),
 * which keeps exported blueprints, snapshots and tests stable.
 */
export function expandBlueprint(blueprint: Blueprint): Placement[] {
  const keyToId = new Map<string, string>();
  const placements: Placement[] = [];

  for (const spec of blueprint.build) {
    if (keyToId.has(spec.key)) {
      throw new Error(`Blueprint "${blueprint.id}" declares duplicate key "${spec.key}"`);
    }
    const { parentId, node } = resolveParent(spec.at, keyToId, blueprint.id);
    const id = stableId(blueprint.id, spec.key);
    keyToId.set(spec.key, id);

    placements.push({
      id,
      partId: spec.part,
      parentId,
      node,
      offset: spec.off,
      rotation: spec.rot,
      role: spec.role,
    });
  }

  return placements;
}

function resolveParent(
  at: string | null,
  keyToId: Map<string, string>,
  blueprintId: string,
): { parentId: string | null; node: string | null } {
  if (!at) return { parentId: null, node: null };
  const separator = at.indexOf(":");
  const key = separator === -1 ? at : at.slice(0, separator);
  const node = separator === -1 ? null : at.slice(separator + 1);
  const parentId = keyToId.get(key);
  if (!parentId) {
    throw new Error(`Blueprint "${blueprintId}" references unknown parent key "${key}"`);
  }
  return { parentId, node: node || null };
}

/** Asserts that a blueprint only references parts and nodes that exist. */
export function validateBlueprintShape(blueprint: Blueprint): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const partByKey = new Map<string, string>();

  for (const spec of blueprint.build) {
    if (keys.has(spec.key)) problems.push(`${blueprint.id}: duplicate key "${spec.key}"`);
    keys.add(spec.key);

    const part = PART_BY_ID.get(spec.part);
    if (!part) {
      problems.push(`${blueprint.id}: unknown part "${spec.part}"`);
      continue;
    }
    partByKey.set(spec.key, spec.part);

    if (spec.at) {
      const separator = spec.at.indexOf(":");
      const key = separator === -1 ? spec.at : spec.at.slice(0, separator);
      const node = separator === -1 ? "" : spec.at.slice(separator + 1);
      if (!keys.has(key)) {
        problems.push(`${blueprint.id}: "${spec.key}" references undeclared parent "${key}"`);
        continue;
      }
      if (node) {
        const parentPart = PART_BY_ID.get(partByKey.get(key)!);
        if (parentPart && !parentPart.nodes.some((candidate) => candidate.id === node)) {
          problems.push(
            `${blueprint.id}: parent "${parentPart.name}" (${key}) has no snap node "${node}"`,
          );
        }
        if (parentPart && !parentPart.nodes.some((candidate) => candidate.id === node && candidate.accepts.includes(part.category))) {
          problems.push(
            `${blueprint.id}: node "${node}" on "${parentPart.name}" does not accept ${part.category} parts`,
          );
        }
      }
    } else if (spec !== blueprint.build[0]) {
      problems.push(`${blueprint.id}: "${spec.key}" has no parent but is not the first part`);
    }
  }

  if (blueprint.build.length === 0) problems.push(`${blueprint.id}: blueprint is empty`);
  return problems;
}

/** Builds a blank document around a set of placements. */
export function toPlacementsWithPalette(
  placements: readonly Placement[],
  palette: Palette,
): { placements: Placement[]; palette: Palette } {
  return { placements: placements.map((placement) => ({ ...placement })), palette: { ...palette } };
}

export type { BlueprintNodeSpec };
