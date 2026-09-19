"use client";

import { useMemo } from "react";
import { computeSchematic } from "@/lib/schematic";
import { countParts } from "@/lib/build";
import type { Build } from "@/lib/types";
import { Icon } from "./Icon";

const KIND_OPACITY: Record<string, number> = {
  cockpit: 0.82,
  hab: 0.5,
  walkway: 0.4,
  reactor: 0.95,
  bay: 0.34,
  "engine-main": 0.9,
  "engine-light": 0.78,
  weapon: 0.92,
  gear: 0.8,
  wing: 0.55,
  plating: 0.45,
  shield: 0.05,
};

export default function HullSchematic({
  build,
  height = 360,
  showEmpty = true,
}: {
  build: Build;
  height?: number;
  showEmpty?: boolean;
}) {
  const layout = useMemo(() => computeSchematic(build), [build]);
  const moduleCount = countParts(build);

  if (moduleCount === 0 && showEmpty) {
    return (
      <div
        className="panel-flat grid place-items-center px-6 py-12 text-center"
        style={{ minHeight: height }}
      >
        <div>
          <Icon
            name="ScanLine"
            className="mx-auto h-8 w-8 text-cyan-400/50"
          />
          <p className="mt-3 font-display text-xs uppercase tracking-[0.2em] text-slate-400">
            No hull data
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Add modules and the schematic will assemble itself.
          </p>
        </div>
      </div>
    );
  }

  const hullHeight = Math.round(layout.hullBottom - layout.hullTop);

  return (
    <div className="panel-flat relative overflow-hidden" style={{ minHeight: height }}>
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="h-full w-full"
        role="img"
        aria-label="Top-down Corvette schematic"
        preserveAspectRatio="xMidYMid meet"
        style={{ height }}
      >
        <defs>
          <pattern
            id="hull-grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="rgba(34,211,238,0.08)"
              strokeWidth="0.6"
            />
          </pattern>
          <filter id="hull-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="engine-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fdba74" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ff7a1a" stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect width={layout.width} height={layout.height} fill="url(#hull-grid)" />

        {/* centreline */}
        <line
          x1={layout.hullCenterX}
          y1={18}
          x2={layout.hullCenterX}
          y2={layout.height - 18}
          stroke="rgba(34,211,238,0.18)"
          strokeWidth="0.8"
          strokeDasharray="6 8"
        />

        {layout.blocks.map((block) => {
          const opacity = KIND_OPACITY[block.kind] ?? 0.5;
          const common = {
            fill: `${block.accent}${block.kind === "shield" ? "0f" : "26"}`,
            stroke: block.accent,
            strokeWidth: block.kind === "shield" ? 1 : 1.3,
            opacity: block.kind === "shield" ? 0.85 : 1,
          };
          const title = (
            <title>{`${block.partName} (${block.category})`}</title>
          );

          if (block.shape === "ellipse") {
            return (
              <ellipse
                key={block.key}
                cx={block.x + block.w / 2}
                cy={block.y + block.h / 2}
                rx={block.w / 2}
                ry={block.h / 2}
                fill="none"
                stroke={block.accent}
                strokeWidth={1.1}
                strokeDasharray="7 7"
                opacity={0.55}
              >
                {title}
              </ellipse>
            );
          }

          if (block.shape === "poly") {
            return (
              <g key={block.key}>
                <polygon
                  points={block.points}
                  fill={`${block.accent}${block.kind === "gear" ? "44" : "2e"}`}
                  stroke={block.accent}
                  strokeWidth={1.2}
                  opacity={opacity}
                >
                  {title}
                </polygon>
              </g>
            );
          }

          return (
            <rect
              key={block.key}
              x={block.x}
              y={block.y}
              width={block.w}
              height={block.h}
              rx={block.rx ?? 2}
              {...common}
              opacity={opacity}
            >
              {title}
            </rect>
          );
        })}

        {/* engine plumes */}
        {layout.blocks
          .filter((b) => b.kind === "engine-main")
          .map((b) => (
            <rect
              key={`${b.key}-plume`}
              x={b.x + 4}
              y={b.y + b.h}
              width={b.w - 8}
              height={26}
              fill="url(#engine-glow)"
              opacity={0.75}
            />
          ))}

        {/* nose marker + axes */}
        <g className="hud-mono" fontSize="8" fill="rgba(103,232,249,0.7)">
          <text x={layout.hullCenterX + 10} y={20}>
            FORE
          </text>
          <text x={layout.hullCenterX + 10} y={layout.height - 12}>
            AFT
          </text>
        </g>
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 space-y-1">
        <span className="hud-label block">Hull schematic</span>
        <span className="hud-mono text-[0.68rem] text-cyan-200">
          LENGTH {hullHeight}u &middot; {moduleCount} MODULES
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2">
        {[
          { label: "Cockpit", accent: "#38bdf8" },
          { label: "Hab", accent: "#22d3ee" },
          { label: "Reactor", accent: "#a855f7" },
          { label: "Wings", accent: "#34d399" },
          { label: "Weapons", accent: "#ef4444" },
          { label: "Engines", accent: "#fb923c" },
        ].map((item) => (
          <span
            key={item.label}
            className="hud-mono flex items-center gap-1 text-[0.6rem] uppercase tracking-wider text-slate-400"
          >
            <span
              className="inline-block h-2 w-2 border"
              style={{ borderColor: item.accent, background: `${item.accent}33` }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
