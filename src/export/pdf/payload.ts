import type { AssemblyDocument, AssemblyResult, AssembledPart } from "@/domain/types";
import { CATEGORY_META, UNIT_TO_METRES } from "@/domain/constants";
import { PART_BY_ID } from "@/domain/parts";
import type { BlueprintPdfProps } from "./blueprint-pdf";

/**
 * Pure transformation from a solved assembly into the data the PDF needs.
 * Lives outside the React-PDF component so it can be unit-tested in Node.
 */

export interface ShoppingRow {
  partId: string;
  name: string;
  category: string;
  partClass: string;
  count: number;
  cost: number;
}

export interface StepRow {
  id: string;
  title: string;
  detail: string;
}

const NODE_LABEL: Record<string, string> = {
  front: "to the FRONT face",
  rear: "to the REAR face",
  top: "on TOP",
  bottom: "UNDERNEATH",
  port: "on the PORT (left) face",
  starboard: "on the STARBOARD (right) face",
  "hp-front": "on the forward hardpoint",
  "hp-rear": "on the aft hardpoint",
  "hp-top": "on the dorsal hardpoint",
  "hp-bottom": "on the ventral hardpoint",
  "hp-port": "on the port hardpoint",
  "hp-starboard": "on the starboard hardpoint",
};

export function buildShoppingList(document: AssemblyDocument): ShoppingRow[] {
  const counts = new Map<string, number>();
  for (const placement of document.placements) {
    counts.set(placement.partId, (counts.get(placement.partId) ?? 0) + 1);
  }
  const rows: ShoppingRow[] = [];
  for (const [partId, count] of counts) {
    const part = PART_BY_ID.get(partId);
    if (!part) continue;
    rows.push({
      partId,
      name: part.name,
      category: CATEGORY_META[part.category].label,
      partClass: part.class,
      count,
      cost: (part.price ?? 0) * count,
    });
  }
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Assembly order. Breadth-first from the root of the snap tree, which is
 * exactly the order you have to place things in-game: you cannot snap a module
 * to a parent that is not there yet.
 */
export function buildSteps(assembly: AssemblyResult): StepRow[] {
  const byId = new Map<string, AssembledPart>(assembly.parts.map((part) => [part.placement.id, part]));
  const ordered: AssembledPart[] = [];
  const roots = assembly.parts.filter((part) => part.placement.parentId === null);
  const queue = [...roots];

  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    const children = assembly.parts
      .filter((part) => part.placement.parentId === current.placement.id)
      .sort((a, b) => a.placement.id.localeCompare(b.placement.id));
    queue.push(...children);
  }

  for (const part of assembly.parts) {
    if (!ordered.includes(part)) ordered.push(part);
  }

  return ordered.map((part) => {
    const parent = part.placement.parentId ? byId.get(part.placement.parentId) : undefined;
    const nodeLabel = part.placement.node ? (NODE_LABEL[part.placement.node] ?? `at “${part.placement.node}”`) : "on the build pad";
    const position = `${part.position.x.toFixed(1)}, ${part.position.y.toFixed(1)}, ${part.position.z.toFixed(1)}`;
    const rotation = part.placement.rotation
      ? ` rotated ${Object.entries(part.placement.rotation)
          .filter(([, value]) => value !== 0)
          .map(([axis, value]) => `${value}° about ${axis.toUpperCase()}`)
          .join(", ")}`
      : "";
    const offset = part.placement.offset
      ? ` offset ${part.placement.offset.x.toFixed(1)}/${part.placement.offset.y.toFixed(1)}/${part.placement.offset.z.toFixed(1)}`
      : "";

    return {
      id: part.placement.id,
      title: `${part.part.name} × ${part.siblingCount > 1 ? `${part.siblingIndex + 1} of ${part.siblingCount}` : "1"}`,
      detail: `Snap ${nodeLabel} of ${parent ? parent.part.name : "the empty bay"} · storey ${part.floor + 1} · local ${position}u (${(part.position.y * UNIT_TO_METRES).toFixed(1)} m up)${rotation}${offset}`,
    } satisfies StepRow;
  });
}

export function buildPdfPayload(
  document: AssemblyDocument,
  assembly: AssemblyResult,
  screenshot: string | null,
  warnings: string[],
): BlueprintPdfProps {
  const stats = assembly.stats;
  return {
    title: document.name,
    subtitle: `${stats.partCount} modules · ${stats.floors} storey${stats.floors === 1 ? "" : "s"} · class ${stats.bestClass}${document.author ? ` · ${document.author}` : ""}`,
    render: screenshot,
    stats: [
      { label: "Modules", value: `${stats.partCount}/160` },
      { label: "Storeys", value: `${stats.floors}` },
      { label: "Length", value: `${(stats.length * UNIT_TO_METRES).toFixed(1)} m` },
      { label: "Cargo", value: `${stats.cargoSlots}` },
      { label: "Shield", value: `${Math.round(stats.shield)}` },
      { label: "Weapons", value: `${Math.round(stats.weapon)}` },
    ],
    palette: [
      { label: "Primary", color: document.palette.primary },
      { label: "Secondary", color: document.palette.secondary },
      { label: "Accent", color: document.palette.accent },
      { label: "Trim", color: document.palette.trim },
      { label: "Glass", color: document.palette.glass },
      { label: "Emissive", color: document.palette.emissive },
    ],
    shopping: buildShoppingList(document),
    steps: buildSteps(assembly),
    totalCost: stats.estimatedCost,
    warnings,
  };
}
