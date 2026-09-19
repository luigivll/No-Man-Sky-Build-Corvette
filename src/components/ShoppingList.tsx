"use client";

import { useMemo, useState } from "react";
import {
  buildToMarkdown,
  costBreakdown,
  countParts,
  formatNumber,
  formatUnits,
  inventorySlots,
  shoppingList,
  totalMass,
} from "@/lib/build";
import { meta, sourceLabels } from "@/lib/data";
import type { Build } from "@/lib/types";
import CopyButton from "./CopyButton";
import { Icon } from "./Icon";
import { HudLabel } from "./ui";

export default function ShoppingList({
  build,
  showExport = true,
}: {
  build: Build;
  showExport?: boolean;
}) {
  const groups = useMemo(() => shoppingList(build), [build]);
  const cost = useMemo(() => costBreakdown(build), [build]);
  const [owned, setOwned] = useState<Record<string, boolean>>({});
  const total = countParts(build);
  const acquired = Object.values(owned).filter(Boolean).length;
  const progress = total > 0 ? Math.round((acquired / total) * 100) : 0;

  const buyEntries = groups.flatMap((g) =>
    g.entries.filter((e) => e.part.buyable),
  );
  const huntEntries = groups.flatMap((g) =>
    g.entries.filter((e) => !e.part.buyable),
  );

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  const slug = build.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="panel-flat px-3 py-2">
          <HudLabel>Modules</HudLabel>
          <div className="hud-mono text-base text-cyan-200">
            {total}
            <span className="text-xs text-slate-500"> / {meta.maxParts}</span>
          </div>
        </div>
        <div className="panel-flat px-3 py-2">
          <HudLabel>Est. cost</HudLabel>
          <div className="hud-mono text-base text-plasma-300">
            {formatUnits(cost.total)}
          </div>
          <div className="text-[0.65rem] text-slate-500">Units</div>
        </div>
        <div className="panel-flat px-3 py-2">
          <HudLabel>Inventory</HudLabel>
          <div className="hud-mono text-base text-signal-400">
            +{inventorySlots(build)}
          </div>
          <div className="text-[0.65rem] text-slate-500">slots</div>
        </div>
        <div className="panel-flat px-3 py-2">
          <HudLabel>Hull mass</HudLabel>
          <div className="hud-mono text-base text-slate-200">
            {totalMass(build)}t
          </div>
          <div className="text-[0.65rem] text-slate-500">
            {formatNumber(cost.buyable)} U vendor
          </div>
        </div>
      </div>

      <div className="panel-flat px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name="ListChecks" className="h-4 w-4 text-cyan-300" />
            <span className="hud-label">Build tracker</span>
            <span className="hud-mono text-xs text-cyan-200">
              {acquired}/{total} acquired · {progress}%
            </span>
          </div>
          {showExport ? (
            <div className="no-print flex flex-wrap gap-2">
              <CopyButton
                text={() => buildToMarkdown(build)}
                label="Copy list"
                copiedLabel="Copied"
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  download(`${slug || "corvette"}.md`, buildToMarkdown(build), "text/markdown")
                }
              >
                <Icon name="Download" className="h-3.5 w-3.5" />
                .md
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  download(
                    `${slug || "corvette"}.json`,
                    JSON.stringify(build, null, 2),
                    "application/json",
                  )
                }
              >
                <Icon name="Download" className="h-3.5 w-3.5" />
                .json
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => window.print()}
              >
                <Icon name="Printer" className="h-3.5 w-3.5" />
                Print
              </button>
            </div>
          ) : null}
        </div>
        <div className="stat-bar mt-2">
          <span style={{ width: `${Math.max(2, progress)}%` }} />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="panel-flat px-4 py-8 text-center text-xs text-slate-400">
          No modules yet. Add parts in the builder and the shopping list will
          compile itself.
        </div>
      ) : null}

      {groups.map((group) => (
        <div key={group.category.id} className="panel-flat">
          <header
            className="flex items-center justify-between border-b border-white/5 px-3 py-2"
            style={{ background: `${group.category.accent}0f` }}
          >
            <div className="flex items-center gap-2">
              <Icon
                name={group.category.icon}
                className="h-4 w-4"
                strokeWidth={1.75}
              />
              <span className="font-display text-[0.68rem] uppercase tracking-[0.18em] text-slate-200">
                {group.category.label}
              </span>
            </div>
            <span className="hud-mono text-[0.68rem] text-slate-400">
              {group.entries.reduce((n, e) => n + e.qty, 0)} pcs ·{" "}
              {formatUnits(
                group.entries.reduce((n, e) => n + e.lineTotal, 0),
              )}
            </span>
          </header>
          <ul className="divide-y divide-white/5">
            {group.entries.map((entry) => {
              const key = `${group.category.id}:${entry.part.id}`;
              const isOwned = owned[key];
              return (
                <li
                  key={key}
                  className="flex items-start gap-3 px-3 py-2 hover:bg-white/[0.02]"
                >
                  <button
                    type="button"
                    aria-label={`Mark ${entry.part.name} as acquired`}
                    onClick={() =>
                      setOwned((current) => ({ ...current, [key]: !current[key] }))
                    }
                    className={`no-print mt-0.5 grid h-4 w-4 shrink-0 place-items-center border transition ${
                      isOwned
                        ? "border-signal-400/70 bg-signal-400/20 text-signal-400"
                        : "border-slate-500/40 text-transparent hover:border-cyan-300/60"
                    }`}
                  >
                    <Icon name="Check" className="h-3 w-3" strokeWidth={3} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm ${isOwned ? "text-slate-500 line-through" : "text-slate-100"}`}
                      >
                        {entry.qty}× {entry.part.name}
                      </span>
                      {entry.part.rarity !== "common" ? (
                        <span className="chip" style={{ borderColor: "#fbbf2466", color: "#fbbf24" }}>
                          {entry.part.rarity}
                        </span>
                      ) : null}
                      {!entry.part.buyable ? (
                        <span className="chip" style={{ borderColor: "#fb923c66", color: "#fb923c" }}>
                          salvage / trade
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.68rem] text-slate-400">
                      <span className="hud-mono">
                        {formatNumber(entry.lineTotal)} U
                        {entry.qty > 1 ? (
                          <span className="text-slate-500">
                            {" "}
                            ({formatNumber(entry.part.price)} each)
                          </span>
                        ) : null}
                      </span>
                      <span>
                        {entry.part.sources
                          .map((s) => sourceLabels[s] ?? s)
                          .join(", ")}
                      </span>
                    </div>
                    {entry.part.notes ? (
                      <p className="mt-1 text-[0.7rem] leading-relaxed text-slate-500">
                        {entry.part.notes}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {total > 0 ? (
        <div className="panel-flat space-y-2 px-3 py-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="hud-label">Vendor total</span>
            <span className="hud-mono text-slate-200">
              {formatNumber(cost.buyable)} Units
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="hud-label">Salvage-only market value</span>
            <span className="hud-mono text-slate-200">
              {formatNumber(cost.salvage)} Units
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-white/5 pt-2">
            <span className="hud-label">Grand total</span>
            <span className="hud-mono text-sm text-plasma-300">
              {formatNumber(cost.total)} Units
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="hud-label">Class upgrade (C → S)</span>
            <span className="hud-mono text-slate-200">
              ~{formatNumber(meta.naniteUpgradeCtoS)} Nanites
            </span>
          </div>
          <p className="pt-1 text-[0.68rem] leading-relaxed text-slate-500">
            {buyEntries.length > 0
              ? `${buyEntries.reduce((n, e) => n + e.qty, 0)} modules can be bought straight from the Workshop vendor. `
              : ""}
            {huntEntries.length > 0
              ? `${huntEntries.reduce((n, e) => n + e.qty, 0)} are salvage-only: hunt Salvageable Scrap, derelict freighters and pirate wrecks, or trade 3 spare advanced modules for 1 specific module at the Workshop.`
              : "Everything on this list can be bought directly from the Workshop vendor."}
          </p>
          <p className="text-[0.68rem] leading-relaxed text-slate-500">
            {meta.priceDisclaimer}
          </p>
        </div>
      ) : null}
    </div>
  );
}
