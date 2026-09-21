"use client";

import { useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useShipyard, type CameraPreset } from "@/lib/store";
import { useAssembly } from "@/lib/useAssembly";
import { LibraryPanel } from "@/components/LibraryPanel";
import { InspectorPanel } from "@/components/InspectorPanel";
import { ExportMenu } from "@/components/ExportMenu";
import { Button, Toasts } from "@/components/ui";
import { cx } from "@/lib/cx";

const ShipCanvas = dynamic(() => import("@/components/Viewport").then((mod) => mod.Viewport), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="telemetry animate-pulse-soft text-xs text-plasma">INITIALISING SHIPYARD BAY…</div>
    </div>
  ),
});

const VIEW_PRESETS: Array<{ key: CameraPreset; label: string }> = [
  { key: "orbit", label: "3/4" },
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "top", label: "Top" },
  { key: "rear", label: "Rear" },
  { key: "cinematic", label: "Cine" },
];

export default function ShipyardPage() {
  const { document, assembly } = useAssembly();
  const store = useShipyard();
  const captureRef = useRef<() => string | null>(() => null);

  const registerCapture = useCallback((fn: () => string | null) => {
    captureRef.current = fn;
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && store.selectedId) {
        event.preventDefault();
        store.removePart(store.selectedId);
      }
      if (event.key.toLowerCase() === "g") store.toggle("showSnapPoints");
      if (event.key.toLowerCase() === "r") store.toggle("autoRotate");
      if (event.key.toLowerCase() === "b") store.toggle("showBounds");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  return (
    <main className="relative flex h-screen flex-col overflow-hidden bg-void text-ink">
      {/* ---- top bar ---- */}
      <header className="relative z-30 flex shrink-0 items-center gap-4 border-b border-edge bg-hull/80 px-4 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-plasma/40 bg-plasma/10">
            <div className="absolute inset-0 rounded-lg bg-plasma/20 blur-md" />
            <svg viewBox="0 0 24 24" className="relative h-4 w-4 text-plasma" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 2 3 8v8l9 6 9-6V8z" strokeLinejoin="round" />
              <path d="M12 22V10m0 0L3 8m9 2 9-2" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="leading-tight">
            <h1 className="text-[13px] font-bold tracking-tight">
              NMS <span className="text-plasma">Corvette</span> Shipyard
            </h1>
            <p className="telemetry text-[9px] text-ink-faint">CORVETTE WORKSHOP · VOYAGERS 6.x</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            value={document.name}
            onChange={(event) => store.setName(event.target.value)}
            className="panel-inset min-w-0 flex-1 max-w-xs px-3 py-1.5 text-[12px] font-semibold outline-none focus:border-plasma/50"
            aria-label="Corvette name"
          />
          <span className="telemetry rounded border border-fusion/40 bg-fusion/10 px-2 py-1 text-[10px] font-bold text-fusion">
            CLASS {assembly.stats.bestClass}
          </span>
          <span className="telemetry hidden text-[10px] text-ink-faint lg:inline">
            {assembly.stats.partCount}/160 MODULES · {assembly.stats.floors} DECKS
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={store.undo} disabled={store.past.length === 0} title="Undo (⌘Z)">
            ↶
          </Button>
          <Button size="sm" onClick={store.redo} disabled={store.future.length === 0} title="Redo (⇧⌘Z)">
            ↷
          </Button>
          <Button size="sm" variant="danger" onClick={store.reset} title="Empty the bay">
            New
          </Button>
        </div>

        <ExportMenu getScreenshot={() => captureRef.current()} />
      </header>

      {/* ---- workspace ---- */}
      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr_330px] gap-3 p-3">
        <LibraryPanel />

        <section className="panel relative min-h-0 overflow-hidden">
          <ShipCanvas assembly={assembly} onCapture={registerCapture} />

          {/* HUD: viewport controls */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
            <div className="panel pointer-events-auto flex gap-1 p-1">
              {VIEW_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => store.setCameraPreset(preset.key)}
                  className={cx(
                    "rounded px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors",
                    store.cameraPreset === preset.key ? "bg-plasma/15 text-plasma" : "text-ink-faint hover:text-ink-dim",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="panel pointer-events-auto flex gap-1 p-1">
              {(
                [
                  ["autoRotate", "Orbit", "R"],
                  ["showSnapPoints", "Snap", "G"],
                  ["showBounds", "Bounds", "B"],
                ] as const
              ).map(([key, label, shortcut]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => store.toggle(key)}
                  title={`${label} (${shortcut})`}
                  className={cx(
                    "rounded px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors",
                    store[key] ? "bg-plasma/15 text-plasma" : "text-ink-faint hover:text-ink-dim",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* HUD: exploded slider + telemetry strip */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
            <div className="panel pointer-events-auto w-56 p-2.5">
              <label className="label">
                Exploded view <span className="telemetry ml-1 text-plasma">{Math.round(store.exploded * 100)}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(store.exploded * 100)}
                onChange={(event) => store.setExploded(Number(event.target.value) / 100)}
                className="mt-1.5 w-full accent-plasma"
              />
            </div>

            <div className="panel pointer-events-auto flex gap-4 px-4 py-2">
              {(
                [
                  ["SHD", Math.round(assembly.stats.shield), "text-[#6ea8ff]"],
                  ["WPN", Math.round(assembly.stats.weapon), "text-[#ff4d6d]"],
                  ["SPD", Math.round(assembly.stats.speed), "text-[#ff9f6e]"],
                  ["MNV", Math.round(assembly.stats.manoeuvre), "text-[#a98bff]"],
                  ["CRG", assembly.stats.cargoSlots, "text-[#3ddc97]"],
                ] as const
              ).map(([label, value, color]) => (
                <div key={label} className="text-center">
                  <div className="label">{label}</div>
                  <div className={cx("telemetry text-[13px] font-bold", color)}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <InspectorPanel />
      </div>

      <Toasts />
    </main>
  );
}
