import type {
  AssembledPart,
  AssemblyDocument,
  AssemblyResult,
  CollisionPair,
  FreeNode,
  PartDef,
  Placement,
  ShipStats,
  Vec3,
} from "@/domain/types";
import { PART_BY_ID } from "@/domain/parts";
import {
  add,
  composeBasis,
  eulerToBasis,
  projectHalf,
  rotateByBasis,
  scale,
  sub,
  toMatrix4,
  unrotateByBasis,
  unionAABB,
  type AABB,
  type Basis,
  type Obb,
} from "@/domain/vec";
import { BUILD_LIMITS } from "@/domain/constants";

/**
 * Assembly solver.
 *
 * The corvette is a tree: every part (except the root) hangs off a snap node of
 * another part. Solving the tree produces, for each placement, a world
 * transform that keeps every module flush against its parent — no floating
 * parts, no overlaps at the seam, regardless of part size.
 *
 *   childCenter = parentCenter + P·(nodePos + outward·extent + spread + offset)
 *   childBasis  = P · R(nodeRot + placementRot)
 *
 * where `extent` is half of the child's own bounding box projected onto the
 * node's outward normal, expressed in the child's local frame.
 */

/** Distance between two habitation decks, in build units. */
export const STOREY_HEIGHT = 3.4;

/**
 * Penetration a pair of modules must exceed before it counts as a collision.
 * The solver works with bounding boxes, which are deliberately generous
 * envelopes around the real (much more detailed) meshes, so a small overlap
 * between two boxes usually means nothing is visibly wrong. ~0.45 units is
 * about 0.7 metres of hull actually passing through another module.
 */
export const COLLISION_TOLERANCE = 0.45;

interface SolvedNode {
  placement: Placement;
  part: PartDef;
  basis: Basis;
  position: Vec3;
  depth: number;
  siblingIndex: number;
  siblingCount: number;
}

export function basisOf(basis: Basis, position: Vec3, size: Vec3): Obb {
  return { center: position, half: scale(size, 0.5), basis };
}

const obbPenetrationOf = (a: Obb, b: Obb): number => {
  const axes: Vec3[] = [];
  for (const box of [a, b]) for (const axis of box.basis) axes.push(axis);
  for (const u of a.basis) {
    for (const v of b.basis) {
      const c = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
      const len = Math.hypot(c.x, c.y, c.z);
      if (len > 1e-6) axes.push({ x: c.x / len, y: c.y / len, z: c.z / len });
    }
  }
  let min = Number.POSITIVE_INFINITY;
  for (const axis of axes) {
    const ra = projectHalf(a.half, axis);
    const rb = projectHalf(b.half, axis);
    const d = Math.abs((b.center.x - a.center.x) * axis.x + (b.center.y - a.center.y) * axis.y + (b.center.z - a.center.z) * axis.z);
    const overlap = ra + rb - d;
    if (overlap <= 0) return 0;
    if (overlap < min) min = overlap;
  }
  return Number.isFinite(min) ? min : 0;
};

/** Axis-aligned envelope of an oriented box. */
const aabbOfObb = (box: Obb): AABB => {
  const rx =
    Math.abs(box.basis[0]!.x) * box.half.x +
    Math.abs(box.basis[1]!.x) * box.half.y +
    Math.abs(box.basis[2]!.x) * box.half.z;
  const ry =
    Math.abs(box.basis[0]!.y) * box.half.x +
    Math.abs(box.basis[1]!.y) * box.half.y +
    Math.abs(box.basis[2]!.y) * box.half.z;
  const rz =
    Math.abs(box.basis[0]!.z) * box.half.x +
    Math.abs(box.basis[1]!.z) * box.half.y +
    Math.abs(box.basis[2]!.z) * box.half.z;
  return {
    min: { x: box.center.x - rx, y: box.center.y - ry, z: box.center.z - rz },
    max: { x: box.center.x + rx, y: box.center.y + ry, z: box.center.z + rz },
  };
};

/** Groups children by the snap node they occupy so siblings can be spread. */
function groupByNode(children: Placement[]): Map<string, Placement[]> {
  const groups = new Map<string, Placement[]>();
  for (const child of children) {
    const key = `${child.parentId}::${child.node ?? "-"}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(child);
    else groups.set(key, [child]);
  }
  return groups;
}

export function assemble(document: AssemblyDocument): AssemblyResult {
  const placements = document.placements.filter((placement) => !placement.hidden);
  const byId = new Map(placements.map((placement) => [placement.id, placement]));
  const childrenOf = new Map<string, Placement[]>();
  const orphans: string[] = [];
  const unresolved: string[] = [];

  const roots: Placement[] = [];

  for (const placement of placements) {
    if (!PART_BY_ID.has(placement.partId)) {
      unresolved.push(placement.id);
      continue;
    }
    if (placement.parentId === null) {
      roots.push(placement);
      continue;
    }
    const parent = byId.get(placement.parentId);
    if (!parent || !PART_BY_ID.has(parent.partId)) {
      orphans.push(placement.id);
      continue;
    }
    const bucket = childrenOf.get(placement.parentId);
    if (bucket) bucket.push(placement);
    else childrenOf.set(placement.parentId, [placement]);
  }

  const root = roots[0];
  if (roots.length > 1) orphans.push(...roots.slice(1).map((placement) => placement.id));

  const solved = new Map<string, SolvedNode>();
  const freeNodes: FreeNode[] = [];

  if (root) {
    const rootPart = PART_BY_ID.get(root.partId)!;
    const rootRotation = root.rotation
      ? {
          x: (root.rotation.x ?? 0) * (Math.PI / 180),
          y: (root.rotation.y ?? 0) * (Math.PI / 180),
          z: (root.rotation.z ?? 0) * (Math.PI / 180),
        }
      : { x: 0, y: 0, z: 0 };

    solved.set(root.id, {
      placement: root,
      part: rootPart,
      basis: eulerToBasis(rootRotation),
      position: root.offset ?? { x: 0, y: 0, z: 0 },
      depth: 0,
      siblingIndex: 0,
      siblingCount: 1,
    });

    const queue = [root.id];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const current = solved.get(currentId)!;
      const children = childrenOf.get(currentId) ?? [];
      const groups = groupByNode(children);

      const occupiedPerNode = new Map<string, number>();

      for (const child of children) {
        const node = current.part.nodes.find((candidate) => candidate.id === child.node);
        if (!node) {
          unresolved.push(child.id);
          continue;
        }
        const childPart = PART_BY_ID.get(child.partId);
        if (!childPart) {
          unresolved.push(child.id);
          continue;
        }

        const siblings = groups.get(`${currentId}::${node.id}`) ?? [];
        const siblingIndex = siblings.findIndex((sibling) => sibling.id === child.id);
        const siblingCount = siblings.length;

        const childRotation = {
          x: node.rotation.x + ((child.rotation?.x ?? 0) * Math.PI) / 180,
          y: node.rotation.y + ((child.rotation?.y ?? 0) * Math.PI) / 180,
          z: node.rotation.z + ((child.rotation?.z ?? 0) * Math.PI) / 180,
        };
        const childBasis = composeBasis(current.basis, eulerToBasis(childRotation));

        // Half extent of the child along the node normal, in the child frame.
        const outwardLocal = unrotateByBasis(node.outward, eulerToBasis(childRotation));
        const extent = projectHalf(scale(childPart.size, 0.5), outwardLocal);

        // Spacing widens automatically so siblings of any size stay clear of
        // each other instead of clipping through their neighbour.
        const spreadLocal = unrotateByBasis(node.spread, eulerToBasis(childRotation));
        const spreadExtent = projectHalf(scale(childPart.size, 0.5), spreadLocal);
        const spacing = Math.max(node.spacing, spreadExtent * 2 + 0.2);
        const spreadAmount = (siblingIndex - (siblingCount - 1) / 2) * spacing;
        const localPos = add(
          add(node.position, scale(node.outward, extent)),
          add(scale(node.spread, spreadAmount), child.offset ?? { x: 0, y: 0, z: 0 }),
        );

        const worldPos = add(current.position, rotateByBasis(localPos, current.basis));

        solved.set(child.id, {
          placement: child,
          part: childPart,
          basis: childBasis,
          position: worldPos,
          depth: current.depth + 1,
          siblingIndex: Math.max(0, siblingIndex),
          siblingCount,
        });

        const used = (occupiedPerNode.get(node.id) ?? 0) + 1;
        occupiedPerNode.set(node.id, used);

        queue.push(child.id);
      }

      for (const node of current.part.nodes) {
        const occupied = occupiedPerNode.get(node.id) ?? 0;
        if (occupied < node.slots) freeNodes.push({ placementId: currentId, node, occupied });
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Bounds, storeys, collisions                                       */
  /* ---------------------------------------------------------------- */

  const assembled: AssembledPart[] = [];
  let bounds: AABB | null = null;

  for (const node of solved.values()) {
    const box = basisOf(node.basis, node.position, node.part.size);
    const aabb = aabbOfObb(box);
    const euler = basisToEulerLocal(node.basis);
    assembled.push({
      placement: node.placement,
      part: node.part,
      position: node.position,
      rotation: euler,
      basis: node.basis,
      matrix: toMatrix4(node.position, node.basis),
      bounds: aabb,
      depth: node.depth,
      floor: storeyIndex(node.position.y),
      siblingIndex: node.siblingIndex,
      siblingCount: node.siblingCount,
    });
    bounds = bounds ? unionAABB(bounds, aabb) : aabb;
  }

  bounds ??= { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };

  /**
   * Two placements are "related" when one is an ancestor of the other or when
   * they are siblings hanging off the same snap node. In both cases the solver
   * already placed them deliberately — flush along the chain, or spread apart
   * across the node — so their bounding boxes touching is not a fault. Only
   * genuinely unrelated branches crossing each other are worth reporting.
   */
  const isRelated = (aId: string, bId: string): boolean => {
    let cursor: string | null | undefined = aId;
    while (cursor) {
      const node = solved.get(cursor);
      if (!node) return false;
      if (node.placement.parentId === bId) return true;
      cursor = node.placement.parentId;
    }
    cursor = bId;
    while (cursor) {
      const node = solved.get(cursor);
      if (!node) return false;
      if (node.placement.parentId === aId) return true;
      cursor = node.placement.parentId;
    }
    const parentA = solved.get(aId)?.placement.parentId ?? null;
    const parentB = solved.get(bId)?.placement.parentId ?? null;
    return parentA !== null && parentA === parentB;
  };

  const collisions: CollisionPair[] = [];
  for (let i = 0; i < assembled.length; i += 1) {
    for (let j = i + 1; j < assembled.length; j += 1) {
      const a = assembled[i]!;
      const b = assembled[j]!;
      if (isRelated(a.placement.id, b.placement.id)) continue;
      const boxA = basisOf(a.basis, a.position, a.part.size);
      const boxB = basisOf(b.basis, b.position, b.part.size);
      const penetration = obbPenetrationOf(boxA, boxB);
      if (penetration > COLLISION_TOLERANCE) {
        collisions.push({ a: a.placement.id, b: b.placement.id, penetration: round(penetration) });
      }
    }
  }

  const stats = computeStats(assembled, bounds);

  return {
    parts: assembled,
    bounds,
    stats,
    freeNodes,
    orphans,
    collisions,
    unresolved,
  };
}

function basisToEulerLocal(basis: Basis): Vec3 {
  const x = Math.asin(Math.max(-1, Math.min(1, -basis[2]!.y)));
  const y = Math.atan2(basis[2]!.x, basis[2]!.z);
  const z = Math.atan2(basis[1]!.y, basis[0]!.y);
  return { x, y, z };
}

export const storeyIndex = (y: number): number => Math.round(y / STOREY_HEIGHT);

const round = (value: number): number => Math.round(value * 1000) / 1000;

const CLASS_RANK = { C: 0, B: 1, A: 2, S: 3 } as const;

export function computeStats(assembled: readonly AssembledPart[], bounds: AABB): ShipStats {
  const counts: Partial<Record<string, number>> = {};
  let mass = 0;
  let powerSupply = 0;
  let powerDraw = 0;
  let shield = 0;
  let weapon = 0;
  let cargoSlots = 0;
  let speed = 0;
  let manoeuvre = 0;
  let boost = 0;
  let estimatedCost = 0;
  let bestRank = 0;
  const storeys = new Set<number>();

  for (const item of assembled) {
    const part = item.part;
    counts[part.category] = (counts[part.category] ?? 0) + 1;
    mass += part.mass;
    if (part.power >= 0) powerSupply += part.power;
    else powerDraw += -part.power;
    shield += part.shield;
    weapon += part.weapon;
    cargoSlots += part.cargoSlots;
    speed += part.speed;
    manoeuvre += part.manoeuvre;
    boost += part.boost;
    estimatedCost += part.price ?? 0;
    bestRank = Math.max(bestRank, CLASS_RANK[part.class]);
    if (part.category === "habitation" || part.category === "walkway") storeys.add(item.floor);
  }

  const size = sub(bounds.max, bounds.min);
  const floors = storeys.size > 0 ? storeys.size : assembled.length > 0 ? 1 : 0;
  const bestClass = (["C", "B", "A", "S"] as const)[Math.min(bestRank, 3)]!;

  return {
    partCount: assembled.length,
    floors,
    height: round(size.y),
    length: round(size.z),
    width: round(size.x),
    mass: round(mass),
    powerSupply: round(powerSupply),
    powerDraw: round(powerDraw),
    shield: round(shield),
    weapon: round(weapon),
    cargoSlots,
    speed: round(speed),
    manoeuvre: round(manoeuvre),
    boost: round(boost),
    estimatedCost,
    bestClass,
  };
}

/** Convenience: assemble a bare placement list with the default palette. */
export function assemblePlacements(
  placements: readonly Placement[],
  document: Pick<AssemblyDocument, "name" | "palette">,
): AssemblyResult {
  return assemble({ version: 1, name: document.name, palette: document.palette, placements: [...placements] });
}

export const isOverPartLimit = (count: number): boolean => count > BUILD_LIMITS.maxParts;
