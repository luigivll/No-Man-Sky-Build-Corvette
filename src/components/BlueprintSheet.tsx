"use client";

import Link from "next/link";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import ShipViewPanel from "./ShipViewPanel";
import RequirementTracker from "./RequirementTracker";
import StatRadar from "./StatRadar";
import CopyButton from "./CopyButton";
import { useBuild } from "./BuildProvider";
import { Icon } from "./Icon";
import { Chip, HudLabel, Panel, PanelHeader } from "./ui";
import {
  buildFromBlueprint,
  buildToMarkdown,
  computeStats,
  costBreakdown,
  countParts,
  formatNumber,
  formatUnits,
  inventorySlots,
} from "@/lib/build";
import { blueprintsFile, categoryById, meta, partById } from "@/lib/data";
import type { Blueprint } from "@/lib/types";

export default function BlueprintSheet({ blueprint }: { blueprint: Blueprint }) {
  const router = useRouter();
  const { setBuild, saveToHangar } = useBuild();

  const build = useMemo(() => buildFromBlueprint(blueprint), [blueprint]);
  const cost = useMemo(() => costBreakdown(build), [build]);
  const stats = useMemo(() => computeStats(build), [build]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof blueprint.parts>();
    for (const ref of blueprint.parts) {
      const part = partById[ref.id];
      if (!part) continue;
      map.set(part.category, [...(map.get(part.category) ?? []), ref]);
    }
    return [...map.entries()].sort(
      (a, b) =>
        (categoryById[a[0]]?.buildOrder ?? 0) - (categoryById[b[0]]?.buildOrder ?? 0),
    );
  }, [blueprint]);

  const moduleCount = countParts(build);
  const requiredCount = blueprint.parts
    .filter((ref) => !ref.optional)
    .reduce((sum, ref) => sum + ref.qty, 0);
  const optionalCount = blueprint.parts
    .filter((ref) => ref.optional)
    .reduce((sum, ref) => sum + ref.qty, 0);
  const manifestCount = requiredCount + optionalCount;

  function loadIntoBuilder() {
    setBuild({ ...build, origin: "manual" });
    router.push("/builder");
  }

  function markdown() {
    const lines = [buildToMarkdown(build)];
    const optional = blueprint.parts.filter((ref) => ref.optional);
    if (optional.length > 0) {
      lines.push("");
      lines.push("## Optional cosmetic extras (not priced above)");
      optional.forEach((ref) => {
        const part = partById[ref.id];
        if (part) lines.push(`- ${ref.qty}x ${part.name} (optional)`);
      });
    }
    lines.push("");
    lines.push("## Blueprint build tips");
    blueprint.buildTips.forEach((tip) => lines.push(`- ${tip}`));
    return lines.join("\n");
  }

  return (
    <div className="space-y-5">
      <Panel accent={blueprint.accent} className="scanlines overflow-hidden">
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, ${blueprint.accent}, ${blueprint.accent2}, transparent)`,
          }}
        />
        <div className="grid gap-5 p-5 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip accent={blueprint.accent}>{blueprint.franchise}</Chip>
              <Chip accent={blueprint.accent2}>{blueprint.role}</Chip>
              <Chip>Difficulty {blueprint.difficulty}</Chip>
              <Chip>{requiredCount} required modules</Chip>
            </div>
            <HudLabel className="mt-3 block">{blueprint.designation}</HudLabel>
            <h1
              className="font-display text-3xl font-black uppercase leading-tight tracking-[0.06em] text-slate-50"
              style={{ textShadow: `0 0 24px ${blueprint.accent}66` }}
            >
              {blueprint.name}
            </h1>
            <p className="hud-mono mt-1 text-xs text-slate-400">
              {blueprint.classification}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
              {blueprint.blurb}
            </p>
            <p
              className="mt-3 border-l-2 pl-3 text-sm italic text-slate-400"
              style={{ borderColor: blueprint.accent }}
            >
              &ldquo;{blueprint.signatureLine}&rdquo;
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-plasma" onClick={loadIntoBuilder}>
                <Icon name="Wrench" className="h-4 w-4" />
                Load into builder
              </button>
              <Link href={`/assembly/${blueprint.slug}`} className="btn">
                <Icon name="ClipboardList" className="h-3.5 w-3.5" />
                Assembly manual
              </Link>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  saveToHangar(`${blueprint.name} — ${blueprint.designation}`);
                }}
              >
                <Icon name="Save" className="h-3.5 w-3.5" />
                Save to hangar
              </button>
              <CopyButton text={markdown} label="Copy blueprint" />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => window.print()}
              >
                <Icon name="Printer" className="h-3.5 w-3.5" />
                Print sheet
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 self-start">
            {[
              {
                label: "Total modules",
                value: `${moduleCount}`,
                sub:
                  optionalCount > 0
                    ? `${requiredCount} required + ${optionalCount} optional`
                    : "required modules only",
                accent: blueprint.accent,
              },
              {
                label: "Build cost",
                value: `${formatUnits(cost.total)} U`,
                sub: `${formatNumber(cost.total)} Units`,
                accent: "#fdba74",
              },
              {
                label: "Vendor purchase",
                value: `${formatUnits(cost.buyable)} U`,
                sub: "buy at the Workshop",
                accent: "#67e8f9",
              },
              {
                label: "Salvage market value",
                value: `${formatUnits(cost.salvage)} U`,
                sub: "hunt derelicts + scrap",
                accent: "#a3e635",
              },
              {
                label: "Inventory slots",
                value: `+${inventorySlots(build)}`,
                sub: "from Habs and Walkways",
                accent: "#c084fc",
              },
              {
                label: "Class upgrade",
                value: `~${formatNumber(meta.naniteUpgradeCtoS)}`,
                sub: "Nanites, C → S",
                accent: "#f472b6",
              },
            ].map((item) => (
              <div key={item.label} className="panel-flat px-3 py-2.5">
                <HudLabel>{item.label}</HudLabel>
                <div
                  className="hud-mono text-lg font-semibold"
                  style={{ color: item.accent }}
                >
                  {item.value}
                </div>
                <div className="text-[0.65rem] text-slate-500">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel accent={blueprint.accent} className="overflow-hidden">
          <PanelHeader
            title="Parts manifest"
            subtitle="Every module you need to buy, salvage or trade for."
            accent={blueprint.accent}
            icon={<Icon name="ClipboardList" className="h-4 w-4" />}
            right={
              <span className="hud-mono text-xs text-slate-400">
                {manifestCount} pcs listed · {moduleCount} required ·{" "}
                {formatUnits(cost.total)} U
              </span>
            }
          />
          <div className="divide-y divide-white/5">
            {grouped.map(([categoryId, refs]) => {
              const category = categoryById[categoryId];
              const subtotal = refs.reduce((sum, ref) => {
                const part = partById[ref.id];
                return sum + (part ? part.price * ref.qty : 0);
              }, 0);
              return (
                <div key={categoryId} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon
                        name={category?.icon ?? "Boxes"}
                        className="h-4 w-4"
                        strokeWidth={1.75}
                      />
                      <span className="font-display text-[0.7rem] uppercase tracking-[0.16em] text-slate-200">
                        {category?.label ?? categoryId}
                      </span>
                    </div>
                    <span className="hud-mono text-[0.65rem] text-slate-500">
                      {formatUnits(subtotal)} U
                    </span>
                  </div>

                  <ul className="mt-2 space-y-1.5">
                    {refs.map((ref) => {
                      const part = partById[ref.id];
                      if (!part) return null;
                      return (
                        <li key={`${categoryId}-${ref.id}-${ref.optional ? "o" : "r"}`}>
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="hud-mono text-sm text-cyan-200">
                              {ref.qty}×
                            </span>
                            <span className="text-sm text-slate-100">
                              {part.name}
                            </span>
                            {ref.optional ? (
                              <span className="chip">optional</span>
                            ) : null}
                            {!part.buyable ? (
                              <span
                                className="chip"
                                style={{ borderColor: "#fb923c66", color: "#fb923c" }}
                              >
                                salvage / trade
                              </span>
                            ) : null}
                            <span className="hud-mono ml-auto text-[0.68rem] text-plasma-300">
                              {formatNumber(part.price * ref.qty)} U
                            </span>
                          </div>
                          {ref.note ? (
                            <p className="mt-0.5 pl-6 text-[0.7rem] leading-relaxed text-slate-400">
                              {ref.note}
                            </p>
                          ) : null}
                          <p className="mt-0.5 pl-6 text-[0.68rem] leading-relaxed text-slate-500">
                            {part.notes}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          <div className="border-t border-white/5 px-4 py-3 text-[0.7rem] leading-relaxed text-slate-400">
            {meta.priceDisclaimer}{" "}
            <span className="text-slate-500">{blueprintsFile.meta.naniteNote}</span>
          </div>
        </Panel>

        <div className="space-y-4">
          <ShipViewPanel
            build={build}
            height={380}
            title="Projected silhouette"
            subtitle={`How the ${blueprint.name} module list reads as a finished ship.`}
            styleOverride={blueprint.style}
          />

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Performance projection"
              subtitle={stats.profile.join(" · ") || "Unclassified hull"}
              icon={<Icon name="Gauge" className="h-4 w-4" />}
            />
            <div className="p-4">
              <StatRadar stats={stats} compact accent={blueprint.accent} />
            </div>
          </Panel>

          <Panel accent="#a3e635" className="overflow-hidden">
            <PanelHeader
              title="Build tips"
              subtitle="Hard-won advice for making the silhouette read in-game."
              accent="#a3e635"
              icon={<Icon name="Star" className="h-4 w-4" />}
            />
            <ol className="space-y-2 p-4">
              {blueprint.buildTips.map((tip, index) => (
                <li key={tip} className="flex gap-3 text-xs leading-relaxed text-slate-300">
                  <span className="hud-mono shrink-0 text-signal-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {tip}
                </li>
              ))}
            </ol>
          </Panel>

          <RequirementTracker build={build} />
        </div>
      </div>
    </div>
  );
}
