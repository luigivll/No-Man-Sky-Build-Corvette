"use client";

import { formatNumber, formatUnits } from "@/lib/build";
import { rarityLabels, sourceLabels } from "@/lib/data";
import { STAT_IDS } from "@/lib/build";
import type { Part } from "@/lib/types";
import { Icon } from "./Icon";
import PartThumb from "./PartThumb";

export default function PartRow({
  part,
  qty = 0,
  onAdd,
  onRemove,
  onSetQty,
  accent = "#22d3ee",
  tail,
}: {
  part: Part;
  qty?: number;
  onAdd?: () => void;
  onRemove?: () => void;
  onSetQty?: (qty: number) => void;
  accent?: string;
  tail?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 px-3 py-2.5 transition hover:bg-white/[0.02]">
      <div className="hidden sm:block">
        <PartThumb part={part} size={78} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">
            {part.name}
          </span>
          {part.manufacturer !== "Universal" ? (
            <span className="chip" style={{ borderColor: `${accent}55`, color: accent }}>
              {part.manufacturer}
            </span>
          ) : null}
          <span
            className="chip"
            style={
              part.buyable
                ? { borderColor: "#38bdf855", color: "#7dd3fc" }
                : { borderColor: "#fb923c66", color: "#fb923c" }
            }
          >
            {part.buyable ? "vendor" : "salvage"}
          </span>
          {part.rarity !== "common" ? (
            <span className="chip" style={{ borderColor: "#fbbf2466", color: "#fbbf24" }}>
              {rarityLabels[part.rarity] ?? part.rarity}
            </span>
          ) : null}
          {part.tags.includes("bonus-part") ? (
            <span className="chip" style={{ borderColor: "#a855f766", color: "#c084fc" }}>
              endgame
            </span>
          ) : null}
        </div>

        <p className="mt-1 text-[0.7rem] leading-relaxed text-slate-400">
          {part.notes}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="hud-mono text-[0.68rem] text-plasma-300">
            {formatUnits(part.price)} U
            <span className="text-slate-500"> ({formatNumber(part.price)})</span>
          </span>
          <span className="hud-mono text-[0.66rem] text-slate-400">
            MASS {part.mass}t
            {part.cargoSlots > 0 ? ` · +${part.cargoSlots} SLOTS` : ""}
          </span>
          <span className="flex flex-wrap gap-1.5">
            {STAT_IDS.filter((stat) => part.stats[stat] > 0).map((stat) => (
              <span
                key={stat}
                className="hud-mono text-[0.62rem] uppercase tracking-wider text-cyan-300/80"
              >
                {stat.slice(0, 3)}+{part.stats[stat]}
              </span>
            ))}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap gap-x-3 text-[0.62rem] uppercase tracking-wider text-slate-500">
          {part.sources.map((source) => (
            <span key={source}>{sourceLabels[source] ?? source}</span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {tail}
        {onAdd ? (
          <div className="flex items-center gap-1">
            {qty > 0 ? (
              <>
                <button
                  type="button"
                  aria-label={`Remove one ${part.name}`}
                  className="grid h-7 w-7 place-items-center border border-slate-500/40 text-slate-300 hover:border-cyan-300/60 hover:text-cyan-200"
                  onClick={() => (onRemove ? onRemove() : onSetQty?.(qty - 1))}
                >
                  <Icon name="Minus" className="h-3.5 w-3.5" />
                </button>
                <span className="hud-mono w-7 text-center text-sm text-cyan-200">
                  {qty}
                </span>
              </>
            ) : null}
            <button
              type="button"
              aria-label={`Add ${part.name}`}
              className="btn px-2.5 py-1.5"
              onClick={onAdd}
            >
              <Icon name="Plus" className="h-3.5 w-3.5" />
              {qty === 0 ? "Add" : ""}
            </button>
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}
