import * as THREE from "three";
import type { Vec3 } from "@/domain/types";
import { DEG, basisToEuler, unrotateByBasis, type Basis } from "@/domain/vec";

/**
 * Projection maths for the 3D gizmo.
 *
 * A module's `offset` and `rotation` are not free world transforms — they are
 * relative to the snap node it hangs from, expressed in the *parent's* frame.
 * The gizmo works in world space, so every change has to be pushed back through
 * the parent's basis before it can be stored:
 *
 *   offset    = baseOffset + Rparentᵀ · (handlePos − partPos)
 *   rotation° = (eulerYXZ(Rparentᵀ · Rhandle) − nodeRotation) / DEG
 *
 * The subtraction is component-wise on purpose: the solver composes the child
 * frame as `node.rotation + placement.rotation` before converting to a basis,
 * so subtracting the same way is its exact inverse.
 *
 * Kept free of React and three's scene graph so the round-trip can be tested
 * against the assembly solver directly.
 */

/** Reads the three world-space columns of a quaternion as a Basis. */
export function basisFromQuaternion(quaternion: THREE.Quaternion): Basis {
  const matrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
  const column = new THREE.Vector3();
  const columns: Vec3[] = [];
  for (let index = 0; index < 3; index += 1) {
    column.setFromMatrixColumn(matrix, index);
    columns.push({ x: column.x, y: column.y, z: column.z });
  }
  return columns as unknown as Basis;
}

/** Writes a Basis into a quaternion. */
export function quaternionFromBasis(basis: Basis): THREE.Quaternion {
  const matrix = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(basis[0]!.x, basis[0]!.y, basis[0]!.z),
    new THREE.Vector3(basis[1]!.x, basis[1]!.y, basis[1]!.z),
    new THREE.Vector3(basis[2]!.x, basis[2]!.y, basis[2]!.z),
  );
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

/**
 * Converts a world-space drag delta into the stored local offset.
 * `delta` is `handlePosition − partPosition`, both in hull space.
 */
export function offsetFromDrag(parentBasis: Basis, delta: Vec3, baseOffset: Vec3): Vec3 {
  const local = unrotateByBasis(delta, parentBasis);
  return {
    x: baseOffset.x + local.x,
    y: baseOffset.y + local.y,
    z: baseOffset.z + local.z,
  };
}

/**
 * Converts the gizmo's orientation into the stored local rotation, in degrees.
 * `handleBasis` is the orientation the user dragged the rings to.
 */
export function rotationFromHandle(
  parentBasis: Basis,
  handleBasis: Basis,
  nodeRotation: Vec3,
): Vec3 {
  const localBasis: Basis = [
    unrotateByBasis(handleBasis[0]!, parentBasis),
    unrotateByBasis(handleBasis[1]!, parentBasis),
    unrotateByBasis(handleBasis[2]!, parentBasis),
  ];
  const euler = basisToEuler(localBasis);
  return {
    x: euler.x / DEG - nodeRotation.x / DEG,
    y: euler.y / DEG - nodeRotation.y / DEG,
    z: euler.z / DEG - nodeRotation.z / DEG,
  };
}

/**
 * Inverse of `rotationFromHandle`: the orientation a stored rotation implies.
 *
 * Mind the units — `nodeRotation` comes from the snap-node table in **radians**
 * while `placementRotation` is stored in **degrees**, which is exactly how the
 * solver combines them.
 */
export function handleBasisFromRotation(
  parentBasis: Basis,
  nodeRotation: Vec3,
  placementRotation: Vec3,
): Basis {
  const local = {
    x: nodeRotation.x + placementRotation.x * DEG,
    y: nodeRotation.y + placementRotation.y * DEG,
    z: nodeRotation.z + placementRotation.z * DEG,
  };
  const localBasis = basisFromEuler(local);
  return [
    rotateColumn(localBasis[0]!, parentBasis),
    rotateColumn(localBasis[1]!, parentBasis),
    rotateColumn(localBasis[2]!, parentBasis),
  ];
}

/** Column-major YXZ euler → basis, matching `eulerToBasis` in the domain layer. */
function basisFromEuler(e: Vec3): Basis {
  const cx = Math.cos(e.x);
  const sx = Math.sin(e.x);
  const cy = Math.cos(e.y);
  const sy = Math.sin(e.y);
  const cz = Math.cos(e.z);
  const sz = Math.sin(e.z);
  return [
    { x: cy * cz + sy * sx * sz, y: cx * sz, z: -sy * cz + cy * sx * sz },
    { x: -cy * sz + sy * sx * cz, y: cx * cz, z: sy * sz + cy * sx * cz },
    { x: sy * cx, y: -sx, z: cy * cx },
  ];
}

function rotateColumn(v: Vec3, basis: Basis): Vec3 {
  return {
    x: basis[0]!.x * v.x + basis[1]!.x * v.y + basis[2]!.x * v.z,
    y: basis[0]!.y * v.x + basis[1]!.y * v.y + basis[2]!.y * v.z,
    z: basis[0]!.z * v.x + basis[1]!.z * v.y + basis[2]!.z * v.z,
  };
}
