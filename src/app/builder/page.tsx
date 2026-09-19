"use client";

import { useMemo, useState } from "react";
import ShipViewPanel from "@/components/ShipViewPanel";
import PartPicker from "@/components/PartPicker";
import RequirementTracker from "@/components/RequirementTracker";
import ShoppingList from "@/components/ShoppingList";
import StatRadar from "@/components/StatRadar";
import { useBuild } from "@/components/BuildProvider";
import { Icon } from "@/components/Icon";
import { Chip, HudLabel, Panel, PanelHeader } from "@/components/ui";
import {
  addPart,
  clearBuild,
  computeStats,
  countByCategory,
  countParts,
  costBreakdown,
  formatUnits,
  removePartId,
  slotsOf,
} from "@/lib/build";
import { categories, categoryById, partById } from "@/lib/data";
import type { PartCategoryId } from "@/lib/types";

const REVIEW_STEP = categories.length;

export default function BuilderPage() {
  const { build, mutate, reset, saveToHangar, hydrated } = useBuild();
  const [step, setStep] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  const counts = useMemo(() => countByCategory(build), [build]);
  const stats = useMemo(() => computeStats(build), [build]);
  const cost = costBreakdown(build);
  const total = countParts(build);

  const isReview = step === REVIEW_STEP;
  const category = isReview ? null : categories[step];
  const selectedIds = category ? slotsOf(build, category.id) : [];

  function handleAdd(partId: string) {
    mutate((current) => addPart(current, partId));
    const part = partById[partId];
    if (part) setFlash(`${part.name} added`);
    window.setTimeout(() => setFlash(null), 1400);
  }

  function handleRemove(partId: string) {
    mutate((current) => removePartId(current, partId));
  }

  function handleClearCategory(categoryId: PartCategoryId) {
    mutate((current) => {
      const next = { ...current, slots: { ...current.slots } };
      delete next.slots[categoryId];
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <HudLabel>Mode 01</HudLabel>
          <h1 className="font-display text-2xl font-black uppercase tracking-[0.12em] text-slate-50">
            Manual <span className="text-cyan-300">Builder</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Assemble a Corvette in the same order the Workshop expects. Every
            module you place updates the schematic, the stats and the shopping
            list in real time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="panel-flat flex items-center gap-2 px-3 py-2">
            <Icon name="Wrench" className="h-4 w-4 text-cyan-300" />
            <input
              value={build.name}
              onChange={(event) =>
                mutate((current) => ({ ...current, name: event.target.value }))
              }
              aria-label="Build name"
              className="hud-mono w-52 border-none bg-transparent text-sm text-cyan-100 outline-none"
            />
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              saveToHangar();
              setFlash("Saved to hangar");
              window.setTimeout(() => setFlash(null), 1600);
            }}
          >
            <Icon name="Save" className="h-3.5 w-3.5" />
            Save
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (window.confirm("Clear every module from this build?")) reset();
            }}
          >
            <Icon name="Trash2" className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      </header>

      {flash ? (
        <div className="hud-mono border border-signal-400/40 bg-signal-400/10 px-3 py-2 text-xs text-signal-400">
          {flash}
        </div>
      ) : null}

      {/* step rail */}
      <div className="panel-flat flex flex-wrap items-center gap-1.5 p-2">
        {categories.map((item, index) => {
          const active = index === step;
          const done = (counts[item.id] ?? 0) > 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setStep(index)}
              className={`flex items-center gap-2 border px-2.5 py-1.5 transition ${
                active
                  ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                  : "border-white/8 text-slate-400 hover:border-cyan-400/25"
              }`}
            >
              <span
                className="grid h-5 w-5 place-items-center border text-[0.6rem]"
                style={{
                  borderColor: done ? `${item.accent}88` : "rgba(148,163,184,0.25)",
                  color: done ? item.accent : "#94a3b8",
                }}
              >
                {done ? <Icon name="Check" className="h-3 w-3" strokeWidth={3} /> : index + 1}
              </span>
              <span className="font-mono text-[0.62rem] uppercase tracking-wider">
                {item.singular}
              </span>
              {counts[item.id] ? (
                <span className="hud-mono text-[0.62rem] text-slate-500">
                  {counts[item.id]}
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setStep(REVIEW_STEP)}
          className={`flex items-center gap-2 border px-2.5 py-1.5 transition ${
            isReview
              ? "border-plasma-500/60 bg-plasma-500/15 text-plasma-300"
              : "border-white/8 text-slate-400 hover:border-plasma-500/30"
          }`}
        >
          <Icon name="ClipboardList" className="h-3.5 w-3.5" />
          <span className="font-mono text-[0.62rem] uppercase tracking-wider">
            Review &amp; shopping list
          </span>
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          {category ? (
            <Panel accent={category.accent} className="overflow-hidden">
              <PanelHeader
                title={`Step ${step + 1} · ${category.label}`}
                subtitle={category.note}
                accent={category.accent}
                icon={<Icon name={category.icon} className="h-4 w-4" />}
                right={
                  <div className="flex items-center gap-2">
                    {selectedIds.length > 0 ? (
                      <button
                        type="button"
                        className="btn btn-ghost px-2.5 py-1.5"
                        onClick={() => handleClearCategory(category.id)}
                      >
                        <Icon name="Trash2" className="h-3 w-3" />
                        Clear
                      </button>
                    ) : null}
                    <span className="hud-mono text-xs text-slate-400">
                      {selectedIds.length} placed
                    </span>
                  </div>
                }
              />

              <div className="p-4">
                <PartPicker
                  categoryId={category.id}
                  build={build}
                  accent={category.accent}
                  onAdd={handleAdd}
                  onRemove={handleRemove}
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/5 px-4 py-3">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={step === 0}
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  <Icon name="ChevronRight" className="h-3.5 w-3.5 rotate-180" />
                  Previous step
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    setStep((s) => Math.min(REVIEW_STEP, s + 1))
                  }
                >
                  {step === REVIEW_STEP - 1 ? "Review build" : "Next step"}
                  <Icon name="ChevronRight" className="h-3.5 w-3.5" />
                </button>
              </div>
            </Panel>
          ) : (
            <Panel accent="#ff7a1a" className="overflow-hidden">
              <PanelHeader
                title="Review & shopping list"
                subtitle="Exactly what to buy from the Workshop vendor and what to salvage in the wild."
                accent="#ff7a1a"
                icon={<Icon name="ClipboardList" className="h-4 w-4" />}
              />
              <div className="p-4">
                <ShoppingList build={build} />
              </div>
            </Panel>
          )}

          <ShipViewPanel
            build={build}
            height={420}
            title="Ship preview"
            subtitle="Your Corvette as built - drag to orbit, then flip to blueprint for the technical view."
          />
        </div>

        <div className="space-y-4">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Build telemetry"
              subtitle={stats.profile.join(" · ") || "Unclassified hull"}
              icon={<Icon name="Gauge" className="h-4 w-4" />}
              right={
                <span className="hud-mono text-xs text-cyan-200">
                  {total}/160
                </span>
              }
            />
            <div className="p-4">
              <StatRadar stats={stats} />
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-white/5 p-3">
              <div>
                <HudLabel>Estimated cost</HudLabel>
                <div className="hud-mono text-sm text-plasma-300">
                  {formatUnits(cost.total)} U
                </div>
              </div>
              <div>
                <HudLabel>Vendor portion</HudLabel>
                <div className="hud-mono text-sm text-slate-200">
                  {formatUnits(cost.buyable)} U
                </div>
              </div>
            </div>
          </Panel>

          <RequirementTracker build={build} />

          <Panel accent="#a3e635" className="overflow-hidden">
            <PanelHeader
              title="Placed modules"
              subtitle="The full manifest, grouped by section."
              accent="#a3e635"
              icon={<Icon name="Boxes" className="h-4 w-4" />}
            />
            <div className="space-y-2 p-3">
              {total === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-slate-500">
                  Nothing placed yet. Start with the landing gear &mdash; that is
                  how the Workshop builds outward.
                </p>
              ) : null}
              {categories.map((item) => {
                const ids = slotsOf(build, item.id);
                if (ids.length === 0) return null;
                const tally = new Map<string, number>();
                ids.forEach((id) => tally.set(id, (tally.get(id) ?? 0) + 1));
                return (
                  <div key={item.id} className="panel-flat px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span
                        className="hud-label"
                        style={{ color: `${item.accent}cc` }}
                      >
                        {item.label}
                      </span>
                      <span className="hud-mono text-[0.65rem] text-slate-500">
                        {ids.length} pcs
                      </span>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {[...tally.entries()].map(([id, qty]) => (
                        <li
                          key={id}
                          className="flex items-center justify-between gap-2 text-[0.72rem] text-slate-300"
                        >
                          <span className="truncate">
                            {qty}× {partById[id]?.name ?? id}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove one ${partById[id]?.name ?? id}`}
                            className="text-slate-500 transition hover:text-plasma-400"
                            onClick={() => handleRemove(id)}
                          >
                            <Icon name="X" className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Panel>

          {!hydrated ? (
            <p className="hud-mono text-center text-[0.65rem] text-slate-600">
              Restoring saved build…
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-slate-500">
        <Chip accent="#22d3ee">Tip</Chip>
        <span>
          Place Landing Gear first in-game, then build outward:{" "}
          {categoryById["landing"]?.note}
        </span>
      </div>
    </div>
  );
}
