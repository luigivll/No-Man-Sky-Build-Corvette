"use client";

import { useMemo, useState } from "react";
import { useShipyard } from "@/lib/store";
import { useAssembly } from "@/lib/useAssembly";
import { PARTS, partsByCategory } from "@/domain/parts";
import { BLUEPRINTS, GROUP_LABELS } from "@/data/blueprints";
import { CATEGORY_META, CATEGORY_ORDER, BUILD_LIMITS, HARDPOINT_CATEGORIES } from "@/domain/constants";
import { FLIGHT_CRITICAL } from "@/domain/types";
import { BASE_META, TAG_META } from "@/domain/constants";
import type { BlueprintGroup, DesignBase, DesignTag, PaintRole, PartCategory } from "@/domain/types";
import { Button, Chip, Panel, SectionTitle, Swatch } from "./ui";
import { cx, formatUnits } from "@/lib/cx";

const GROUP_ORDER: BlueprintGroup[] = ["star-wars", "marvel", "dc", "classic-scifi", "anime", "videogames"];

export function LibraryPanel() {
  const mode = useShipyard((state) => state.mode);
  const setMode = useShipyard((state) => state.setMode);

  return (
    <Panel className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 gap-1 border-b border-edge/70 p-2">
        {(
          [
            ["manual", "Manual Builder"],
            ["generator", "Fusion Generator"],
            ["hangar", "Badass Hangar"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={cx(
              "flex-1 rounded-lg border px-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-all",
              mode === key
                ? "border-plasma/50 bg-plasma/12 text-plasma shadow-[0_0_20px_-10px_#4ee1ff]"
                : "border-transparent text-ink-faint hover:bg-white/[0.04] hover:text-ink-dim",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "manual" && <ManualBuilder />}
        {mode === "generator" && <FusionGenerator />}
        {mode === "hangar" && <BadassHangar />}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Manual builder                                                      */
/* ------------------------------------------------------------------ */

function ManualBuilder() {
  const { assembly, verdict } = useAssembly();
  const addPart = useShipyard((state) => state.addPart);
  const showSnapPoints = useShipyard((state) => state.showSnapPoints);
  const toggle = useShipyard((state) => state.toggle);
  const [category, setCategory] = useState<PartCategory>("habitation");
  const [query, setQuery] = useState("");

  const freeNodes = useMemo(
    () =>
      assembly.freeNodes
        .map((free) => {
          const parent = assembly.parts.find((part) => part.placement.id === free.placementId);
          return parent ? { ...free, parent } : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .filter((entry) => entry.node.accepts.includes(category))
        .filter((entry) => !entry.node.id.startsWith("hp-") || HARDPOINT_CATEGORIES.includes(category)),
    [assembly, category],
  );

  const parts = useMemo(() => {
    const list = partsByCategory(category);
    const needle = query.trim().toLowerCase();
    return needle ? list.filter((part) => part.name.toLowerCase().includes(needle)) : list;
  }, [category, query]);

  return (
    <div className="space-y-3 p-3">
      <div className="panel-inset p-3">
        <p className="label mb-2">Required for flight</p>
        <div className="flex flex-wrap gap-1">
          {FLIGHT_CRITICAL.map((needed) => {
            const have = verdict.counts[needed] ?? 0;
            return (
              <span
                key={needed}
                className={cx(
                  "rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                  have > 0 ? "border-verdant/40 bg-verdant/10 text-verdant" : "border-alarm/40 bg-alarm/10 text-alarm",
                )}
              >
                {CATEGORY_META[needed].short} {have > 0 ? "✓" : "!"}
              </span>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-ink-faint">
          {assembly.stats.partCount}/{BUILD_LIMITS.maxParts} modules · {assembly.stats.floors}/{BUILD_LIMITS.maxFloors}{" "}
          storeys
        </p>
      </div>

      <div>
        <p className="label mb-1.5">1 · Choose a category</p>
        <div className="flex flex-wrap gap-1">
          {CATEGORY_ORDER.map((key) => (
            <Chip key={key} active={category === key} onClick={() => setCategory(key)}>
              {CATEGORY_META[key].short}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">{CATEGORY_META[category].blurb}</p>
      </div>

      <div>
        <p className="label mb-1.5">2 · Pick where it snaps</p>
        <button
          type="button"
          onClick={() => toggle("showSnapPoints")}
          className={cx(
            "mb-2 w-full rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all",
            showSnapPoints
              ? "border-plasma/50 bg-plasma/12 text-plasma"
              : "border-edge bg-white/[0.02] text-ink-faint hover:text-ink-dim",
          )}
        >
          {showSnapPoints ? "Snap points visible in 3D" : "Show snap points in 3D"}
        </button>
        <div className="space-y-1">
          {freeNodes.slice(0, 14).map((entry) => (
            <button
              key={`${entry.placementId}:${entry.node.id}`}
              type="button"
              onClick={() => {
                const first = parts[0];
                if (first) addPart(first.id, entry.placementId, entry.node.id);
              }}
              className="panel-inset flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[10px] transition-colors hover:border-plasma/40"
            >
              <span className="truncate text-ink-dim">{entry.parent.part.name}</span>
              <span className="telemetry shrink-0 text-[9px] text-plasma">
                {entry.node.id} · {entry.node.slots - entry.occupied} free
              </span>
            </button>
          ))}
          {freeNodes.length === 0 && (
            <p className="text-[10px] text-ink-faint">No free node accepts a {CATEGORY_META[category].label} module yet.</p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="label">3 · Module</p>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="filter…"
            className="panel-inset w-28 px-2 py-1 text-[10px] outline-none placeholder:text-ink-faint focus:border-plasma/50"
          />
        </div>
        <div className="space-y-1">
          {parts.map((part) => (
            <div key={part.id} className="panel-inset px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] text-ink">{part.name}</span>
                <span className="telemetry shrink-0 text-[9px] text-fusion">
                  {part.price ? formatUnits(part.price) : "trade"}
                </span>
              </div>
              <p className="mt-0.5 text-[9px] text-ink-faint">{part.blurb}</p>
              <div className="mt-1.5 flex gap-1">
                {freeNodes.slice(0, 3).map((entry) => (
                  <button
                    key={`${part.id}-${entry.placementId}-${entry.node.id}`}
                    type="button"
                    onClick={() => addPart(part.id, entry.placementId, entry.node.id)}
                    className="rounded border border-edge px-1.5 py-0.5 text-[9px] text-ink-dim transition-colors hover:border-plasma/50 hover:text-plasma"
                  >
                    + {entry.parent.part.name.split(" ")[0]} · {entry.node.id}
                  </button>
                ))}
                {freeNodes.length === 0 && (
                  <button
                    type="button"
                    onClick={() => addPart(part.id, null, null)}
                    className="rounded border border-edge px-1.5 py-0.5 text-[9px] text-ink-dim hover:border-plasma/50 hover:text-plasma"
                  >
                    + as root
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fusion generator                                                    */
/* ------------------------------------------------------------------ */

function FusionGenerator() {
  const { tag, base, seed, complexity, setGeneratorOption, runGenerator, rerollSeed } = useShipyard();

  return (
    <div className="space-y-4 p-3">
      <div>
        <p className="label mb-1.5">Design tag</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(TAG_META) as DesignTag[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setGeneratorOption("tag", key)}
              className={cx(
                "rounded-lg border px-2 py-2 text-left transition-all",
                tag === key ? "border-plasma/50 bg-plasma/10" : "border-edge bg-white/[0.02] hover:border-edge-bright",
              )}
            >
              <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: TAG_META[key].accent }}>
                {TAG_META[key].label}
              </span>
              <span className="mt-0.5 block text-[9px] leading-snug text-ink-faint">{TAG_META[key].blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label mb-1.5">Design base</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(BASE_META) as DesignBase[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setGeneratorOption("base", key)}
              className={cx(
                "rounded-lg border px-2 py-2 text-left transition-all",
                base === key ? "border-fusion/50 bg-fusion/10" : "border-edge bg-white/[0.02] hover:border-edge-bright",
              )}
            >
              <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: BASE_META[key].accent }}>
                {BASE_META[key].label}
              </span>
              <span className="mt-0.5 block text-[9px] leading-snug text-ink-faint">{BASE_META[key].blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label mb-1.5">
          Complexity <span className="telemetry ml-1 text-plasma">{complexity}</span>
        </p>
        <input
          type="range"
          min={12}
          max={BUILD_LIMITS.maxParts}
          value={complexity}
          onChange={(event) => setGeneratorOption("complexity", Number(event.target.value))}
          className="w-full accent-plasma"
        />
        <div className="mt-0.5 flex justify-between text-[9px] text-ink-faint">
          <span>skiff</span>
          <span>capital-ish</span>
        </div>
      </div>

      <div>
        <p className="label mb-1.5">Seed</p>
        <div className="flex gap-1.5">
          <input
            type="number"
            value={seed}
            onChange={(event) => setGeneratorOption("seed", Number(event.target.value))}
            className="panel-inset telemetry flex-1 px-2 py-1.5 text-[11px] text-plasma outline-none focus:border-plasma/50"
          />
          <Button size="sm" onClick={rerollSeed}>
            Reroll
          </Button>
        </div>
        <p className="mt-1.5 text-[9px] text-ink-faint">Same seed + same options always rebuilds the same hull.</p>
      </div>

      <Button variant="primary" className="w-full" onClick={() => runGenerator()}>
        Generate fusion
      </Button>
      <p className="text-center text-[9px] text-ink-faint">{PARTS.length} modules in the catalogue</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badass Hangar                                                       */
/* ------------------------------------------------------------------ */

function BadassHangar() {
  const loadBlueprint = useShipyard((state) => state.loadBlueprint);
  const [group, setGroup] = useState<BlueprintGroup | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return BLUEPRINTS.filter((blueprint) => (group === "all" ? true : blueprint.group === group)).filter(
      (blueprint) =>
        needle === "" ||
        blueprint.name.toLowerCase().includes(needle) ||
        blueprint.franchise.toLowerCase().includes(needle) ||
        blueprint.tagline.toLowerCase().includes(needle),
    );
  }, [group, query]);

  return (
    <div className="space-y-3 p-3">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search 50 ships…"
        className="panel-inset w-full px-3 py-2 text-[11px] outline-none placeholder:text-ink-faint focus:border-plasma/50"
      />
      <div className="flex flex-wrap gap-1">
        <Chip active={group === "all"} onClick={() => setGroup("all")}>
          All 50
        </Chip>
        {GROUP_ORDER.map((key) => (
          <Chip key={key} active={group === key} onClick={() => setGroup(key)}>
            {GROUP_LABELS[key].split(" ")[0]}
          </Chip>
        ))}
      </div>

      <div className="space-y-1.5">
        {filtered.map((blueprint) => (
          <button
            key={blueprint.id}
            type="button"
            onClick={() => loadBlueprint(blueprint.id)}
            className="panel-inset group block w-full px-2.5 py-2 text-left transition-all hover:border-plasma/40 hover:bg-plasma/[0.04]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold text-ink group-hover:text-plasma">
                {blueprint.name}
              </span>
              <span className="flex shrink-0 gap-0.5">
                {[blueprint.palette.primary, blueprint.palette.secondary, blueprint.palette.accent].map((color) => (
                  <Swatch key={color} color={color} />
                ))}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[9px] text-ink-faint">
              {blueprint.franchise} · {blueprint.tagline}
            </p>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-[10px] text-ink-faint">Nothing matches that search.</p>}
      </div>
    </div>
  );
}

export const ROLE_LABELS: Record<PaintRole, string> = {
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent",
  trim: "Trim",
  glass: "Glass",
  emissive: "Emissive",
};
