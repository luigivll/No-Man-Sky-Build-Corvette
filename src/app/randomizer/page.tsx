"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import HullSchematic from "@/components/HullSchematic";
import RequirementTracker from "@/components/RequirementTracker";
import ShoppingList from "@/components/ShoppingList";
import StatRadar from "@/components/StatRadar";
import CopyButton from "@/components/CopyButton";
import { useBuild } from "@/components/BuildProvider";
import { Icon } from "@/components/Icon";
import { HudLabel, Panel, PanelHeader } from "@/components/ui";
import {
  buildToMarkdown,
  computeStats,
  countParts,
  costBreakdown,
  formatUnits,
  inventorySlots,
} from "@/lib/build";
import { meta } from "@/lib/data";
import {
  ROLE_DEFS,
  SIZE_OPTIONS,
  generateBuild,
  randomSeed,
  roleById,
  type GeneratorOptions,
  type SizeId,
} from "@/lib/randomizer";
import type { RoleId } from "@/lib/types";

const DEFAULT_OPTIONS: GeneratorOptions = {
  roles: ["combat"],
  size: "auto",
  salvageOnly: false,
  symmetry: true,
  seed: 0,
};

export default function RandomizerPage() {
  const { build, setBuild, saveToHangar } = useBuild();
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_OPTIONS);
  const [flash, setFlash] = useState<string | null>(null);
  const [rolled, setRolled] = useState(false);

  const roll = useCallback(
    (nextOptions: GeneratorOptions) => {
      const generated = generateBuild(nextOptions);
      setBuild(generated);
      setOptions(nextOptions);
      setRolled(true);
    },
    [setBuild],
  );

  // Initial roll: honour share-link parameters when present.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roles = (params.get("roles") ?? "")
      .split(",")
      .filter((r): r is RoleId => ROLE_DEFS.some((def) => def.id === r));
    const size = (params.get("size") ?? "auto") as SizeId;
    const seedParam = Number(params.get("seed"));
    const next: GeneratorOptions = {
      roles: roles.length > 0 ? roles : DEFAULT_OPTIONS.roles,
      size: SIZE_OPTIONS.some((s) => s.id === size) ? size : "auto",
      salvageOnly: params.get("salvage") === "1",
      symmetry: params.get("symmetry") === "1",
      seed: Number.isFinite(seedParam) && seedParam > 0 ? seedParam : randomSeed(),
    };
    roll(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL shareable without triggering a Next.js navigation.
  useEffect(() => {
    if (!rolled) return;
    const params = new URLSearchParams({
      roles: options.roles.join(","),
      size: options.size,
      seed: String(options.seed),
    });
    if (options.salvageOnly) params.set("salvage", "1");
    if (options.symmetry) params.set("symmetry", "1");
    window.history.replaceState(null, "", `/randomizer?${params.toString()}`);
  }, [options, rolled]);

  const stats = useMemo(() => computeStats(build), [build]);
  const cost = costBreakdown(build);
  const total = countParts(build);
  const shareUrl =
    typeof window !== "undefined" && rolled
      ? `${window.location.origin}/randomizer?roles=${options.roles.join(",")}&size=${options.size}&seed=${options.seed}${options.salvageOnly ? "&salvage=1" : ""}${options.symmetry ? "&symmetry=1" : ""}`
      : "";

  function toggleRole(role: RoleId) {
    setOptions((current) => {
      const has = current.roles.includes(role);
      const roles = has
        ? current.roles.filter((r) => r !== role)
        : [...current.roles, role];
      return { ...current, roles };
    });
  }

  function notify(message: string) {
    setFlash(message);
    window.setTimeout(() => setFlash(null), 1800);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <HudLabel>Mode 02</HudLabel>
          <h1 className="font-display text-2xl font-black uppercase tracking-[0.12em] text-slate-50">
            Randomizer &amp; <span className="plasma-text text-plasma-400">Aspect Generator</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Roll a Corvette weighted by role. Combat forces the heavy guns,
            Massive forces the Habs and Heavy Landing Gear, Exploration chases
            warp range and Minimalist keeps it under twenty modules.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-plasma"
            onClick={() => roll({ ...options, seed: randomSeed() })}
          >
            <Icon name="Dices" className="h-4 w-4" />
            Roll new hull
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              saveToHangar();
              notify("Saved to hangar");
            }}
          >
            <Icon name="Save" className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </header>

      {flash ? (
        <div className="hud-mono border border-signal-400/40 bg-signal-400/10 px-3 py-2 text-xs text-signal-400">
          {flash}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <Panel accent="#ff7a1a" className="overflow-hidden">
            <PanelHeader
              title="Role weighting"
              subtitle="Pick any combination - the generator blends the rules."
              accent="#ff7a1a"
              icon={<Icon name="SlidersHorizontal" className="h-4 w-4" />}
            />
            <div className="space-y-2 p-3">
              {ROLE_DEFS.map((role) => {
                const active = options.roles.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={`w-full border px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-white/[0.03]"
                        : "border-white/8 hover:border-white/20"
                    }`}
                    style={active ? { borderColor: `${role.accent}88` } : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="grid h-7 w-7 place-items-center border"
                        style={{
                          borderColor: `${role.accent}66`,
                          background: active ? `${role.accent}22` : "transparent",
                          color: role.accent,
                        }}
                      >
                        <Icon name={role.icon} className="h-3.5 w-3.5" />
                      </span>
                      <span
                        className="font-display text-xs uppercase tracking-[0.14em]"
                        style={{ color: active ? role.accent : "#94a3b8" }}
                      >
                        {role.label}
                      </span>
                      <span
                        className="ml-auto grid h-4 w-4 place-items-center border"
                        style={{
                          borderColor: active ? `${role.accent}88` : "#47556966",
                          background: active ? `${role.accent}22` : "transparent",
                          color: role.accent,
                        }}
                      >
                        {active ? (
                          <Icon name="Check" className="h-3 w-3" strokeWidth={3} />
                        ) : null}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.72rem] text-slate-400">
                      {role.tagline}
                    </p>
                    {active ? (
                      <ul className="mt-1.5 space-y-0.5">
                        {role.rules.map((rule) => (
                          <li
                            key={rule}
                            className="flex items-start gap-1.5 text-[0.68rem] text-slate-500"
                          >
                            <Icon
                              name="ChevronRight"
                              className="mt-0.5 h-2.5 w-2.5 shrink-0"
                              strokeWidth={3}
                            />
                            {rule}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </button>
                );
              })}
              {options.roles.length === 0 ? (
                <p className="px-1 text-[0.7rem] text-slate-500">
                  No role selected: the generator falls back to a balanced
                  all-rounder weighting.
                </p>
              ) : null}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Generation parameters"
              icon={<Icon name="Ruler" className="h-4 w-4" />}
            />
            <div className="space-y-3 p-3">
              <div>
                <HudLabel>Hull size</HudLabel>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SIZE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        setOptions((current) => ({ ...current, size: option.id }))
                      }
                      className={`border px-2.5 py-1.5 font-mono text-[0.62rem] uppercase tracking-wider transition ${
                        options.size === option.id
                          ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                          : "border-white/10 text-slate-400 hover:border-cyan-400/30"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setOptions((current) => ({
                      ...current,
                      salvageOnly: !current.salvageOnly,
                    }))
                  }
                  className={`flex items-center gap-2 border px-2.5 py-1.5 font-mono text-[0.62rem] uppercase tracking-wider transition ${
                    options.salvageOnly
                      ? "border-plasma-500/60 bg-plasma-500/15 text-plasma-300"
                      : "border-white/10 text-slate-400 hover:border-plasma-500/30"
                  }`}
                >
                  <Icon name="Boxes" className="h-3.5 w-3.5" />
                  Salvage-first sourcing
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setOptions((current) => ({
                      ...current,
                      symmetry: !current.symmetry,
                    }))
                  }
                  className={`flex items-center gap-2 border px-2.5 py-1.5 font-mono text-[0.62rem] uppercase tracking-wider transition ${
                    options.symmetry
                      ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                      : "border-white/10 text-slate-400 hover:border-cyan-400/30"
                  }`}
                >
                  <Icon name="Ruler" className="h-3.5 w-3.5" />
                  Symmetry lock
                </button>
              </div>

              <div className="flex items-end gap-2">
                <label className="flex-1">
                  <HudLabel>Seed</HudLabel>
                  <input
                    type="number"
                    value={options.seed}
                    onChange={(event) =>
                      setOptions((current) => ({
                        ...current,
                        seed: Number(event.target.value) || 1,
                      }))
                    }
                    className="hud-mono mt-1 w-full border border-white/10 bg-void-900/80 px-2.5 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-400/50"
                  />
                </label>
                <button
                  type="button"
                  className="btn"
                  onClick={() => roll(options)}
                >
                  <Icon name="RefreshCw" className="h-3.5 w-3.5" />
                  Apply
                </button>
              </div>

              <p className="text-[0.68rem] leading-relaxed text-slate-500">
                Seeds are deterministic: the same seed, roles and size always
                produce the identical module list, so you can share a link and
                your friend flies the same ship.
              </p>
            </div>
          </Panel>

          <RequirementTracker build={build} />
        </div>

        <div className="space-y-4">
          <Panel accent="#a855f7" className="overflow-hidden">
            <PanelHeader
              title={build.name}
              subtitle={build.designation ?? "Generated configuration"}
              accent="#a855f7"
              icon={<Icon name="Sparkles" className="h-4 w-4" />}
              right={
                <span className="hud-mono text-[0.65rem] text-slate-500">
                  seed {options.seed}
                </span>
              }
            />
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              <div>
                <HudLabel>Class profile</HudLabel>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {stats.profile.length > 0 ? (
                    stats.profile.map((label) => (
                      <span
                        key={label}
                        className="chip"
                        style={{ borderColor: "#a855f766", color: "#d8b4fe" }}
                      >
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="chip">Balanced hull</span>
                  )}
                </div>
                <dl className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Modules</dt>
                    <dd className="hud-mono text-cyan-200">
                      {total}/{meta.maxParts}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Inventory slots</dt>
                    <dd className="hud-mono text-signal-400">
                      +{inventorySlots(build)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Estimated cost</dt>
                    <dd className="hud-mono text-plasma-300">
                      {formatUnits(cost.total)} U
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Vendor portion</dt>
                    <dd className="hud-mono text-slate-300">
                      {formatUnits(cost.buyable)} U
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Roles</dt>
                    <dd className="hud-mono text-slate-300">
                      {options.roles.length > 0
                        ? options.roles.map((r) => roleById[r].short).join(" + ")
                        : "Balanced"}
                    </dd>
                  </div>
                </dl>
              </div>
              <StatRadar stats={stats} compact />
            </div>

            {build.rationale && build.rationale.length > 0 ? (
              <div className="border-t border-white/5 px-3 py-3">
                <HudLabel>Why these parts</HudLabel>
                <ul className="mt-1.5 space-y-1">
                  {build.rationale.map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-2 text-[0.72rem] text-slate-400"
                    >
                      <Icon
                        name="ChevronRight"
                        className="mt-0.5 h-3 w-3 shrink-0 text-violet-glow"
                        strokeWidth={3}
                      />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-3 py-3">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setBuild({ ...build, origin: "manual" });
                  notify("Loaded into the builder");
                }}
              >
                <Icon name="Wrench" className="h-3.5 w-3.5" />
                Edit in builder
              </button>
              <CopyButton text={() => buildToMarkdown(build)} label="Copy manifest" />
              {shareUrl ? (
                <CopyButton
                  text={shareUrl}
                  label="Copy share link"
                  icon="Link2"
                  copiedLabel="Link copied"
                />
              ) : null}
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Hull schematic"
              subtitle="Procedural projection of the generated hull."
              icon={<Icon name="ScanLine" className="h-4 w-4" />}
            />
            <HullSchematic build={build} height={340} />
          </Panel>

          <Panel accent="#ff7a1a" className="overflow-hidden">
            <PanelHeader
              title="Shopping list"
              subtitle="Buy list and salvage hunt list, priced."
              accent="#ff7a1a"
              icon={<Icon name="ClipboardList" className="h-4 w-4" />}
            />
            <div className="p-4">
              <ShoppingList build={build} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
