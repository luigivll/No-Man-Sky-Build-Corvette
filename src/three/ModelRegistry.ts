import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Registry for real game meshes.
 *
 * Extracted models are *not* redistributed with this project. Drop your own
 * converted `.glb` files into `public/models/` and describe them in
 * `public/models/manifest.json`:
 *
 *   { "BIG_COK1X2_A": { "file": "BIG_COK1X2_A.glb", "scale": 1.0 } }
 *
 * Anything missing from the manifest falls back to the procedural builder, so
 * the shipyard always renders a complete hull. Run `npm run pak:extract` for
 * the documented extraction pipeline.
 */

export interface ModelManifestEntry {
  file: string;
  scale?: number;
  offset?: [number, number, number];
}

export type ModelManifest = Record<string, ModelManifestEntry>;

const MANIFEST_URL = "/models/manifest.json";

let manifestPromise: Promise<ModelManifest> | null = null;
const groupCache = new Map<string, THREE.Group>();
const failed = new Set<string>();

export function loadManifest(): Promise<ModelManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL)
      .then((response) => (response.ok ? (response.json() as Promise<ModelManifest>) : {}))
      .catch(() => ({}));
  }
  return manifestPromise;
}

/** Resolves to a cloned scene graph when a real mesh exists, otherwise null. */
export function useExtractedModel(sceneId: string): THREE.Group | null {
  const [group, setGroup] = useState<THREE.Group | null>(() => groupCache.get(sceneId) ?? null);

  useEffect(() => {
    let cancelled = false;
    const cached = groupCache.get(sceneId);
    if (cached) {
      setGroup(cached);
      return;
    }
    if (failed.has(sceneId)) return;

    void loadManifest().then((manifest) => {
      const entry = manifest[sceneId];
      if (!entry) {
        failed.add(sceneId);
        return;
      }
      new GLTFLoader().load(
        `/models/${entry.file}`,
        (gltf) => {
          if (cancelled) return;
          const root = gltf.scene.clone(true);
          if (entry.scale) root.scale.setScalar(entry.scale);
          if (entry.offset) root.position.fromArray(entry.offset);
          groupCache.set(sceneId, root);
          setGroup(root);
        },
        undefined,
        () => failed.add(sceneId),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  return group;
}

/** How many extracted meshes are currently in memory (used by the HUD badge). */
export const loadedModelCount = (): number => groupCache.size;
