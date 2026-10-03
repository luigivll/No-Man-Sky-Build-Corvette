import { describe, expect, it } from "vitest";
import { assemble } from "@/engine/assembly";
import { expandBlueprint } from "@/engine/blueprint";
import { buildShoppingList, buildSteps, buildPdfPayload } from "./payload";
import { buildInventoryExport, buildShipExport } from "../nms-save";
import { getIds } from "../part-ids";
import { getBlueprint } from "@/data/blueprints";
import { getPart, PARTS } from "@/domain/parts";
import { UNIT_TO_METRES } from "@/domain/constants";

const blueprint = getBlueprint("x-wing");
const document = {
  version: 1 as const,
  name: blueprint.name,
  palette: blueprint.palette,
  placements: expandBlueprint(blueprint),
};
const assembly = assemble(document);

describe("PDF payload builder", () => {
  it("aggregates the shopping list by part and multiplies the cost", () => {
    const rows = buildShoppingList(document);
    const cannons = rows.find((row) => row.partId === "photon-cannon-array");
    expect(cannons?.count).toBe(4);
    expect(cannons?.cost).toBe((getPart("photon-cannon-array").price ?? 0) * 4);
    expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(document.placements.length);
  });

  it("sorts the shopping list by quantity then name", () => {
    const rows = buildShoppingList(document);
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1]!;
      const next = rows[i]!;
      expect(prev.count >= next.count).toBe(true);
    }
  });

  it("emits one assembly step per module in breadth-first order", () => {
    const steps = buildSteps(assembly);
    expect(steps).toHaveLength(assembly.parts.length);
    expect(steps[0]!.detail).toContain("empty bay");
    // A child can never appear before the parent it snaps to.
    const order = new Map(steps.map((step, index) => [step.id, index]));
    for (const part of assembly.parts) {
      if (part.placement.parentId === null) continue;
      expect(order.get(part.placement.id)!).toBeGreaterThan(order.get(part.placement.parentId!)!);
    }
  });

  it("converts build units to metres in the step detail", () => {
    const steps = buildSteps(assembly);
    const root = assembly.parts.find((part) => part.placement.parentId === null)!;
    const step = steps.find((entry) => entry.id === root.placement.id)!;
    expect(step.detail).toContain(`${(root.position.y * UNIT_TO_METRES).toFixed(1)} m up`);
  });

  it("assembles a complete printable payload", () => {
    const payload = buildPdfPayload(document, assembly, "data:image/png;base64,AAAA", ["WARNING: test"]);
    expect(payload.title).toBe("T-65 X-Wing");
    expect(payload.stats).toHaveLength(6);
    expect(payload.palette).toHaveLength(6);
    expect(payload.render).toBe("data:image/png;base64,AAAA");
    expect(payload.warnings).toEqual(["WARNING: test"]);
    expect(payload.shopping.length).toBeGreaterThan(0);
    expect(payload.steps.length).toBe(assembly.parts.length);
  });
});

describe("NMS Save Editor exporter", () => {
  it("maps every module to an ObjectId and a game-space transform", () => {
    const exported = buildShipExport(document, assembly);
    expect(exported.playerShipBase.Objects).toHaveLength(assembly.parts.length);
    for (const object of exported.playerShipBase.Objects) {
      expect(object.ObjectId).toMatch(/^BIG_[A-Z0-9_]+$/);
      expect(object.Transform.pos).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) });
      const { x, y, z, w } = object.Transform.rot;
      expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 5);
    }
  });

  it("converts build units to metres", () => {
    const exported = buildShipExport(document, assembly);
    const root = assembly.parts.find((part) => part.placement.parentId === null)!;
    const object = exported.playerShipBase.Objects.find((entry) => entry.Name === root.part.name)!;
    expect(object.Transform.pos.x).toBeCloseTo(root.position.x * UNIT_TO_METRES, 4);
  });

  it("keeps the identity rotation for an unrotated module", () => {
    const exported = buildShipExport(document, assembly);
    const root = assembly.parts.find((part) => part.placement.parentId === null)!;
    const object = exported.playerShipBase.Objects.find((entry) => entry.Name === root.part.name)!;
    expect(object.Transform.rot.w).toBeCloseTo(1, 4);
    expect(object.Transform.rot.x).toBeCloseTo(0, 4);
  });

  it("produces a stable output for the same input", () => {
    const a = buildShipExport(document, assembly);
    const b = buildShipExport(document, assembly);
    expect(a.playerShipBase.Objects).toEqual(b.playerShipBase.Objects);
    expect(a.inventory.Inventory.Slots).toEqual(b.inventory.Inventory.Slots);
  });

  it("collapses the shopping list into inventory slots with correct counts", () => {
    const exported = buildShipExport(document, assembly);
    const slots = exported.inventory.Inventory.Slots;
    expect(slots.reduce((sum, slot) => sum + slot.Inventory.Count, 0)).toBe(document.placements.length);
    const cannonSlot = slots.find((slot) => slot.Inventory.Id === getPart("photon-cannon-array").sceneId);
    expect(cannonSlot?.Inventory.Count).toBe(4);
    expect(exported.inventory.Inventory.ValidSlotIndices).toHaveLength(slots.length);
  });

  it("exports an inventory-only payload with the right schema marker", () => {
    const exported = buildInventoryExport(document);
    expect(exported.$schema).toBe("nms-corvette-shipyard/inventory/v1");
    expect(exported.target).toContain("CorvetteStorageInventory");
    expect(exported.Inventory.length).toBeGreaterThan(0);
  });

  it("carries the paste instructions the workflow needs", () => {
    const exported = buildShipExport(document, assembly);
    expect(exported.instructions.length).toBeGreaterThanOrEqual(6);
    expect(exported.instructions.join(" ")).toContain("PersistentPlayerBases");
  });

  it("has an id mapping for every part in the catalogue", () => {
    for (const part of PARTS) {
      const ids = getIds(part);
      expect(ids.objectId.length, part.id).toBeGreaterThan(0);
      expect(ids.itemId.length, part.id).toBeGreaterThan(0);
    }
  });
});
