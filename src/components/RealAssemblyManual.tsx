"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ShipPreview3D from "@/components/ShipPreview3D";
import { Chip, HudLabel, Panel, PanelHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { assembleCorvette, placedBox } from "@/lib/lattice";
import { assetLabel } from "@/lib/blueprintLattice";
import { latticeBuild, type NamedRecipe } from "@/lib/fleet";
import { ensurePack } from "@/lib/realMeshes";
import type { ShipMesh } from "@/lib/render3d";

/**
 * Real-mesh assembly manual.
 *
 * The lattice recipe is already in build order, so a step is just a prefix of it:
 * step N draws the ship with the first N modules fitted, and the module that
 * arrived on that step is repainted in the ship's accent colour so your eye
 * lands on the new hardware instead of on the hull it bolts to.
 *
 * Works for anything the compiler can compile — iconics, the hand-tuned probe
 * and random rolls alike, because all of them are recipes.
 */

const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const ROLE_COPY: Record<string, string> = {
  first: "nose of the spine",
  linked: "next link in the spine",
  tail: "armoured cap on the stern",
  starboard: "starboard mount",
  port: "port mount",
  dorsal: "dorsal deck mount",
  ventral: "ventral mount",
};

export default function RealAssemblyManual({
  recipe,
  accent = "#38bdf8",
  height = 560,
}: {
  recipe: NamedRecipe;
  accent?: string;
  height?: number;
}) {
  const total = recipe.parts.length;
  const [step, setStep] = useState(Math.min(total, 1));
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    ensurePack().then((p) => alive && setReady(Boolean(p)));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => setStep(Math.min(total, 1)), [recipe.id, total]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= total) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 850);
    return () => window.clearInterval(id);
  }, [playing, total]);

  const placed = recipe.parts.slice(0, step);
  const focus = placed[placed.length - 1];

  // Triangle budget is shared across the ship, so the first modules are drawn in
  // full detail and the later ones get cheaper as the hull fills up. A fixed
  // per-part cap would make the first three steps as coarse as a 60-module
  // dreadnought, and no cap at all would hand the browser 85k polygons.
  const budget = Math.max(420, Math.min(2400, Math.round(14000 / Math.max(1, placed.length))));

  const mesh: ShipMesh | null = useMemo(() => {
    if (!ready || !placed.length) return null;
    return assembleCorvette({ ...recipe, parts: placed }, { maxTrisPerPart: budget });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, recipe, placed.length, step, budget]);

  // Dim what is already bolted down and paint the newcomer in the ship's accent:
  // on a pale hull an accent-coloured part alone is easy to lose, whereas a
  // dimmed hull reads as "done" without stealing the step.
  const highlighted = useMemo(() => {
    if (!mesh) return null;
    const rgb = hexRgb(accent);
    const lastIndex = mesh.parts.length - 1;
    return {
      ...mesh,
      parts: mesh.parts.map((p, i) =>
        i === lastIndex
          ? { ...p, faces: p.faces.map((f) => ({ ...f, rgb, opacity: 1 })) }
          : {
              ...p,
              faces: p.faces.map((f) => ({
                ...f,
                rgb: [
                  Math.round(f.rgb[0] * 0.46 + 18),
                  Math.round(f.rgb[1] * 0.46 + 20),
                  Math.round(f.rgb[2] * 0.46 + 24),
                ] as [number, number, number],
                opacity: Math.min(f.opacity ?? 1, 0.9),
              })),
            },
      ),
    };
  }, [mesh, accent]);

  const focusBox = focus
    ? placedBox(focus.assetId, focus.pos, focus.yaw, focus.mirror, focus.scale ?? 1)
    : null;

  const jump = useCallback((n: number) => {
    setPlaying(false);
    setStep(Math.max(1, Math.min(total, n)));
  }, [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") jump(step + 1);
      if (e.key === "ArrowLeft") jump(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, step]);

  const pct = Math.round((step / total) * 100);

  return (
    <Panel>
      <PanelHeader
        icon="ClipboardList"
        title={`${recipe.name} · step by step`}
        subtitle="Each step adds one real module to the build, on the game grid"
        accent={accent}
        right={
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300/70">
            {ready === null ? "loading meshes" : ready ? "real meshes" : "pack missing"}
          </span>
        }
      />

      <div className="flex flex-col gap-4 p-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          {highlighted ? (
            <ShipPreview3D
              build={latticeBuild(recipe)}
              mesh={highlighted}
              height={height}
              showStylePicker={false}
              initialView="hero"
              initialViewState={recipe.view}
            />
          ) : (
            <div className="grid place-items-center" style={{ minHeight: height }}>
              <div className="text-center">
                <Icon name="ScanLine" className="mx-auto h-8 w-8 animate-pulse text-cyan-400/60" />
                <p className="mt-3 font-display text-xs uppercase tracking-[0.2em] text-slate-400">
                  Loading public/models/corvette.bin
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="btn" onClick={() => jump(step - 1)} disabled={step <= 1}>
              <Icon name="ChevronRight" className="h-3.5 w-3.5 rotate-180" />
              Back
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setPlaying((p) => !p)}
              disabled={step >= total && !playing}
            >
              <Icon name={playing ? "Pause" : "Play"} className="h-3.5 w-3.5" />
              {playing ? "Pause" : "Assemble"}
            </button>
            <button type="button" className="btn" onClick={() => jump(step + 1)} disabled={step >= total}>
              Next
              <Icon name="ChevronRight" className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="btn-ghost" onClick={() => jump(total)}>
              <Icon name="FastForward" className="h-3.5 w-3.5" />
              Finish
            </button>
            <button type="button" className="btn-ghost" onClick={() => jump(1)}>
              <Icon name="RotateCcw" className="h-3.5 w-3.5" />
              Restart
            </button>
            <span className="ml-auto font-mono text-xs text-slate-300">
              step {String(step).padStart(2, "0")} / {total}
            </span>
          </div>

          {/* progress strip: one cell per module, in build order */}
          <div className="mt-3 flex flex-wrap gap-[3px]">
            {recipe.parts.map((p, i) => (
              <button
                key={`${p.assetId}-${i}`}
                type="button"
                title={`${i + 1}. ${assetLabel(p.assetId)}`}
                onClick={() => jump(i + 1)}
                className="h-5 w-3 border transition-colors"
                style={{
                  borderColor: i < step ? `${accent}aa` : "rgba(255,255,255,0.15)",
                  background: i === step - 1 ? accent : i < step ? `${accent}44` : "transparent",
                }}
              />
            ))}
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
            <span>fore</span>
            <span>{pct}% fitted</span>
            <span>aft</span>
          </div>
        </div>

        <aside className="w-full shrink-0 lg:w-[290px]">
          <div className="border border-white/10 bg-black/30 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              this step
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-100">
              {focus ? assetLabel(focus.assetId) : "-"}
            </p>
            <p className="font-mono text-[11px] text-cyan-300/80">{focus?.assetId}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-300">
              {focus
                ? `Fits to the ${ROLE_COPY[focus.role ?? "linked"] ?? "hull mount"}. Snap point ${focus.pos
                    .map((n) => n.toFixed(2))
                    .join(" / ")}, ${(focus.scale ?? 1).toFixed(2)}x scale.`
                : "Nothing placed yet."}
            </p>
            {focusBox ? (
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-white/40">
                occupied volume
                <br />
                x {focusBox.min[0].toFixed(2)} → {focusBox.max[0].toFixed(2)}
                <br />
                y {focusBox.min[1].toFixed(2)} → {focusBox.max[1].toFixed(2)}
                <br />
                z {focusBox.min[2].toFixed(2)} → {focusBox.max[2].toFixed(2)}
              </p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Chip accent={accent}>
              <span className="font-mono text-[10px]">{total} modules</span>
            </Chip>
            {mesh ? (
              <Chip accent="#fb923c">
                <span className="font-mono text-[10px]">
                  {mesh.parts.reduce((n, p) => n + p.faces.length, 0).toLocaleString()} tris drawn
                </span>
              </Chip>
            ) : null}
          </div>

          <ol className="mt-3 max-h-[300px] overflow-auto border border-white/10">
            {recipe.parts.map((p, i) => (
              <li key={`${p.assetId}-${i}`}>
                <button
                  type="button"
                  onClick={() => jump(i + 1)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-white/5"
                  style={i === step - 1 ? { background: `${accent}22` } : undefined}
                >
                  <span className="w-6 shrink-0 text-white/35">{String(i + 1).padStart(2, "0")}</span>
                  <span className={i < step ? "text-slate-200" : "text-white/40"}>
                    {assetLabel(p.assetId)}
                  </span>
                  {p.mirror ? <span className="ml-auto text-white/30">mirror</span> : null}
                </button>
              </li>
            ))}
          </ol>

          <HudLabel>Arrow keys step forward and back · click any cell to jump</HudLabel>
        </aside>
      </div>
    </Panel>
  );
}
