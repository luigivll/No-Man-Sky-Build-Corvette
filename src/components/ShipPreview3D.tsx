"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { buildShipMesh, projectScene, type ShipMesh, type ViewState } from "@/lib/render3d";
import { HULL_PAINTS, SHIP_STYLES } from "@/lib/shipStyles";
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
  style,
  onStyleChange,
  initialView = "hero",
  showStylePicker = true,
  mesh: suppliedMesh,
  initialViewState,
}: {
  build: Build;
  /**
   * Pre-built mesh.  The lattice assembler hands its own ShipMesh straight in,
   * so a real-geometry corvette gets the same scene, lighting and controls as a
   * catalogue build.
   */
  mesh?: ShipMesh;
  height?: number;
  compact?: boolean;
  showControls?: boolean;
  /** ship family id, or a fused combination like "sentinel+exotic" */
  style?: string;
  onStyleChange?: (id: string) => void;
  initialView?: string;
  showStylePicker?: boolean;
  /**
   * A ship-specific opening camera, for hand-drawn iconics: the bow shows a
   * TIE's blade cross or an X-Wing's foils, the plan shows a Falcon's saucer.
   */
  initialViewState?: ViewState;
}) {
  const [view, setView] = useState<ViewState>(
    initialViewState ?? VIEW_PRESETS.find((p) => p.id === initialView)?.view ?? VIEW_PRESETS[0].view,
  );
  const [spinning, setSpinning] = useState(false);
  const [hovered, setHovered] = useState<{ name: string; category: string } | null>(null);
  const [size, setSize] = useState({ width: 900, height });
  const [localStyle, setLocalStyle] = useState(style ?? "corvette");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const pendingRef = useRef<{ yaw: number; pitch: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  const activeStyle = style ?? localStyle;
  const moduleCount = countParts(build);

  const setStyle = useCallback(
    (id: string) => {
      setLocalStyle(id);
      onStyleChange?.(id);
    },
    [onStyleChange],
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
    () => suppliedMesh ?? buildShipMesh(build, { style: activeStyle }),
    [suppliedMesh, build, activeStyle],
  );

  const scene = useMemo(
    () => projectScene(mesh, view, size.width, size.height, { padding: compact ? 1.34 : 1.42 }),
    [mesh, view, size.width, size.height, compact],
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

  const showShield = mesh.hasShield;
  const interactiveHover = !compact && moduleCount <= 60;
  void HULL_PAINTS;

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

          {scene.environment === "space" ? (
            <>
              <rect width={size.width} height={size.height} fill="#04060d" />
              {scene.nebula.map((cloud, index) => (
                <ellipse
                  key={`nebula-${index}`}
                  cx={cloud.x}
                  cy={cloud.y}
                  rx={cloud.rx}
                  ry={cloud.ry}
                  fill={cloud.color}
                  opacity={cloud.alpha}
                  transform={`rotate(${cloud.rotate} ${cloud.x} ${cloud.y})`}
                  style={{ filter: "blur(26px)" }}
                />
              ))}
              {scene.stars.map((star, index) => (
                <circle
                  key={`star-${index}`}
                  cx={star.x}
                  cy={star.y}
                  r={star.r}
                  fill="#e8f4ff"
                  opacity={star.alpha}
                />
              ))}
            </>
          ) : (
            <rect width={size.width} height={size.height} fill="url(#sp-ambient)" />
          )}

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

          {/* engine trails sit behind the ship so they never cover the hull */}
          <g>
            {scene.plumes.map((plume, index) => (
              <g key={`trail-${index}`}>
                {plume.segments.map((segment, segIndex) => (
                  <polygon
                    key={segIndex}
                    points={segment.points}
                    fill={mesh.style.trail}
                    opacity={segment.alpha}
                  />
                ))}
              </g>
            ))}
          </g>

          {/* ship: shaded polygons sorted back-to-front */}
          <g>
            {scene.faces.map((face, index) => {
              const glowing = face.kind === "emissive" || face.kind === "trim";
              return (
                <polygon
                  key={`face-${index}`}
                  points={face.points}
                  fill={face.fill}
                  opacity={face.opacity}
                  stroke={glowing ? face.fill : "rgba(3,6,12,0.45)"}
                  strokeWidth={glowing ? 2.2 : 0.3}
                  strokeOpacity={glowing ? 0.45 : 1}
                  onMouseEnter={
                    interactiveHover
                      ? () =>
                          setHovered({
                            name: face.flourish ? `${face.flourish.replace(/-/g, " ")} (style trim)` : face.partName,
                            category: face.category,
                          })
                      : undefined
                  }
                  onMouseLeave={interactiveHover ? () => setHovered(null) : undefined}
                />
              );
            })}
          </g>

          {/* hot cores: only the first stretch, drawn over the nozzle mouth */}
          <g>
            {scene.plumes.map((plume, index) => (
              <polygon key={`core-${index}`} points={plume.core} fill="#fff2d8" opacity={0.7} />
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
                  stroke="rgba(103,232,249,0.22)"
                  strokeWidth={0.9}
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
          {moduleCount} MODULES ·{" "}
          {mesh.parts.reduce((n, p) => n + p.faces.length, 0)} FACES
        </span>
        <span className="hud-mono block text-[0.6rem] uppercase tracking-wider" style={{ color: mesh.style.emissive }}>
          {mesh.style.label}
        </span>
      </div>

      {hovered && interactiveHover && !showStylePicker ? (
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

      {showControls && !compact && showStylePicker ? (
        <div className="absolute right-2 top-2 flex max-w-[190px] flex-col gap-1">
          <span className="hud-label text-right">Hull style</span>
          {SHIP_STYLES.map((shipStyle) => {
            const active = activeStyle.split("+").includes(shipStyle.id);
            return (
              <button
                key={shipStyle.id}
                type="button"
                title={shipStyle.blurb}
                onClick={(event) => {
                  event.stopPropagation();
                  // clicking a second family fuses it with the current one
                  const current = activeStyle.split("+").filter(Boolean);
                  let next: string[];
                  if (current.includes(shipStyle.id)) {
                    next = current.length > 1 ? current.filter((id) => id !== shipStyle.id) : current;
                  } else {
                    next = current.length >= 2 ? [current[current.length - 1], shipStyle.id] : [...current, shipStyle.id];
                  }
                  setStyle(next.join("+"));
                }}
                className={`flex items-center gap-2 border px-2 py-1 text-left transition ${
                  active ? "border-cyan-300/70 bg-white/10" : "border-white/12 hover:border-white/35"
                }`}
              >
                <span
                  className="h-3.5 w-3.5 shrink-0 border border-black/40"
                  style={{
                    background: `linear-gradient(135deg, ${shipStyle.hullBase} 0 55%, ${shipStyle.emissive} 55% 100%)`,
                  }}
                />
                <span className="truncate font-mono text-[0.6rem] uppercase tracking-wider text-slate-300">
                  {shipStyle.label}
                </span>
              </button>
            );
          })}
          <span className="text-right text-[0.55rem] uppercase tracking-wider text-slate-500">
            {activeStyle.split("+").length > 1 ? "fusion active" : "tap 2nd to fuse"}
          </span>
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
