"use client";

import { useState } from "react";
import HullSchematic from "./HullSchematic";
import ShipPreview3D from "./ShipPreview3D";
import { Icon } from "./Icon";
import { HULL_PALETTES } from "@/lib/render3d";
import type { Build } from "@/lib/types";

type ViewMode = "ship" | "blueprint";

/**
 * The visual preview panel: a lit 3D render of the assembled ship (default)
 * with the technical blueprint schematic one click away.
 */
export default function ShipViewPanel({
  build,
  height = 460,
  title = "Ship preview",
  subtitle,
  defaultMode = "ship",
  showPalette = true,
  headerRight,
}: {
  build: Build;
  height?: number;
  title?: string;
  subtitle?: string;
  defaultMode?: ViewMode;
  showPalette?: boolean;
  headerRight?: React.ReactNode;
}) {
  const [mode, setMode] = useState<ViewMode>(defaultMode);
  const [palette, setPalette] = useState(HULL_PALETTES[0].id);

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
            <Icon name={mode === "ship" ? "Ship" : "ScanLine"} className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-slate-100">
              {title}
            </h2>
            <p className="text-xs text-slate-400">
              {subtitle ??
                (mode === "ship"
                  ? "Lit 3D render of the assembled Corvette"
                  : "Technical blueprint projection")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {headerRight}
          <div className="flex items-center gap-1">
            {(
              [
                { id: "ship", label: "Ship view", icon: "Ship" },
                { id: "blueprint", label: "Blueprint", icon: "ScanLine" },
              ] as { id: ViewMode; label: string; icon: string }[]
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMode(option.id)}
                className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[0.62rem] uppercase tracking-wider transition ${
                  mode === option.id
                    ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                    : "border-white/12 text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200"
                }`}
              >
                <Icon name={option.icon} className="h-3.5 w-3.5" />
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {mode === "ship" ? (
        <ShipPreview3D
          build={build}
          height={height}
          palette={showPalette ? palette : undefined}
          onPaletteChange={showPalette ? setPalette : undefined}
        />
      ) : (
        <HullSchematic build={build} height={height} />
      )}
    </section>
  );
}
