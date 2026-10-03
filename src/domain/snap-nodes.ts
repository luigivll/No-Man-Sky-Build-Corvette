import type { NodeDirection, NodeKind, PartCategory, SnapNode, Vec3 } from "./types";
import { DEG, vec } from "./vec";

/**
 * Snap-node factory.
 *
 * Every part in the catalogue gets its connection points generated from its
 * bounding box plus a small set of overrides. Two families exist:
 *
 *  - `module` nodes keep the child upright and aligned with the parent, which
 *    is how the game chains habitation modules, walkways and cockpits.
 *  - `hardpoint` nodes rotate the child so its forward axis points along the
 *    surface normal — weapons, engines, foils, plating and landing gear.
 *
 * Nodes carry an `outward` normal; the assembler pushes children along it by
 * half of their own extent, which is what guarantees flush, non-floating fits
 * regardless of the child's size.
 */

export const MODULE_ACCEPTS: readonly PartCategory[] = [
  "cockpit",
  "habitation",
  "walkway",
  "landingBay",
  "landingGear",
  "reactor",
  "engine",
  "thruster",
  "weapon",
  "cargo",
  "plating",
  "shield",
  "decoration",
] as const;

/**
 * Hardpoints are surface mounts, so the workshop lets essentially any module
 * bolt onto a face. The constraints that actually matter (one cockpit, the
 * flight minimum) are enforced by the rules engine instead of here.
 */
export const HARDPOINT_ACCEPTS: readonly PartCategory[] = [
  "cockpit",
  "habitation",
  "walkway",
  "landingBay",
  "landingGear",
  "reactor",
  "engine",
  "thruster",
  "weapon",
  "wing",
  "cargo",
  "plating",
  "shield",
  "decoration",
];

/** Unit outward normal of each module face. */
export const MODULE_NORMAL: Record<NodeDirection, Vec3> = {
  front: vec(0, 0, 1),
  rear: vec(0, 0, -1),
  port: vec(-1, 0, 0),
  starboard: vec(1, 0, 0),
  top: vec(0, 1, 0),
  bottom: vec(0, -1, 0),
};

/** Axis along which siblings sharing a module face are spread apart. */
export const MODULE_SPREAD: Record<NodeDirection, Vec3> = {
  front: vec(1, 0, 0),
  rear: vec(1, 0, 0),
  port: vec(0, 0, 1),
  starboard: vec(0, 0, 1),
  top: vec(1, 0, 0),
  bottom: vec(1, 0, 0),
};

/**
 * Euler angles (YXZ, radians) applied to a child snapped to a hardpoint, so
 * the child's local +Z ends up pointing along the surface normal.
 */
export const ROT: Record<NodeDirection, Vec3> = {
  front: vec(0, 0, 0),
  rear: vec(0, 180 * DEG, 0),
  port: vec(0, -90 * DEG, 0),
  starboard: vec(0, 90 * DEG, 0),
  top: vec(-90 * DEG, 0, 0),
  bottom: vec(90 * DEG, 0, 0),
};

/** Per-node tweak: patch fields, drop the node, or replace it outright. */
export interface NodeOverrides {
  omit?: boolean;
  patch?: Partial<SnapNode>;
  node?: SnapNode;
}

export interface NodeOptions {
  /** Default capacity for both families. */
  slots?: number;
  /** Default spacing for both families. */
  spacing?: number;
  /** Module faces only. */
  module?: boolean;
  moduleSlots?: number;
  moduleSpacing?: number;
  moduleAccepts?: readonly PartCategory[];
  /** Hardpoints only. */
  hardpoint?: boolean;
  hardpointSlots?: number;
  hardpointSpacing?: number;
  hardpointAccepts?: readonly PartCategory[];
  /** Per-node overrides keyed by node id. */
  overrides?: Partial<Record<string, NodeOverrides>>;
}

function applyOverrides(nodes: SnapNode[], overrides: NodeOptions["overrides"]): SnapNode[] {
  if (!overrides) return nodes;
  const out: SnapNode[] = [];
  const consumed = new Set<string>();

  for (const node of nodes) {
    const rule: NodeOverrides | undefined = overrides[node.id];
    if (!rule) {
      out.push(node);
      continue;
    }
    consumed.add(node.id);
    if (rule.omit) continue;
    out.push(rule.node ?? { ...node, ...rule.patch });
  }

  for (const [id, rule] of Object.entries(overrides)) {
    if (!rule || consumed.has(id) || !rule.node) continue;
    out.push(rule.node);
  }
  return out;
}

/** Builds the six module faces of a box of `size`. */
export function moduleNodes(
  size: Vec3,
  options: NodeOptions = {},
): SnapNode[] {
  const slots = options.slots ?? 1;
  const spacing = options.spacing ?? Math.max(size.x, size.z) * 0.6;
  const accepts = options.moduleAccepts ?? MODULE_ACCEPTS;
  const hw = size.x / 2;
  const hh = size.y / 2;
  const hd = size.z / 2;

  const positions: Record<NodeDirection, Vec3> = {
    front: vec(0, 0, hd),
    rear: vec(0, 0, -hd),
    port: vec(-hw, 0, 0),
    starboard: vec(hw, 0, 0),
    top: vec(0, hh, 0),
    bottom: vec(0, -hh, 0),
  };

  /**
   * Module nodes never rotate the child. Chaining `rear` → `rear` therefore keeps
   * growing the spine backwards instead of flipping every other module around,
   * and a deck placed on a flank stays parallel to the one it came from. Use the
   * placement's own `rotation` when you deliberately want a turned module.
   */
  const nodes: SnapNode[] = (Object.keys(positions) as NodeDirection[]).map((direction) => ({
    id: direction,
    direction,
    kind: "module" satisfies NodeKind,
    position: positions[direction]!,
    outward: MODULE_NORMAL[direction]!,
    rotation: vec(0, 0, 0),
    accepts,
    slots,
    spread: MODULE_SPREAD[direction]!,
    spacing,
  }));

  return applyOverrides(nodes, options.overrides);
}

/**
 * Default capacity per hardpoint. Broad faces accept a matched pair (twin
 * landing gear, twin engines, twin turrets) while the flanks stay single so a
 * part does not accidentally sprout four nacelles.
 */
const HARDPOINT_SLOTS: Record<NodeDirection, number> = {
  front: 1,
  rear: 2,
  port: 1,
  starboard: 1,
  top: 2,
  bottom: 2,
};

/** Builds the six outward-facing hardpoints of a box of `size`. */
export function hardpointNodes(
  size: Vec3,
  options: NodeOptions = {},
): SnapNode[] {
  const accepts = options.hardpointAccepts ?? HARDPOINT_ACCEPTS;
  const hw = size.x / 2;
  const hh = size.y / 2;
  const hd = size.z / 2;

  const geometry: Record<NodeDirection, { position: Vec3; outward: Vec3; spread: Vec3; spacing: number }> = {
    front: { position: vec(0, 0, hd), outward: vec(0, 0, 1), spread: vec(1, 0, 0), spacing: size.x * 0.6 },
    rear: { position: vec(0, 0, -hd), outward: vec(0, 0, -1), spread: vec(1, 0, 0), spacing: Math.max(1.8, size.x * 0.62) },
    port: { position: vec(-hw, 0, 0), outward: vec(-1, 0, 0), spread: vec(0, 0, 1), spacing: size.z * 0.6 },
    starboard: { position: vec(hw, 0, 0), outward: vec(1, 0, 0), spread: vec(0, 0, 1), spacing: size.z * 0.6 },
    top: { position: vec(0, hh, 0), outward: vec(0, 1, 0), spread: vec(0, 0, 1), spacing: Math.max(1.6, size.z * 0.62) },
    bottom: { position: vec(0, -hh, 0), outward: vec(0, -1, 0), spread: vec(1, 0, 0), spacing: Math.max(1.8, size.x * 0.62) },
  };

  const nodes: SnapNode[] = (Object.keys(geometry) as NodeDirection[]).map((direction) => {
    const g = geometry[direction]!;
    return {
      id: `hp-${direction}`,
      direction,
      kind: "hardpoint" satisfies NodeKind,
      position: g.position,
      outward: g.outward,
      rotation: ROT[direction]!,
      accepts,
      slots: options.slots ?? HARDPOINT_SLOTS[direction]!,
      spread: g.spread,
      spacing: options.spacing ?? g.spacing,
    };
  });

  return applyOverrides(nodes, options.overrides);
}

/**
 * Convenience: both families. Module and hardpoint capacities are tuned
 * independently because a deck wants a single room per face while its hard
 * points want room for a matched pair.
 */
export function allNodes(size: Vec3, options: NodeOptions = {}): SnapNode[] {
  const overrides = options.overrides;
  return [
    ...(options.module === false
      ? []
      : moduleNodes(size, {
          slots: options.moduleSlots ?? options.slots,
          spacing: options.moduleSpacing ?? options.spacing,
          moduleAccepts: options.moduleAccepts,
          overrides,
        })),
    ...(options.hardpoint === false
      ? []
      : hardpointNodes(size, {
          slots: options.hardpointSlots ?? options.slots,
          spacing: options.hardpointSpacing ?? options.spacing,
          hardpointAccepts: options.hardpointAccepts,
          overrides,
        })),
  ];
}

export const findNode = (part: { nodes: readonly SnapNode[] }, id: string): SnapNode | undefined =>
  part.nodes.find((node) => node.id === id);
