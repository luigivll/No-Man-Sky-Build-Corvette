"use client";

import { STAT_IDS } from "@/lib/build";
import { statDefinitions } from "@/lib/data";
import type { StatTotals } from "@/lib/types";

const SIZE = 240;
const R = 88;
const CENTER = SIZE / 2;

function point(index: number, value: number, total: number) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const radius = (value / 100) * R;
  return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)];
}

export default function StatRadar({
  stats,
  accent = "#22d3ee",
  compact = false,
}: {
  stats: StatTotals;
  accent?: string;
  compact?: boolean;
}) {
  const total = STAT_IDS.length;
  const polygon = STAT_IDS.map((id, index) =>
    point(index, stats.ratings[id], total).join(","),
  ).join(" ");

  const size = compact ? 200 : SIZE;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={size}
        height={size}
        className="max-w-full"
        role="img"
        aria-label="Estimated performance radar"
      >
        <defs>
          <radialGradient id="radar-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.12" />
          </radialGradient>
        </defs>

        {[25, 50, 75, 100].map((ring) => (
          <polygon
            key={ring}
            points={STAT_IDS.map((_, index) => point(index, ring, total).join(",")).join(" ")}
            fill="none"
            stroke="rgba(34,211,238,0.16)"
            strokeWidth={ring === 100 ? 1.2 : 0.7}
          />
        ))}

        {STAT_IDS.map((id, index) => {
          const [x, y] = point(index, 100, total);
          return (
            <line
              key={id}
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              stroke="rgba(34,211,238,0.18)"
              strokeWidth={0.7}
            />
          );
        })}

        <polygon
          points={polygon}
          fill="url(#radar-fill)"
          stroke={accent}
          strokeWidth={1.6}
          style={{ filter: `drop-shadow(0 0 6px ${accent}aa)` }}
        />

        {STAT_IDS.map((id, index) => {
          const [x, y] = point(index, stats.ratings[id], total);
          return <circle key={`${id}-dot`} cx={x} cy={y} r={2.4} fill={accent} />;
        })}

        {STAT_IDS.map((id, index) => {
          const [x, y] = point(index, 118, total);
          const def = statDefinitions.find((s) => s.id === id);
          return (
            <text
              key={`${id}-label`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="hud-mono"
              fontSize="7.5"
              letterSpacing="0.12em"
              fill="rgba(148,197,222,0.85)"
            >
              {(def?.label ?? id).toUpperCase()}
            </text>
          );
        })}
      </svg>

      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {STAT_IDS.map((id) => {
          const def = statDefinitions.find((s) => s.id === id);
          return (
            <div key={id} className="flex items-center justify-between gap-2">
              <span className="hud-label truncate">{def?.label ?? id}</span>
              <span className="hud-mono text-xs text-cyan-200">
                {stats.ratings[id]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
