"use client";

import { useMemo, useState } from "react";
import { useShipyard } from "@/lib/store";
import { useAssembly } from "@/lib/useAssembly";
import { PAINT_ROLES, type PaintRole, type Palette } from "@/domain/types";
import { CATEGORY_META, BUILD_LIMITS } from "@/domain/constants";
import { PALETTES } from "@/domain/palettes";
import { PART_BY_ID } from "@/domain/parts";
import { UNIT_TO_METRES } from "@/domain/constants";
import { Button, Meter, Panel, SectionTitle, Stat, Swatch } from "./ui";
import { cx, formatUnits } from "@/lib/cx";

type Tab = "telemetry" | "palette" | "shopping";

export function InspectorPanel() {
  const { assembly, verdict } = useAssembly();
  const [tab, setTab] = useState<Tab>("telemetry");

  return (
    <Panel className="flex h-full min-h-0 flex-col overflow-hidden">
      <SectionTitle
        right={
          <span
            className={cx(
              "rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
              verdict.flyable ? "border-verdant/40 bg-verdant/10 text-verdant" : "border-alarm/40 bg-alarm/10 text-alarm",
            )}
          >
            {verdict.flyable ? "Flyable" : "Blocked"}
          </span>
        }
      >
        Inspector
      </SectionTitle>

      <div className="flex shrink-0 gap-1 border-b border-edge/70 p-2">
        {(
          [
            ["telemetry", "Telemetry"],
            ["palette", "Paint"],
            ["shopping", "Shopping List"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cx(
              "flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all",
              tab === key ? "bg-plasma/12 text-plasma" : "text-ink-faint hover:text-ink-dim",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "telemetry" && <Telemetry />}
        {tab === "palette" && <PaintEditor />}
        {tab === "shopping" && <ShoppingTab />}
      </div>

      <div className="shrink-0 border-t border-edge/70 p-3">
        <Meter
          label="Module budget"
          value={assembly.stats.partCount}
          max={BUILD_LIMITS.maxParts}
          color={assembly.stats.partCount > BUILD_LIMITS.maxParts ? "var(--color-alarm)" : "var(--color-plasma)"}
        />
        <div className="mt-2">
          <Meter
            label="Recommended storeys"
            value={assembly.stats.floors}
            max={BUILD_LIMITS.maxFloors}
            color={assembly.stats.floors > BUILD_LIMITS.maxFloors ? "var(--color-fusion)" : "var(--color-verdant)"}
          />
        </div>
      </div>
    </Panel>
  );
}

function Telemetry() {
  const { assembly, verdict } = useAssembly();
  const stats = assembly.stats;
  const selectedId = useShipyard((state) => state.selectedId);
  const selected = assembly.parts.find((part) => part.placement.id === selectedId);
  const removePart = useShipyard((state) => state.removePart);
  const duplicatePart = useShipyard((state) => state.duplicatePart);
  const setRole = useShipyard((state) => state.setRole);
  const setOffset = useShipyard((state) => state.setOffset);
  const setRotation = useShipyard((state) => state.setRotation);
  const resetTransform = useShipyard((state) => state.resetTransform);
  const transformMode = useShipyard((state) => state.transformMode);
  const setTransformMode = useShipyard((state) => state.setTransformMode);

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Modules" value={stats.partCount} accent="var(--color-plasma)" />
        <Stat label="Storeys" value={stats.floors} accent={stats.floors > BUILD_LIMITS.maxFloors ? "var(--color-fusion)" : undefined} />
        <Stat label="Class" value={stats.bestClass} accent="var(--color-fusion)" />
        <Stat label="Length" value={`${(stats.length * UNIT_TO_METRES).toFixed(1)}m`} />
        <Stat label="Beam" value={`${(stats.width * UNIT_TO_METRES).toFixed(1)}m`} />
        <Stat label="Height" value={`${(stats.height * UNIT_TO_METRES).toFixed(1)}m`} />
        <Stat label="Mass" value={stats.mass} />
        <Stat label="Cargo" value={stats.cargoSlots} accent="var(--color-verdant)" />
        <Stat label="Cost" value={formatUnits(stats.estimatedCost)} accent="var(--color-fusion)" />
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Shield" value={Math.round(stats.shield)} accent="#6ea8ff" />
        <Stat label="Weapons" value={Math.round(stats.weapon)} accent="#ff4d6d" />
        <Stat label="Speed" value={Math.round(stats.speed)} accent="#ff9f6e" />
        <Stat label="Maneuver" value={Math.round(stats.manoeuvre)} accent="#a98bff" />
        <Stat label="Boost" value={Math.round(stats.boost)} accent="#4ee1ff" />
        <Stat
          label="Power"
          value={`${Math.round(stats.powerSupply)}/${Math.round(stats.powerDraw)}`}
          accent={stats.powerDraw > stats.powerSupply ? "var(--color-alarm)" : "var(--color-verdant)"}
          hint="supplied / drawn"
        />
      </div>

      {verdict.issues.length > 0 && (
        <div className="space-y-1">
          <p className="label">Workshop verdict</p>
          {verdict.issues.map((issue) => (
            <div
              key={issue.code}
              className={cx(
                "panel-inset px-2.5 py-1.5 text-[10px] leading-relaxed",
                issue.level === "error" && "border-alarm/40 text-alarm",
                issue.level === "warning" && "border-fusion/40 text-fusion",
                issue.level === "info" && "text-ink-faint",
              )}
            >
              {issue.message}
            </div>
          ))}
        </div>
      )}

      {selected ? (
        <div className="panel-inset space-y-2 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-ink">{selected.part.name}</p>
              <p className="text-[9px] text-ink-faint">
                {CATEGORY_META[selected.part.category].label} · class {selected.part.class} · storey {selected.floor + 1}
              </p>
            </div>
            <Swatch color={useShipyard.getState().document.palette[selected.placement.role ?? "primary"]} />
          </div>

          <div>
            <p className="label mb-1">3D gizmo</p>
            <div className="flex gap-1">
              {(
                [
                  ["translate", "Move (W)"],
                  ["rotate", "Rotate (E)"],
                  ["off", "Hide (Esc)"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTransformMode(key)}
                  className={cx(
                    "flex-1 rounded border px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors",
                    transformMode === key
                      ? "border-fusion/50 bg-fusion/12 text-fusion"
                      : "border-edge text-ink-faint hover:text-ink-dim",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label mb-1">Paint role</p>
            <div className="flex flex-wrap gap-1">
              {PAINT_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRole(selected.placement.id, role)}
                  className={cx(
                    "rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide transition-colors",
                    selected.placement.role === role
                      ? "border-plasma/50 bg-plasma/12 text-plasma"
                      : "border-edge text-ink-faint hover:text-ink-dim",
                  )}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label mb-1">Offset from snap point (build units · 1 ≈ 1.5 m)</p>
            <div className="space-y-1">
              {(["x", "y", "z"] as const).map((axis) => (
                <div key={axis} className="flex items-center gap-1.5">
                  <span className="telemetry w-3 text-[10px] uppercase text-plasma">{axis}</span>
                  <input
                    type="range"
                    min={-6}
                    max={6}
                    step={0.05}
                    value={selected.placement.offset?.[axis] ?? 0}
                    onChange={(event) =>
                      setOffset(selected.placement.id, {
                        x: selected.placement.offset?.x ?? 0,
                        y: selected.placement.offset?.y ?? 0,
                        z: selected.placement.offset?.z ?? 0,
                        [axis]: Number(event.target.value),
                      })
                    }
                    className="flex-1 accent-plasma"
                  />
                  <input
                    type="number"
                    step={0.05}
                    value={round2(selected.placement.offset?.[axis] ?? 0)}
                    onChange={(event) =>
                      setOffset(selected.placement.id, {
                        x: selected.placement.offset?.x ?? 0,
                        y: selected.placement.offset?.y ?? 0,
                        z: selected.placement.offset?.z ?? 0,
                        [axis]: Number(event.target.value),
                      })
                    }
                    className="panel-inset telemetry w-16 px-1.5 py-0.5 text-right text-[10px] outline-none focus:border-plasma/50"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="label mb-1">Rotation (degrees, relative to the snap node)</p>
            <div className="space-y-1">
              {(["x", "y", "z"] as const).map((axis) => (
                <div key={axis} className="flex items-center gap-1.5">
                  <span className="telemetry w-3 text-[10px] uppercase text-fusion">{axis}</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={selected.placement.rotation?.[axis] ?? 0}
                    onChange={(event) =>
                      setRotation(selected.placement.id, {
                        x: selected.placement.rotation?.x ?? 0,
                        y: selected.placement.rotation?.y ?? 0,
                        z: selected.placement.rotation?.z ?? 0,
                        [axis]: Number(event.target.value),
                      })
                    }
                    className="flex-1 accent-fusion"
                  />
                  <input
                    type="number"
                    step={1}
                    value={round2(selected.placement.rotation?.[axis] ?? 0)}
                    onChange={(event) =>
                      setRotation(selected.placement.id, {
                        x: selected.placement.rotation?.x ?? 0,
                        y: selected.placement.rotation?.y ?? 0,
                        z: selected.placement.rotation?.z ?? 0,
                        [axis]: Number(event.target.value),
                      })
                    }
                    className="panel-inset telemetry w-16 px-1.5 py-0.5 text-right text-[10px] outline-none focus:border-fusion/50"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-1.5 pt-1">
            <Button size="sm" className="flex-1" onClick={() => duplicatePart(selected.placement.id)}>
              Duplicate
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => resetTransform(selected.placement.id)}
              title="Clear offset and rotation (0)"
            >
              Reset
            </Button>
            <Button size="sm" variant="danger" className="flex-1" onClick={() => removePart(selected.placement.id)}>
              Delete
            </Button>
          </div>
          <p className="text-[9px] leading-relaxed text-ink-faint">
            Drag the gizmo in the viewport, or use these fields. Offsets are relative to the snap
            point, so children stay attached and move with the module.
          </p>
        </div>
      ) : (
        <p className="panel-inset px-2.5 py-2 text-[10px] text-ink-faint">
          Click any module in the viewport to inspect it, re-paint it, nudge it or delete it.
        </p>
      )}
    </div>
  );
}

function PaintEditor() {
  const palette = useShipyard((state) => state.document.palette);
  const applyPresetPalette = useShipyard((state) => state.applyPresetPalette);
  const setPaletteColor = useShipyard((state) => state.setPaletteColor);
  const setPaletteName = useShipyard((state) => state.setPaletteName);
  const setWear = useShipyard((state) => state.setWear);

  return (
    <div className="space-y-3 p-3">
      <div>
        <p className="label mb-1.5">Scheme name</p>
        <input
          value={palette.name}
          onChange={(event) => setPaletteName(event.target.value)}
          className="panel-inset w-full px-2.5 py-1.5 text-[11px] outline-none focus:border-plasma/50"
        />
      </div>

      <div className="space-y-1.5">
        {PAINT_ROLES.map((role) => (
          <label key={role} className="flex items-center gap-2">
            <input
              type="color"
              value={palette[role]}
              onChange={(event) => setPaletteColor(role as keyof Palette, event.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-edge bg-transparent"
            />
            <span className="flex-1 text-[10px] uppercase tracking-wider text-ink-dim">{role}</span>
            <span className="telemetry text-[10px] text-ink-faint">{palette[role]}</span>
          </label>
        ))}
      </div>

      <div>
        <p className="label mb-1">
          Weathering <span className="telemetry ml-1 text-plasma">{Math.round(palette.wear * 100)}%</span>
        </p>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(palette.wear * 100)}
          onChange={(event) => setWear(Number(event.target.value) / 100)}
          className="w-full accent-fusion"
        />
      </div>

      <div>
        <p className="label mb-1.5">Presets</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PALETTES.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPresetPalette(preset)}
              className={cx(
                "rounded-lg border px-2 py-1.5 text-left transition-all",
                palette.name === preset.name ? "border-plasma/50 bg-plasma/10" : "border-edge hover:border-edge-bright",
              )}
            >
              <span className="mb-1 flex gap-0.5">
                {[preset.primary, preset.secondary, preset.accent, preset.emissive].map((color) => (
                  <Swatch key={color} color={color} />
                ))}
              </span>
              <span className="block truncate text-[9px] text-ink-dim">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShoppingTab() {
  const { document, assembly } = useAssembly();

  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const placement of document.placements) {
      counts.set(placement.partId, (counts.get(placement.partId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([partId, count]) => ({ part: PART_BY_ID.get(partId)!, count }))
      .filter((row) => row.part)
      .sort((a, b) => b.count - a.count || a.part.name.localeCompare(b.part.name));
  }, [document.placements]);

  return (
    <div className="p-3">
      <p className="label mb-2">
        {assembly.stats.partCount} modules · {rows.length} distinct
      </p>
      <div className="space-y-1">
        {rows.map(({ part, count }) => (
          <div key={part.id} className="panel-inset flex items-center gap-2 px-2.5 py-1.5">
            <span className="telemetry w-7 shrink-0 text-[11px] font-bold text-plasma">{count}×</span>
            <span className="flex-1 truncate text-[10px] text-ink">{part.name}</span>
            <span className="telemetry shrink-0 text-[9px] text-fusion">
              {part.price ? formatUnits(part.price * count) : "trade"}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
        Buying every module new would cost{" "}
        <span className="telemetry text-fusion">{formatUnits(assembly.stats.estimatedCost)}</span> Units. Salvageable
        Scrap and the workshop trade terminal are much cheaper — basic modules cannot be traded for, everything else can.
      </p>
    </div>
  );
}

export const ROLE_HINT: Record<PaintRole, string> = {
  primary: "Main hull plating",
  secondary: "Secondary structure",
  accent: "Stripes and highlights",
  trim: "Dark mechanical trim",
  glass: "Canopies and viewports",
  emissive: "Engine and reactor glow",
};

/** Keeps controlled number inputs from fighting trailing decimals. */
const round2 = (value: number): number => Math.round(value * 100) / 100;
