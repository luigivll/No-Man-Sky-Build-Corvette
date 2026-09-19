"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  HULL_PALETTES,
  buildShipMesh,
  projectScene,
  type ShipMesh,
  type ViewState,
} from "@/lib/render3d";
import { countParts } from "@/lib/build";
import type { Build } from "@/lib/types";
import { Icon } from "./Icon";

const VIEW_PRESETS: { id: string; label: string; icon: string; view: ViewState }[] = [
  { id: "hero", label: "Hero", icon: "Sparkles", view: { yaw: -0.62, pitch: -0.34, zoom: 1 } },
  { id: "starboard", label: "Starboard", icon: "Triangle", view: { yaw: -Math.PI / 2, pitch: -0.06, zoom: 1.02 } },
  { id: "top", label: "Plan", icon: "Layers", view: { yaw: 0, pitch: -Math.PI / 2 + 0.02, zoom: 1.02 } },
  { id: "front", label: "Bow", icon: "ChevronRight", view: { yaw: 0, pitch: -0.05, zoom: 1.04 } },
  { id: "stern", label: "Stern", icon: "Rocket", view: { yaw: Math.PI, pitch: -0.22, zoom: 1.02 } },
];


export default function ShipPreview3D({
  build,
  height = 460,
  compact = false,
  showControls = true,
  palette,
  onPaletteChange,
  initialView = "hero",
}: {
  build: Build;
  height?: number;
  compact?: boolean;
  showControls?: boolean;
  palette?: string;
  onPaletteChange?: (id: string) => void;
  initialView?: string;
}) {
  const [view, setView] = useState<ViewState>(
    VIEW_PRESETS.find((p) => p.id === initialView)?.view ?? VIEW_PRESETS[0].view,
  );
  const [spinning, setSpinning] = useState(false);
  const [hovered, setHovered] = useState<{ name: string; category: string } | null>(null);
  const [size, setSize] = useState({ width: 900, height });
  const [localPalette, setLocalPalette] = useState(palette ?? HULL_PALETTES[0].id);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pendingRef = useRef<{ yaw: number; pitch: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  const activePalette = palette ?? localPalette;
  const moduleCount = countParts(build);

  const setPalette = useCallback(
    (id: string) => {
      setLocalPalette(id);
      onPaletteChange?.(id);
    },
    [onPaletteChange],
  );

  // measure the container so the SVG always fills it
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: Math.max(320, rect.width), height: Math.max(220, rect.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // idle turntable
  useEffect(() => {
    if (!spinning) return;
    let frame = 0;
    const tick = () => {
      setView((current) => ({ ...current, yaw: current.yaw + 0.008 }));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spinning]);

  const mesh: ShipMesh = useMemo(
    () => buildShipMesh(build, { palette: activePalette }),
    [build, activePalette],
  );

  const scene = useMemo(
    () => projectScene(mesh, view, size.width, size.height, { padding: 1.24 }),
    [mesh, view, size.width, size.height],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (compact) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch };
    setGrabbing(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const yaw = drag.yaw + (event.clientX - drag.x) * 0.011;
    const pitch = Math.max(-1.5, Math.min(1.5, drag.pitch + (event.clientY - drag.y) * 0.008));
    // throttle to one state update per frame: re-projecting a few thousand
    // polygons on every pointer event is what makes orbit feel sticky
    pendingRef.current = { yaw, pitch };
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const next = pendingRef.current;
      if (!next) return;
      setView((current) => ({ ...current, yaw: next.yaw, pitch: next.pitch }));
    });
  };

  const endDrag = () => {
    dragRef.current = null;
    pendingRef.current = null;
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setGrabbing(false);
  };

  const zoom = (delta: number) =>
    setView((current) => ({
      ...current,
      zoom: Math.max(0.45, Math.min(2.4, current.zoom + delta)),
    }));

  if (moduleCount === 0) {
    return (
      <div
        className="panel-flat grid place-items-center px-6 py-12 text-center"
        style={{ minHeight: height }}
      >
        <div>
          <Icon name="ScanLine" className="mx-auto h-8 w-8 text-cyan-400/50" />
          <p className="mt-3 font-display text-xs uppercase tracking-[0.2em] text-slate-400">
            No hull to render
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Add modules and the ship assembles itself in 3D.
          </p>
        </div>
      </div>
    );
  }

  const showShield = mesh.shieldRings.length > 0;
  const interactiveHover = !compact && moduleCount <= 60;

  return (
    <div
      ref={wrapRef}
      className="relative select-none overflow-hidden border border-cyan-400/15 bg-[#03050a]"
      style={{ height, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onWheel={(event) => {
        if (compact) return;
        zoom(event.deltaY > 0 ? -0.07 : 0.07);
      }}
    >
      <div
        className="h-full w-full"
        style={{
          cursor: compact ? "default" : grabbing ? "grabbing" : "grab",
          background:
            "radial-gradient(ellipse at 50% 34%, #0d2033 0%, #060d18 52%, #03050a 100%)",
        }}
      >
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          width="100%"
          height="100%"
          role="img"
          aria-label={`3D render of ${build.name}`}
        >
          <defs>
            <radialGradient id="sp-shadow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#000000" stopOpacity="0.62" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sp-ambient" cx="50%" cy="40%" r="62%">
              <stop offset="0%" stopColor="#1d4a68" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#03050a" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width={size.width} height={size.height} fill="url(#sp-ambient)" />

          {/* hangar deck */}
          <g>
            {scene.deck.map((points, index) => (
              <polyline
                key={`deck-${index}`}
                points={points}
                fill="none"
                stroke="rgba(56,189,248,0.15)"
                strokeWidth={0.8}
              />
            ))}
          </g>

          {scene.shadow ? (
            <ellipse
              cx={scene.shadow.cx}
              cy={scene.shadow.cy}
              rx={scene.shadow.rx * 1.1}
              ry={scene.shadow.ry * 1.1}
              fill="url(#sp-shadow)"
            />
          ) : null}

          {/* ship: shaded polygons sorted back-to-front */}
          <g>
            {scene.faces.map((face, index) => (
              <polygon
                key={`face-${index}`}
                points={face.points}
                fill={face.fill}
                opacity={face.opacity}
                stroke="rgba(3,6,12,0.5)"
                strokeWidth={0.35}
                onMouseEnter={
                  interactiveHover
                    ? () => setHovered({ name: face.partName, category: face.category })
                    : undefined
                }
                onMouseLeave={interactiveHover ? () => setHovered(null) : undefined}
              />
            ))}
          </g>

          {/* engine exhaust: soft outer flame + hot core */}
          <g>
            {scene.plumes.map((plume, index) => (
              <g key={`plume-${index}`}>
                <polygon
                  points={plume.points}
                  fill={plume.fill}
                  opacity={plume.opacity}
                />
                <polygon
                  points={plume.core}
                  fill="#ffe9c7"
                  opacity={plume.coreOpacity}
                />
              </g>
            ))}
          </g>

          {/* shield envelope */}
          {showShield ? (
            <g>
              {scene.shield.flat().map((segment, index) => (
                <polyline
                  key={`shield-${index}`}
                  points={segment.points}
                  fill="none"
                  stroke="rgba(103,232,249,0.42)"
                  strokeWidth={1}
                />
              ))}
            </g>
          ) : null}
        </svg>
      </div>

      {/* HUD overlays */}
      <div className="pointer-events-none absolute left-3 top-3 space-y-0.5">
        <span className="hud-label block">
          {compact ? "Hull render" : "Live hull render"}
        </span>
        <span className="hud-mono text-[0.68rem] text-cyan-200">
          {moduleCount} MODULES · {mesh.parts.reduce((n, p) => n + p.faces.length, 0)} FACES
        </span>
      </div>

      {hovered && interactiveHover ? (
        <div className="pointer-events-none absolute right-3 top-3 max-w-[220px] border border-cyan-400/30 bg-void-950/85 px-2.5 py-1.5 text-right">
          <span className="hud-label block">Module</span>
          <span className="text-[0.72rem] text-cyan-100">{hovered.name}</span>
          {paletteHint(hovered.category)}
        </div>
      ) : null}

      {showControls && !compact ? (
        <>
          <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1.5">
            {VIEW_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setView(preset.view);
                }}
                className={`flex items-center gap-1 border px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wider transition ${
                  Math.abs(view.yaw - preset.view.yaw) < 0.001 &&
                  Math.abs(view.pitch - preset.view.pitch) < 0.001
                    ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                    : "border-white/12 text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200"
                }`}
              >
                <Icon name={preset.icon} className="h-3 w-3" />
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setSpinning((value) => !value);
              }}
              className={`flex items-center gap-1 border px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wider transition ${
                spinning
                  ? "border-plasma-500/60 bg-plasma-500/15 text-plasma-300"
                  : "border-white/12 text-slate-400 hover:border-plasma-500/40"
              }`}
            >
              <Icon name="RefreshCw" className={`h-3 w-3 ${spinning ? "animate-spin" : ""}`} />
              Turntable
            </button>
          </div>

          <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
            <button
              type="button"
              className="grid h-7 w-7 place-items-center border border-white/12 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
              onClick={(event) => {
                event.stopPropagation();
                zoom(-0.12);
              }}
              aria-label="Zoom out"
            >
              <Icon name="Minus" className="h-3.5 w-3.5" />
            </button>
            <span className="hud-mono w-10 text-center text-[0.65rem] text-slate-400">
              {(view.zoom * 100).toFixed(0)}%
            </span>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center border border-white/12 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
              onClick={(event) => {
                event.stopPropagation();
                zoom(0.12);
              }}
              aria-label="Zoom in"
            >
              <Icon name="Plus" className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      ) : null}

      {showControls && !compact && onPaletteChange !== undefined ? (
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
          {HULL_PALETTES.map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.label}
              aria-label={`Paint ${option.label}`}
              onClick={(event) => {
                event.stopPropagation();
                setPalette(option.id);
              }}
              className={`h-6 w-6 border transition ${
                activePalette === option.id
                  ? "scale-110 border-cyan-300"
                  : "border-white/20 hover:border-white/50"
              }`}
              style={{ background: option.swatch }}
            />
          ))}
        </div>
      ) : null}

      {!compact ? (
        <div className="pointer-events-none absolute right-3 bottom-12 hud-mono text-[0.6rem] uppercase tracking-wider text-slate-500">
          drag to orbit · scroll to zoom
        </div>
      ) : null}
    </div>
  );
}

function paletteHint(category: string) {
  const notes: Record<string, string> = {
    cockpit: "Flight deck",
    reactor: "Power core",
    habitation: "Hab / walkway",
    access: "Landing bay",
    "engine-main": "Main engine",
    "engine-light": "Light thruster",
    weapon: "Hardpoint",
    shield: "Shield emitter",
    landing: "Landing gear",
    wing: "Wing / plating",
  };
  return (
    <span className="mt-0.5 block font-mono text-[0.6rem] uppercase tracking-wider text-slate-500">
      {notes[category] ?? category}
    </span>
  );
}
