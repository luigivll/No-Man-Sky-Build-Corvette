"use client";

import { useMemo, useState } from "react";
import { slotsOf } from "@/lib/build";
import { partsByCategory } from "@/lib/data";
import type { Build, PartCategoryId } from "@/lib/types";
import PartRow from "./PartRow";
import { Icon } from "./Icon";

type SourceFilter = "all" | "vendor" | "salvage";

export default function PartPicker({
  categoryId,
  build,
  accent,
  onAdd,
  onRemove,
}: {
  categoryId: PartCategoryId;
  build: Build;
  accent: string;
  onAdd: (partId: string) => void;
  onRemove: (partId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [tag, setTag] = useState<string>("all");

  const pool = useMemo(() => partsByCategory[categoryId] ?? [], [categoryId]);
  const selected = slotsOf(build, categoryId);

  const tags = useMemo(() => {
    const set = new Set<string>();
    pool.forEach((part) =>
      part.tags
        .filter((t) => !t.includes("legacy-name"))
        .forEach((t) => set.add(t)),
    );
    return [...set].sort();
  }, [pool]);

  const filtered = pool.filter((part) => {
    if (source === "vendor" && !part.buyable) return false;
    if (source === "salvage" && part.buyable) return false;
    if (tag !== "all" && !part.tags.includes(tag)) return false;
    if (query.trim()) {
      const haystack = `${part.name} ${part.manufacturer} ${part.notes} ${part.tags.join(" ")}`.toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Icon
            name="Search"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${pool.length} modules…`}
            className="hud-mono w-full border border-white/10 bg-void-900/80 py-1.5 pl-8 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
          />
        </div>

        <div className="flex items-center gap-1">
          {(
            [
              { id: "all", label: "All" },
              { id: "vendor", label: "Vendor" },
              { id: "salvage", label: "Salvage" },
            ] as { id: SourceFilter; label: string }[]
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSource(option.id)}
              className={`border px-2.5 py-1.5 font-mono text-[0.62rem] uppercase tracking-wider transition ${
                source === option.id
                  ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                  : "border-white/10 text-slate-400 hover:border-cyan-400/30"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setTag("all")}
            className={`shrink-0 border px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wider transition ${
              tag === "all"
                ? "border-cyan-400/50 text-cyan-200"
                : "border-white/10 text-slate-500 hover:text-slate-300"
            }`}
          >
            any style
          </button>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t === tag ? "all" : t)}
              className={`shrink-0 border px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wider transition ${
                tag === t
                  ? "border-cyan-400/50 text-cyan-200"
                  : "border-white/10 text-slate-500 hover:text-slate-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}

      <div className="divide-y divide-white/5 border border-white/5 bg-void-900/50">
        {filtered.map((part) => (
          <PartRow
            key={part.id}
            part={part}
            accent={accent}
            qty={selected.filter((id) => id === part.id).length}
            onAdd={() => onAdd(part.id)}
            onRemove={() => onRemove(part.id)}
          />
        ))}
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-500">
            No modules match that filter.
          </p>
        ) : null}
      </div>
    </div>
  );
}
