"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TransformControls } from "@react-three/drei";
import type { AssemblyResult, Vec3 } from "@/domain/types";
import { PART_BY_ID } from "@/domain/parts";
import { findNode } from "@/domain/snap-nodes";
import { IDENTITY_BASIS } from "@/domain/vec";
import { useShipyard } from "@/lib/store";
import {
  basisFromQuaternion,
  offsetFromDrag,
  quaternionFromBasis,
  rotationFromHandle,
} from "./transform-math";

/**
 * 3D manipulation gizmo for the selected module.
 *
 * All the projection maths lives in `./transform-math` so it can be tested
 * against the assembly solver; this component only wires it to the scene graph.
 */

/** Parent frame + the snap node's own rotation, which the placement adds to. */
function frameOf(assembly: AssemblyResult, placementId: string) {
  const part = assembly.parts.find((entry) => entry.placement.id === placementId);
  if (!part) return null;
  const parentId = part.placement.parentId;
  const parent = parentId ? assembly.parts.find((entry) => entry.placement.id === parentId) : undefined;
  const parentPart = parent ? PART_BY_ID.get(parent.part.id) : undefined;
  const node = parentPart && part.placement.node ? findNode(parentPart, part.placement.node) : undefined;
  return {
    part,
    parentBasis: parent?.basis ?? IDENTITY_BASIS,
    nodeRotation: node?.rotation ?? { x: 0, y: 0, z: 0 },
  };
}

export function TransformGizmo({ assembly }: { assembly: AssemblyResult }) {
  const selectedId = useShipyard((state) => state.selectedId);
  const mode = useShipyard((state) => state.transformMode);
  const exploded = useShipyard((state) => state.exploded);
  const setOffset = useShipyard((state) => state.setOffset);
  const setRotation = useShipyard((state) => state.setRotation);
  const beginTransform = useShipyard((state) => state.beginTransform);

  const [handle, setHandle] = useState<THREE.Group | null>(null);
  const dragging = useRef(false);
  const baseOffset = useRef<Vec3>({ x: 0, y: 0, z: 0 });

  const frame = useMemo(
    () => (selectedId ? frameOf(assembly, selectedId) : null),
    [assembly, selectedId],
  );

  /* Keep the handle glued to the module whenever it is not being dragged. */
  useEffect(() => {
    if (!handle || !frame || dragging.current) return;
    handle.position.set(frame.part.position.x, frame.part.position.y, frame.part.position.z);
    const basis = mode === "rotate" ? frame.part.basis : IDENTITY_BASIS;
    handle.quaternion.copy(quaternionFromBasis(basis));
  }, [handle, frame, mode]);

  /*
   * The anchor group must always be in the tree — if it were rendered only when
   * the gizmo is active, the ref callback would never fire and the gizmo could
   * never switch on. Only the controls themselves are conditional.
   */
  const active = frame !== null && mode !== "off" && exploded === 0;

  const handleMouseDown = () => {
    if (!frame) return;
    dragging.current = true;
    baseOffset.current = { ...(frame.part.placement.offset ?? { x: 0, y: 0, z: 0 }) };
    beginTransform();
  };

  const handleMouseUp = () => {
    dragging.current = false;
  };

  const handleChange = () => {
    if (!dragging.current || !handle || !frame) return;
    const placement = frame.part.placement;

    if (mode === "translate") {
      const delta: Vec3 = {
        x: handle.position.x - frame.part.position.x,
        y: handle.position.y - frame.part.position.y,
        z: handle.position.z - frame.part.position.z,
      };
      setOffset(placement.id, offsetFromDrag(frame.parentBasis, delta, baseOffset.current));
      return;
    }

    setRotation(
      placement.id,
      rotationFromHandle(
        frame.parentBasis,
        basisFromQuaternion(handle.quaternion),
        frame.nodeRotation,
      ),
    );
  };

  /**
   * The tree keeps the same shape whether the gizmo is live or not — swapping
   * the root element would unmount the anchor and drop the ref that drives it.
   */
  return (
    <>
      <group ref={setHandle} />
      {active && handle && frame && (
        <>
          <TransformControls
            object={handle}
            mode={mode}
            space={mode === "rotate" ? "local" : "world"}
            size={0.78}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onObjectChange={handleChange}
          />
          <mesh position={[frame.part.position.x, frame.part.position.y, frame.part.position.z]}>
            <sphereGeometry args={[0.22, 16, 16]} />
            <meshBasicMaterial color="#ffb547" />
          </mesh>
          <SelectionLabel part={frame.part} />
        </>
      )}
    </>
  );
}

/** Tiny world-space tag naming the module under the gizmo. */
function SelectionLabel({ part }: { part: AssemblyResult["parts"][number] }) {
  const name = part.part.name;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(8, 11, 18, 0.88)";
      ctx.beginPath();
      ctx.roundRect(4, 4, 504, 88, 18);
      ctx.fill();
      ctx.strokeStyle = "rgba(78, 225, 255, 0.6)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#e8f0fb";
      ctx.font = "600 40px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name.length > 26 ? `${name.slice(0, 25)}…` : name, 256, 52);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [name]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={[part.position.x, part.position.y + 2.6, part.position.z]} scale={[7, 1.3, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}
