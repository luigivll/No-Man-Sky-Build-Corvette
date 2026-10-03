"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { AssemblyResult } from "@/domain/types";
import { useShipyard } from "@/lib/store";

/**
 * Snap-node visualisation. Every free connection point is drawn as a small
 * ring oriented along the node's outward normal, so it is obvious where the
 * next module will land and which way it will face.
 */
export function SnapPoints({ assembly }: { assembly: AssemblyResult }) {
  const visible = useShipyard((state) => state.showSnapPoints);
  const hoveredNodeId = useShipyard((state) => state.hoveredNodeId);
  const hoverNode = useShipyard((state) => state.hoverNode);
  const select = useShipyard((state) => state.select);

  const points = useMemo(() => {
    if (!visible) return [];
    return assembly.freeNodes.map((free) => {
      const part = assembly.parts.find((item) => item.placement.id === free.placementId);
      if (!part) return null;
      const basis = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(part.basis[0].x, part.basis[0].y, part.basis[0].z),
        new THREE.Vector3(part.basis[1].x, part.basis[1].y, part.basis[1].z),
        new THREE.Vector3(part.basis[2].x, part.basis[2].y, part.basis[2].z),
      );
      const local = new THREE.Vector3(free.node.position.x, free.node.position.y, free.node.position.z);
      const outward = new THREE.Vector3(free.node.outward.x, free.node.outward.y, free.node.outward.z);
      local.applyMatrix4(basis).add(part.position);
      outward.applyMatrix4(new THREE.Matrix4().extractRotation(basis));
      return {
        id: `${free.placementId}::${free.node.id}`,
        placementId: free.placementId,
        position: local,
        outward,
        kind: free.node.kind,
      };
    }).filter((point): point is NonNullable<typeof point> => point !== null);
  }, [assembly, visible]);

  if (!visible) return null;

  return (
    <group>
      {points.map((point) => {
        const active = hoveredNodeId === point.id;
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          point.outward.clone().normalize(),
        );
        return (
          <mesh
            key={point.id}
            position={point.position}
            quaternion={quaternion}
            onPointerOver={(event) => {
              event.stopPropagation();
              hoverNode(point.id);
            }}
            onPointerOut={() => hoverNode(null)}
            onClick={(event) => {
              event.stopPropagation();
              select(point.placementId);
            }}
          >
            <ringGeometry args={[active ? 0.3 : 0.2, active ? 0.42 : 0.3, 20]} />
            <meshBasicMaterial
              color={point.kind === "module" ? "#4ee1ff" : "#ffb547"}
              transparent
              opacity={active ? 0.95 : 0.45}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
