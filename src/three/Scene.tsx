"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { AssemblyResult } from "@/domain/types";
import { PartMesh } from "./PartMesh";
import { SnapPoints } from "./SnapPoints";
import { TransformGizmo } from "./TransformGizmo";
import { useShipyard, type CameraPreset, type ViewportTheme } from "@/lib/store";

interface SceneProps {
  assembly: AssemblyResult;
  onCapture?: (register: () => string | null) => void;
}

/**
 * Full lighting recipes rather than a colour tint: a light studio needs a
 * brighter hemisphere, softer shadows, a pale floor and cool key light, or the
 * hull just turns grey instead of readable.
 */
const THEMES: Record<
  ViewportTheme,
  {
    background: string;
    fogNear: number;
    fogFar: number;
    hemisphere: [string, string, number];
    keyIntensity: number;
    keyColor: string;
    fillIntensity: number;
    fillColor: string;
    rimIntensity: number;
    rimColor: string;
    groundColor: string;
    cellColor: string;
    sectionColor: string;
    shadowOpacity: number;
    envIntensity: number;
  }
> = {
  dark: {
    background: "#04060b",
    fogNear: 90,
    fogFar: 220,
    hemisphere: ["#7fb6d8", "#121820", 0.55],
    keyIntensity: 2.1,
    keyColor: "#eaf6ff",
    fillIntensity: 0.8,
    fillColor: "#4ee1ff",
    rimIntensity: 40,
    rimColor: "#0b8fb8",
    groundColor: "#000000",
    cellColor: "#16283a",
    sectionColor: "#1f4a63",
    shadowOpacity: 0.55,
    envIntensity: 1,
  },
  light: {
    background: "#eef2f7",
    fogNear: 120,
    fogFar: 300,
    hemisphere: ["#ffffff", "#c6d2e0", 1.25],
    keyIntensity: 2.6,
    keyColor: "#ffffff",
    fillIntensity: 1.1,
    fillColor: "#cfe8ff",
    rimIntensity: 26,
    rimColor: "#8fb6d8",
    groundColor: "#8595a8",
    cellColor: "#c3ceda",
    sectionColor: "#93a4b8",
    shadowOpacity: 0.3,
    envIntensity: 1.45,
  },
};

const PRESET_VIEWS: Record<CameraPreset, { position: [number, number, number]; target: [number, number, number] }> = {
  orbit: { position: [22, 12, 26], target: [0, 0, 0] },
  front: { position: [0, 2, 46], target: [0, 0, 0] },
  rear: { position: [0, 3, -46], target: [0, 0, 0] },
  side: { position: [46, 3, 0], target: [0, 0, 0] },
  top: { position: [0, 46, 0.01], target: [0, 0, 0] },
  cinematic: { position: [18, 5, 30], target: [0, 1, 0] },
};

function CameraRig() {
  const preset = useShipyard((state) => state.cameraPreset);
  const { camera } = useThree();
  const controls = useRef<OrbitControlsImpl | null>(null);
  const from = useRef(new THREE.Vector3());
  const to = useRef(new THREE.Vector3());
  const targetFrom = useRef(new THREE.Vector3());
  const targetTo = useRef(new THREE.Vector3());
  const t = useRef(1);

  useEffect(() => {
    const view = PRESET_VIEWS[preset];
    from.current.copy(camera.position);
    to.current.fromArray(view.position);
    targetFrom.current.copy(controls.current?.target ?? new THREE.Vector3());
    targetTo.current.fromArray(view.target);
    t.current = 0;
  }, [preset, camera]);

  useFrame((_, delta) => {
    if (!controls.current || t.current >= 1) return;
    t.current = Math.min(1, t.current + delta * 2.2);
    const ease = 1 - (1 - t.current) ** 3;
    camera.position.lerpVectors(from.current, to.current, ease);
    controls.current.target.lerpVectors(targetFrom.current, targetTo.current, ease);
    controls.current.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={8}
      maxDistance={140}
      autoRotate={useShipyard.getState().autoRotate}
      autoRotateSpeed={0.45}
      target={[0, 0, 0]}
    />
  );
}

function AutoRotateSync() {
  const autoRotate = useShipyard((state) => state.autoRotate);
  const { controls } = useThree() as unknown as { controls: OrbitControlsImpl | null };
  useEffect(() => {
    if (controls) controls.autoRotate = autoRotate;
  }, [controls, autoRotate]);
  return null;
}

function Hull({ assembly }: { assembly: AssemblyResult }) {
  const palette = useShipyard((state) => state.document.palette);
  const exploded = useShipyard((state) => state.exploded);
  const selectedId = useShipyard((state) => state.selectedId);
  const select = useShipyard((state) => state.select);
  const showBounds = useShipyard((state) => state.showBounds);

  const centroid = useMemo(() => {
    const centre = new THREE.Vector3();
    if (assembly.parts.length === 0) return centre;
    const min = assembly.bounds.min;
    const max = assembly.bounds.max;
    return centre.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  }, [assembly]);

  const scale = useMemo(() => {
    const size = new THREE.Vector3(
      assembly.bounds.max.x - assembly.bounds.min.x,
      assembly.bounds.max.y - assembly.bounds.min.y,
      assembly.bounds.max.z - assembly.bounds.min.z,
    );
    const longest = Math.max(size.x, size.y, size.z, 1);
    return 30 / longest;
  }, [assembly.bounds]);

  return (
    <group scale={scale} position={[-centroid.x * scale, -centroid.y * scale + 2, -centroid.z * scale]}>
      {assembly.parts.map((part) => (
        <PartMesh
          key={part.placement.id}
          part={part}
          palette={palette}
          selected={part.placement.id === selectedId}
          exploded={exploded * 4}
          centroid={centroid}
          onSelect={select}
        />
      ))}
      {showBounds && <BoundsBox bounds={assembly.bounds} />}
      <SnapPoints assembly={assembly} />
      <TransformGizmo assembly={assembly} />
    </group>
  );
}

function BoundsBox({ bounds }: { bounds: AssemblyResult["bounds"] }) {
  const size = new THREE.Vector3(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
  const centre = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  );
  return (
    <lineSegments position={centre}>
      <edgesGeometry args={[new THREE.BoxGeometry(size.x, size.y, size.z)]} />
      <lineBasicMaterial color="#4ee1ff" transparent opacity={0.35} />
    </lineSegments>
  );
}

function Effects({ intensity, theme }: { intensity: number; theme: ViewportTheme }) {
  const bounce = theme === "light" ? "#ffffff" : "#20304a";
  const bounceIntensity = theme === "light" ? 1.6 : 0.7;
  return (
    <Environment resolution={256} frames={1} environmentIntensity={intensity}>
      <Lightformer
        intensity={2.4 * intensity}
        position={[0, 12, 0]}
        scale={[24, 24, 1]}
        rotation-x={Math.PI / 2}
        color="#dff3ff"
      />
      <Lightformer
        intensity={1.4 * intensity}
        position={[-14, 4, 8]}
        scale={[10, 10, 1]}
        rotation-y={Math.PI / 2}
        color="#4ee1ff"
      />
      <Lightformer
        intensity={1.1 * intensity}
        position={[14, 2, -8]}
        scale={[10, 10, 1]}
        rotation-y={-Math.PI / 2}
        color="#ffb547"
      />
      <Lightformer
        intensity={bounceIntensity}
        position={[0, -10, 0]}
        scale={[24, 24, 1]}
        rotation-x={-Math.PI / 2}
        color={bounce}
      />
    </Environment>
  );
}

function CaptureBridge({ onCapture }: { onCapture?: (register: () => string | null) => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    if (!onCapture) return;
    onCapture(() => {
      try {
        return gl.domElement.toDataURL("image/png");
      } catch {
        return null;
      }
    });
  }, [gl, onCapture]);
  return null;
}

export function ShipCanvas({ assembly, onCapture }: SceneProps) {
  const theme = THEMES[useShipyard((state) => state.theme)];

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
        alpha: false,
      }}
      camera={{ position: PRESET_VIEWS.orbit.position, fov: 42, near: 0.1, far: 500 }}
      onPointerMissed={() => useShipyard.getState().select(null)}
    >
      <color attach="background" args={[theme.background]} />
      <fog attach="fog" args={[theme.background, theme.fogNear, theme.fogFar]} />

      <hemisphereLight args={theme.hemisphere} />
      <directionalLight
        position={[24, 30, 18]}
        intensity={theme.keyIntensity}
        color={theme.keyColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
      >
        <orthographicCamera attach="shadow-camera" args={[-40, 40, 40, -40, 0.5, 120]} />
      </directionalLight>
      <directionalLight
        position={[-20, 10, -16]}
        intensity={theme.fillIntensity}
        color={theme.fillColor}
      />
      <pointLight position={[0, -12, 0]} intensity={theme.rimIntensity} color={theme.rimColor} distance={60} />

      <Suspense fallback={null}>
        <Effects intensity={theme.envIntensity} theme={useShipyard.getState().theme} />
        <Hull assembly={assembly} />
      </Suspense>

      {/* Studio floor: catches the shadow and gives the eye a horizon line. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -14.02, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={theme.background} roughness={0.95} metalness={0} />
      </mesh>

      <Grid
        position={[0, -14, 0]}
        args={[200, 200]}
        cellSize={2}
        cellThickness={0.5}
        cellColor={theme.cellColor}
        sectionSize={10}
        sectionThickness={1}
        sectionColor={theme.sectionColor}
        fadeDistance={150}
        fadeStrength={1.4}
        infiniteGrid
      />
      <ContactShadows
        position={[0, -13.9, 0]}
        opacity={theme.shadowOpacity}
        scale={90}
        blur={2.6}
        far={26}
        color={theme.groundColor}
      />

      <CameraRig />
      <AutoRotateSync />
      <CaptureBridge onCapture={onCapture} />
    </Canvas>
  );
}
