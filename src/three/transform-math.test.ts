import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { assemble } from "@/engine/assembly";
import { expandBlueprint } from "@/engine/blueprint";
import { getBlueprint } from "@/data/blueprints";
import { findNode } from "@/domain/snap-nodes";
import { IDENTITY_BASIS, basisToEuler, type Basis } from "@/domain/vec";
import type { AssemblyDocument, Vec3 } from "@/domain/types";
import {
  basisFromQuaternion,
  handleBasisFromRotation,
  offsetFromDrag,
  quaternionFromBasis,
  rotationFromHandle,
} from "./transform-math";

const document = (): AssemblyDocument => {
  const blueprint = getBlueprint("x-wing");
  return {
    version: 1,
    name: blueprint.name,
    palette: blueprint.palette,
    placements: expandBlueprint(blueprint),
  };
};

/** Everything the gizmo needs to know about the module it is driving. */
function frameFor(assembly: ReturnType<typeof assemble>, placementId: string) {
  const part = assembly.parts.find((entry) => entry.placement.id === placementId)!;
  const parentId = part.placement.parentId;
  const parent = parentId ? assembly.parts.find((entry) => entry.placement.id === parentId) : undefined;
  const node =
    parent && part.placement.node ? findNode(parent.part, part.placement.node) : undefined;
  return {
    part,
    parentBasis: parent?.basis ?? IDENTITY_BASIS,
    nodeRotation: node?.rotation ?? { x: 0, y: 0, z: 0 },
  };
}

describe("gizmo drag → offset projection", () => {
  it("lands the module exactly where the handle was dragged", () => {
    const doc = document();
    const before = assemble(doc);
    // A non-root module on a rotated parent: the S-foil, yawed off the spine.
    const target = before.parts.find((part) => part.part.category === "wing")!;
    const frame = frameFor(before, target.placement.id);

    // The user drags the gizmo to an arbitrary point in hull space.
    const handlePosition: Vec3 = { x: 3.25, y: -1.4, z: 2.1 };
    const delta: Vec3 = {
      x: handlePosition.x - target.position.x,
      y: handlePosition.y - target.position.y,
      z: handlePosition.z - target.position.z,
    };

    const offset = offsetFromDrag(frame.parentBasis, delta, target.placement.offset ?? { x: 0, y: 0, z: 0 });

    const after = assemble({
      ...doc,
      placements: doc.placements.map((placement) =>
        placement.id === target.placement.id ? { ...placement, offset } : placement,
      ),
    });
    const moved = after.parts.find((part) => part.placement.id === target.placement.id)!;

    expect(moved.position.x).toBeCloseTo(handlePosition.x, 6);
    expect(moved.position.y).toBeCloseTo(handlePosition.y, 6);
    expect(moved.position.z).toBeCloseTo(handlePosition.z, 6);
  });

  it("works on the root module, whose parent frame is the identity", () => {
    const doc = document();
    const before = assemble(doc);
    const root = before.parts.find((part) => part.placement.parentId === null)!;
    const frame = frameFor(before, root.placement.id);
    expect(frame.parentBasis).toEqual(IDENTITY_BASIS);

    const handlePosition: Vec3 = { x: 1.5, y: 4, z: -2 };
    const delta: Vec3 = {
      x: handlePosition.x - root.position.x,
      y: handlePosition.y - root.position.y,
      z: handlePosition.z - root.position.z,
    };
    const offset = offsetFromDrag(frame.parentBasis, delta, root.placement.offset ?? { x: 0, y: 0, z: 0 });

    const after = assemble({
      ...doc,
      placements: doc.placements.map((placement) =>
        placement.id === root.placement.id ? { ...placement, offset } : placement,
      ),
    });
    const moved = after.parts.find((part) => part.placement.id === root.placement.id)!;
    expect(moved.position).toMatchObject(handlePosition);
  });

  it("drags the whole branch along with the module", () => {
    const doc = document();
    const before = assemble(doc);
    const hab = before.parts.find((part) => part.part.category === "habitation")!;
    const child = before.parts.find((part) => part.placement.parentId === hab.placement.id)!;
    const relative = {
      x: child.position.x - hab.position.x,
      y: child.position.y - hab.position.y,
      z: child.position.z - hab.position.z,
    };

    const offset = offsetFromDrag(frameFor(before, hab.placement.id).parentBasis, { x: 2, y: 0, z: 0 }, hab.placement.offset ?? { x: 0, y: 0, z: 0 });
    const after = assemble({
      ...doc,
      placements: doc.placements.map((placement) =>
        placement.id === hab.placement.id ? { ...placement, offset } : placement,
      ),
    });
    const movedHab = after.parts.find((part) => part.placement.id === hab.placement.id)!;
    const movedChild = after.parts.find((part) => part.placement.id === child.placement.id)!;

    expect(movedHab.position.x).toBeCloseTo(hab.position.x + 2, 6);
    expect(movedChild.position.x - movedHab.position.x).toBeCloseTo(relative.x, 6);
    expect(movedChild.position.y - movedHab.position.y).toBeCloseTo(relative.y, 6);
  });
});

describe("gizmo rotation → placement rotation projection", () => {
  it("reproduces the orientation the rings were dragged to", () => {
    const doc = document();
    const before = assemble(doc);
    const target = before.parts.find((part) => part.part.category === "wing")!;
    const frame = frameFor(before, target.placement.id);

    // Aim the module 37° yaw / -22° pitch / 11° roll in hull space.
    const desired = new THREE.Quaternion().setFromEuler(
      new THREE.Euler((-22 * Math.PI) / 180, (37 * Math.PI) / 180, (11 * Math.PI) / 180, "YXZ"),
    );
    const handleBasis = basisFromQuaternion(desired);

    const rotation = rotationFromHandle(frame.parentBasis, handleBasis, frame.nodeRotation);

    const after = assemble({
      ...doc,
      placements: doc.placements.map((placement) =>
        placement.id === target.placement.id ? { ...placement, rotation } : placement,
      ),
    });
    const moved = after.parts.find((part) => part.placement.id === target.placement.id)!;

    for (let axis = 0; axis < 3; axis += 1) {
      expect(moved.basis[axis]!.x).toBeCloseTo(handleBasis[axis]!.x, 6);
      expect(moved.basis[axis]!.y).toBeCloseTo(handleBasis[axis]!.y, 6);
      expect(moved.basis[axis]!.z).toBeCloseTo(handleBasis[axis]!.z, 6);
    }
  });

  it("is the exact inverse of the solver's own rotation composition", () => {
    const doc = document();
    const assembly = assemble(doc);
    for (const part of assembly.parts) {
      const frame = frameFor(assembly, part.placement.id);
      const stored = part.placement.rotation ?? { x: 0, y: 0, z: 0 };

      const implied = handleBasisFromRotation(frame.parentBasis, frame.nodeRotation, stored);
      const recovered = rotationFromHandle(frame.parentBasis, implied, frame.nodeRotation);

      // Euler round-trips can differ by a full turn or a gimbal flip, so
      // compare the resulting frames rather than the raw angles.
      const rebuilt = handleBasisFromRotation(frame.parentBasis, frame.nodeRotation, recovered);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(rebuilt[axis]!.x).toBeCloseTo(implied[axis]!.x, 5);
        expect(rebuilt[axis]!.y).toBeCloseTo(implied[axis]!.y, 5);
        expect(rebuilt[axis]!.z).toBeCloseTo(implied[axis]!.z, 5);
      }
    }
  });

  it("keeps a module with no placement rotation aligned to its snap node", () => {
    const doc = document();
    const assembly = assemble(doc);
    const plain = assembly.parts.find(
      (part) => part.placement.parentId !== null && !part.placement.rotation,
    )!;
    const frame = frameFor(assembly, plain.placement.id);

    const implied = handleBasisFromRotation(frame.parentBasis, frame.nodeRotation, { x: 0, y: 0, z: 0 });
    const rotation = rotationFromHandle(frame.parentBasis, implied, frame.nodeRotation);

    expect(Math.abs(rotation.x)).toBeLessThan(1e-6);
    expect(Math.abs(rotation.y)).toBeLessThan(1e-6);
    expect(Math.abs(rotation.z)).toBeLessThan(1e-6);
  });
});

describe("quaternion / basis bridging", () => {
  it("survives a round trip through three.js", () => {
    const basis: Basis = [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 1, z: 0 },
    ];
    const recovered = basisFromQuaternion(quaternionFromBasis(basis));
    for (let axis = 0; axis < 3; axis += 1) {
      expect(recovered[axis]!.x).toBeCloseTo(basis[axis]!.x, 10);
      expect(recovered[axis]!.y).toBeCloseTo(basis[axis]!.y, 10);
      expect(recovered[axis]!.z).toBeCloseTo(basis[axis]!.z, 10);
    }
  });

  it("agrees with the domain layer's euler convention", () => {
    const euler: Vec3 = { x: 0.4, y: -1.1, z: 2.3 };
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(euler.x, euler.y, euler.z, "YXZ"),
    );
    expect(basisToEuler(basisFromQuaternion(quaternion)).y).toBeCloseTo(euler.y, 6);
  });
});
