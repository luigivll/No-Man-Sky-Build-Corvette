import { describe, expect, it } from "vitest";
import { assemble, STOREY_HEIGHT } from "./assembly";
import { DEFAULT_PALETTE } from "@/domain/palettes";
import type { AssemblyDocument, Placement } from "@/domain/types";
import { getPart } from "@/domain/parts";

const doc = (placements: Placement[]): AssemblyDocument => ({
  version: 1,
  name: "Test Corvette",
  palette: DEFAULT_PALETTE,
  placements,
});

describe("assembly solver", () => {
  it("places the root at its own origin with the identity basis", () => {
    const result = assemble(
      doc([{ id: "hab", partId: "titan-hab", parentId: null, node: null }]),
    );
    expect(result.parts).toHaveLength(1);
    const part = result.parts[0]!;
    expect(part.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(part.depth).toBe(0);
    expect(result.bounds.min.z).toBeCloseTo(-1.6);
    expect(result.bounds.max.z).toBeCloseTo(1.6);
  });

  it("attaches a cockpit flush against the front face of a habitation module", () => {
    const hab = getPart("titan-hab");
    const cockpit = getPart("titan-cockpit");
    const result = assemble(
      doc([
        { id: "hab", partId: "titan-hab", parentId: null, node: null },
        { id: "cok", partId: "titan-cockpit", parentId: "hab", node: "front" },
      ]),
    );

    const child = result.parts.find((part) => part.placement.id === "cok")!;
    // Hab front face sits at z = 1.6; the cockpit's half depth is 1.4, so its
    // centre must land at exactly 3.0 — flush, never floating, never sunk in.
    expect(child.position.z).toBeCloseTo(hab.size.z / 2 + cockpit.size.z / 2);
    expect(child.position.x).toBeCloseTo(0);
    expect(child.position.y).toBeCloseTo(0);
    // Faces are touching but the solver must not report that as a collision.
    expect(result.collisions).toHaveLength(0);
  });

  it("keeps a rear-attached module aligned with its parent", () => {
    const result = assemble(
      doc([
        { id: "hab", partId: "titan-hab", parentId: null, node: null },
        { id: "bay", partId: "titan-landing-bay", parentId: "hab", node: "rear" },
      ]),
    );
    const bay = result.parts.find((part) => part.placement.id === "bay")!;
    expect(bay.position.z).toBeCloseTo(-(getPart("titan-hab").size.z / 2 + getPart("titan-landing-bay").size.z / 2));
    // Module nodes never rotate the child, so the ramp keeps facing forwards and
    // the spine keeps growing backwards instead of flipping every other module.
    expect(bay.basis[2]!.z).toBeCloseTo(1);
    expect(bay.rotation.y).toBeCloseTo(0);
  });

  it("mirrors side hardpoints around the hull centre line", () => {
    const result = assemble(
      doc([
        { id: "hab", partId: "titan-hab", parentId: null, node: null },
        { id: "wL", partId: "arcadia-sfoil", parentId: "hab", node: "hp-port" },
        { id: "wR", partId: "arcadia-sfoil", parentId: "hab", node: "hp-starboard" },
      ]),
    );
    const left = result.parts.find((part) => part.placement.id === "wL")!;
    const right = result.parts.find((part) => part.placement.id === "wR")!;
    expect(left.position.x).toBeCloseTo(-right.position.x);
    expect(left.position.x).toBeLessThan(0);
    // The foil's 4.6-unit span runs outward, not fore-aft.
    expect(Math.abs(left.position.x)).toBeGreaterThan(getPart("titan-hab").size.x / 2);
  });

  it("distributes siblings symmetrically across a shared node", () => {
    const result = assemble(
      doc([
        { id: "hab", partId: "titan-hab", parentId: null, node: null },
        { id: "t1", partId: "photon-cannon-array", parentId: "hab", node: "hp-top" },
        { id: "t2", partId: "photon-cannon-array", parentId: "hab", node: "hp-top" },
      ]),
    );
    const t1 = result.parts.find((part) => part.placement.id === "t1")!;
    const t2 = result.parts.find((part) => part.placement.id === "t2")!;
    expect(t1.siblingCount).toBe(2);
    expect(t1.position.z).toBeCloseTo(-t2.position.z);
    expect(Math.abs(t1.position.z - t2.position.z)).toBeGreaterThan(0);
  });

  it("walks the snap tree to arbitrary depth", () => {
    const result = assemble(
      doc([
        { id: "hab", partId: "titan-hab", parentId: null, node: null },
        { id: "wy", partId: "titan-walkway", parentId: "hab", node: "front" },
        { id: "cok", partId: "ambassador-cockpit", parentId: "wy", node: "front" },
      ]),
    );
    const cockpit = result.parts.find((part) => part.placement.id === "cok")!;
    expect(cockpit.depth).toBe(2);
    const walkway = result.parts.find((part) => part.placement.id === "wy")!;
    expect(cockpit.position.z).toBeGreaterThan(walkway.position.z);
    expect(result.orphans).toHaveLength(0);
  });

  it("reports detached placements as orphans", () => {
    const result = assemble(
      doc([
        { id: "hab", partId: "titan-hab", parentId: null, node: null },
        { id: "ghost", partId: "titan-walkway", parentId: "nope", node: "front" },
      ]),
    );
    expect(result.orphans).toEqual(["ghost"]);
    expect(result.parts).toHaveLength(1);
  });

  it("flags placements that point at a snap node the parent does not have", () => {
    const result = assemble(
      doc([
        { id: "hab", partId: "titan-hab", parentId: null, node: null },
        { id: "cok", partId: "titan-cockpit", parentId: "hab", node: "hp-warp" },
      ]),
    );
    expect(result.unresolved).toEqual(["cok"]);
  });

  it("detects intersections between unrelated branches of the snap tree", () => {
    // `b` hangs off `a` and `c` off the root, so neither is an ancestor of the
    // other — a real crossing the builder has to warn about.
    const result = assemble(
      doc([
        { id: "hab", partId: "titan-hab", parentId: null, node: null },
        { id: "a", partId: "titan-hab", parentId: "hab", node: "front" },
        {
          id: "b",
          partId: "titan-hab",
          parentId: "a",
          node: "hp-top",
          offset: { x: 0, y: -2.5, z: -6.4 },
        },
        { id: "c", partId: "titan-hab", parentId: "hab", node: "rear" },
      ]),
    );
    expect(result.collisions.length).toBeGreaterThan(0);
    const pair = result.collisions[0]!;
    expect([pair.a, pair.b].sort()).toEqual(["b", "c"]);
  });

  it("does not report the snap chain itself as a collision", () => {
    // Siblings share a node and are spread apart automatically; a long spine of
    // `rear` nodes is flush by construction. Neither should ever warn.
    const result = assemble(
      doc([
        { id: "hab", partId: "titan-hab", parentId: null, node: null },
        { id: "s1", partId: "titan-hab", parentId: "hab", node: "rear" },
        { id: "s2", partId: "titan-hab", parentId: "s1", node: "rear" },
        { id: "g1", partId: "landing-gear", parentId: "hab", node: "hp-bottom" },
        { id: "g2", partId: "landing-gear", parentId: "hab", node: "hp-bottom" },
      ]),
    );
    expect(result.collisions).toEqual([]);
  });

  it("counts storeys from the vertical position of decks", () => {
    const stacked: Placement[] = [{ id: "a", partId: "titan-hab", parentId: null, node: null }];
    let parent = "a";
    for (let i = 1; i < 3; i += 1) {
      stacked.push({ id: `h${i}`, partId: "titan-hab", parentId: parent, node: "top" });
      parent = `h${i}`;
    }
    const result = assemble(doc(stacked));
    expect(result.stats.floors).toBe(3);
    // Each deck stacks flush on the one below: 1.6 (half deck) + 1.6 (half deck).
    expect(result.parts[2]!.position.y).toBeCloseTo(6.4);
    expect(STOREY_HEIGHT).toBeGreaterThan(0);
  });

  it("exposes free snap nodes for the builder UI", () => {
    const result = assemble(
      doc([{ id: "hab", partId: "titan-hab", parentId: null, node: null }]),
    );
    const ids = result.freeNodes.map((node) => node.node.id);
    expect(ids).toContain("front");
    expect(ids).toContain("hp-top");
    expect(result.freeNodes.every((node) => node.occupied < node.node.slots)).toBe(true);
  });

  it("aggregates stats across the hull", () => {
    const result = assemble(
      doc([
        { id: "hab", partId: "titan-hab", parentId: null, node: null },
        { id: "wy", partId: "titan-walkway", parentId: "hab", node: "front" },
      ]),
    );
    expect(result.stats.partCount).toBe(2);
    expect(result.stats.cargoSlots).toBe(4);
    expect(result.stats.mass).toBeCloseTo(60 + 22);
    expect(result.stats.powerDraw).toBeGreaterThan(0);
  });

  it("excludes hidden placements from the solved assembly", () => {
    const result = assemble(
      doc([
        { id: "hab", partId: "titan-hab", parentId: null, node: null },
        { id: "wy", partId: "titan-walkway", parentId: "hab", node: "front", hidden: true },
      ]),
    );
    expect(result.parts.map((part) => part.placement.id)).toEqual(["hab"]);
  });
});
