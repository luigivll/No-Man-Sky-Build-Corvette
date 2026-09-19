"use client";

import { useMemo, useState } from "react";
import PartRow from "@/components/PartRow";
import { useBuild } from "@/components/BuildProvider";
import { Icon } from "@/components/Icon";
import { Chip, HudLabel, Panel, PanelHeader } from "@/components/ui";
import { addPart, formatUnits } from "@/lib/build";
import { categories, meta, parts, statDefinitions } from "@/lib/data";

type SortId = "price" | "name" | "mass" | "category";

export default function PartsCodexPage() {
  const { mutate } = useBuild();
  const [categoryId, setCategoryId] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortId>("category");
  const [vendorsOnly, setVendorsOnly] = useState(false);

  const filtered = useMemo(() => {
    const list = parts.filter((part) => {
      if (categoryId !== "all" && part.category !== categoryId) return false;
      if (vendorsOnly && !part.buyable) return false;
      if (query.trim()) {
        const haystack = `${part.name} ${part.manufacturer} ${part.notes} ${part.tags.join(" ")} ${part.category}`.toLowerCase();
        if (!haystack.includes(query.trim().toLowerCase())) return false;
      }
      return true;
    });
    const order = new Map(categories.map((c) => [c.id, c.buildOrder]));
    return [...list].sort((a, b) => {
      switch (sort) {
        case "price":
          return b.price - a.price;
        case "mass":
          return b.mass - a.mass;
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return (
            (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0) ||
            a.name.localeCompare(b.name)
          );
      }
    });
  }, [categoryId, query, sort, vendorsOnly]);

  const vendorCount = parts.filter((p) => p.buyable).length;
  const salvageCount = parts.length - vendorCount;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <HudLabel>Reference</HudLabel>
          <h1 className="font-display text-2xl font-black uppercase tracking-[0.12em] text-slate-50">
            Parts <span className="text-cyan-300">Codex</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Every module in the database with its Workshop price, sourcing, mass
            and stat contribution. {parts.length} modules across{" "}
            {categories.length} categories &mdash; {vendorCount} vendor-buyable,{" "}
            {salvageCount} salvage or trade only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip accent="#22d3ee">{meta.gameVersion}</Chip>
          <Chip accent="#ff7a1a">Cap {meta.maxParts} modules</Chip>
          <Chip accent="#a855f7">
            Max {meta.maxReactorModules} reactors
          </Chip>
        </div>
      </header>

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Database filters"
          subtitle="Search, filter and sort the entire Corvette module pool."
          icon={<Icon name="Search" className="h-4 w-4" />}
        />
        <div className="space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Icon
                name="Search"
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search names, notes, tags…"
                className="hud-mono w-full border border-white/10 bg-void-900/80 py-1.5 pl-8 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
              />
            </div>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortId)}
              className="hud-mono border border-white/10 bg-void-900/80 px-2.5 py-1.5 text-[0.68rem] uppercase tracking-wider text-slate-300 outline-none focus:border-cyan-400/50"
            >
              <option value="category">Sort: build order</option>
              <option value="price">Sort: price</option>
              <option value="mass">Sort: mass</option>
              <option value="name">Sort: name</option>
            </select>
            <button
              type="button"
              onClick={() => setVendorsOnly((value) => !value)}
              className={`border px-2.5 py-1.5 font-mono text-[0.62rem] uppercase tracking-wider transition ${
                vendorsOnly
                  ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                  : "border-white/10 text-slate-400 hover:border-cyan-400/30"
              }`}
            >
              Vendor only
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryId("all")}
              className={`border px-2.5 py-1.5 font-mono text-[0.62rem] uppercase tracking-wider transition ${
                categoryId === "all"
                  ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                  : "border-white/10 text-slate-400 hover:border-cyan-400/30"
              }`}
            >
              All ({parts.length})
            </button>
            {categories.map((category) => {
              const count = parts.filter((p) => p.category === category.id).length;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryId(category.id)}
                  className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[0.62rem] uppercase tracking-wider transition ${
                    categoryId === category.id
                      ? "text-slate-100"
                      : "border-white/10 text-slate-400 hover:border-white/25"
                  }`}
                  style={
                    categoryId === category.id
                      ? {
                          borderColor: `${category.accent}88`,
                          background: `${category.accent}18`,
                          color: category.accent,
                        }
                      : undefined
                  }
                >
                  <Icon name={category.icon} className="h-3 w-3" />
                  {category.singular} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Panel className="overflow-hidden">
          <PanelHeader
            title={`${filtered.length} modules`}
            subtitle="Click Add to drop a module straight into your active build."
            icon={<Icon name="Boxes" className="h-4 w-4" />}
          />
          <div className="max-h-[900px] divide-y divide-white/5 overflow-y-auto">
            {filtered.map((part) => (
              <PartRow
                key={part.id}
                part={part}
                accent={categories.find((c) => c.id === part.category)?.accent}
                onAdd={() => mutate((current) => addPart(current, part.id))}
              />
            ))}
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-slate-500">
                No modules match those filters.
              </p>
            ) : null}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel accent="#a855f7" className="overflow-hidden">
            <PanelHeader
              title="Stat model"
              subtitle="What each axis means when the shipyard scores a hull."
              accent="#a855f7"
              icon={<Icon name="Gauge" className="h-4 w-4" />}
            />
            <ul className="divide-y divide-white/5">
              {statDefinitions.map((stat) => (
                <li key={stat.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Icon name={stat.icon} className="h-4 w-4 text-cyan-300" />
                    <span className="text-sm text-slate-100">{stat.label}</span>
                  </div>
                  <p className="mt-0.5 text-[0.7rem] text-slate-500">
                    {stat.blurb}
                  </p>
                </li>
              ))}
            </ul>
            <p className="border-t border-white/5 px-4 py-3 text-[0.68rem] leading-relaxed text-slate-500">
              Ratings are a relative index (0-100) derived from module stat
              weights, not raw in-game numbers &mdash; use them to compare builds,
              and always trust adjacency bonuses in the real thing.
            </p>
          </Panel>

          <Panel accent="#ff7a1a" className="overflow-hidden">
            <PanelHeader
              title="Acquisition notes"
              subtitle="Where the modules actually come from."
              accent="#ff7a1a"
              icon={<Icon name="Radiation" className="h-4 w-4" />}
            />
            <ul className="space-y-2 p-4">
              {meta.salvageSources.map((source) => (
                <li
                  key={source}
                  className="flex items-start gap-2 text-[0.72rem] leading-relaxed text-slate-400"
                >
                  <Icon
                    name="ChevronRight"
                    className="mt-0.5 h-3 w-3 shrink-0 text-plasma-400"
                    strokeWidth={3}
                  />
                  {source}
                </li>
              ))}
            </ul>
            <div className="border-t border-white/5 px-4 py-3">
              <HudLabel>Vendor baseline</HudLabel>
              <p className="mt-1 text-[0.72rem] text-slate-400">
                Full starter set:{" "}
                <span className="hud-mono text-plasma-300">
                  {formatUnits(meta.starterShipCost)} Units
                </span>
                . C &rarr; S class:{" "}
                <span className="hud-mono text-plasma-300">
                  ~{meta.naniteUpgradeCtoS.toLocaleString()} Nanites
                </span>{" "}
                (first step {meta.firstUpgradeNanites.toLocaleString()}).
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
