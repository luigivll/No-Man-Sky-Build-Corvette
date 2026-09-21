"use client";

import { memo, useMemo } from "react";
import * as THREE from "three";
import type { AssembledPart, Palette, PaintRole } from "@/domain/types";
import { getPartGeometry } from "./geometry";
import { useExtractedModel } from "./ModelRegistry";

/**
 * One corvette module. Four merged buffers (hull / detail / glass / glow) keep
 * the draw-call count sane even at the 160-part cap, and the same geometry is
 * shared by every identical module through the builder cache.
 */

interface PartMeshProps {
  part: AssembledPart;
  palette: Palette;
  selected: boolean;
  exploded: number;
  centroid: THREE.Vector3;
  onSelect: (id: string) => void;
}

const ROLE_DEFAULT: Record<PaintRole, { metalness: number; roughness: number }> = {
  primary: { metalness: 0.62, roughness: 0.42 },
  secondary: { metalness: 0.5, roughness: 0.55 },
  accent: { metalness: 0.7, roughness: 0.3 },
  trim: { metalness: 0.85, roughness: 0.28 },
  glass: { metalness: 0.1, roughness: 0.08 },
  emissive: { metalness: 0.4, roughness: 0.35 },
};

export const CATEGORY_ROLE: Record<string, PaintRole> = {
  cockpit: "primary",
  habitation: "primary",
  walkway: "primary",
  landingBay: "secondary",
  landingGear: "trim",
  reactor: "secondary",
  thruster: "trim",
  engine: "trim",
  shield: "trim",
  weapon: "trim",
  wing: "secondary",
  plating: "secondary",
  cargo: "secondary",
  decoration: "trim",
};

export const PartMesh = memo(function PartMesh({
  part,
  palette,
  selected,
  exploded,
  centroid,
  onSelect,
}: PartMeshProps) {
  const extracted = useExtractedModel(part.part.sceneId);
  const geometry = useMemo(
    () => getPartGeometry(part.part.archetype, part.part.size),
    [part.part.archetype, part.part.size],
  );

  const role: PaintRole = part.placement.role ?? CATEGORY_ROLE[part.part.category] ?? "primary";

  const materials = useMemo(() => {
    const finish = ROLE_DEFAULT[role];
    const wear = palette.wear;
    const hull = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette[role === "glass" ? "primary" : role]),
      metalness: part.part.finish?.metalness ?? finish.metalness,
      roughness: Math.min(1, (part.part.finish?.roughness ?? finish.roughness) + wear * 0.4),
      envMapIntensity: 1.1,
    });
    const detail = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.trim),
      metalness: 0.9,
      roughness: Math.min(1, 0.35 + wear * 0.5),
      envMapIntensity: 0.9,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.glass),
      metalness: 0.2,
      roughness: 0.06,
      transparent: true,
      opacity: 0.55,
      envMapIntensity: 2.2,
    });
    const glow = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.emissive),
      emissive: new THREE.Color(palette.emissive),
      emissiveIntensity: 2.6 * (part.part.finish?.emissiveIntensity ?? 1),
      metalness: 0.2,
      roughness: 0.4,
      toneMapped: false,
    });
    return { hull, detail, glass, glow };
  }, [palette, role, part.part.finish]);

  const transform = useMemo(() => {
    const matrix = new THREE.Matrix4().fromArray(part.matrix as number[]);
    if (exploded > 0) {
      const direction = new THREE.Vector3().subVectors(part.position, centroid);
      if (direction.lengthSq() < 1e-6) direction.set(0, 1, 0);
      direction.normalize().multiplyScalar(exploded);
      matrix.premultiply(new THREE.Matrix4().makeTranslation(direction.x, direction.y, direction.z));
    }
    return matrix;
  }, [part.matrix, part.position, centroid, exploded]);

  const outline = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(selected ? "#4ee1ff" : "#ffb547"),
        wireframe: true,
        transparent: true,
        opacity: selected ? 0.55 : 0.18,
        depthWrite: false,
      }),
    [selected],
  );

  if (extracted) {
    return (
      <group
        matrix={transform}
        matrixAutoUpdate={false}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(part.placement.id);
        }}
      >
        <primitive object={extracted} />
      </group>
    );
  }

  return (
    <group
      matrix={transform}
      matrixAutoUpdate={false}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(part.placement.id);
      }}
    >
      <mesh geometry={geometry.hull} material={materials.hull} castShadow receiveShadow />
      {geometry.detail.attributes.position && (
        <mesh geometry={geometry.detail} material={materials.detail} castShadow />
      )}
      {geometry.glass.attributes.position && (
        <mesh geometry={geometry.glass} material={materials.glass} />
      )}
      {geometry.glow.attributes.position && <mesh geometry={geometry.glow} material={materials.glow} />}
      {selected && <mesh geometry={geometry.hull} material={outline} scale={1.035} />}
    </group>
  );
});
