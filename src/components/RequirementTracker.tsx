"use client";

import { countParts, requirementStatus } from "@/lib/build";
import { meta } from "@/lib/data";
import type { Build } from "@/lib/types";
import { Icon } from "./Icon";

export default function RequirementTracker({
  build,
  showCap = true,
}: {
  build: Build;
  showCap?: boolean;
}) {
  const statuses = requirementStatus(build);
  const met = statuses.filter((s) => s.met).length;
  const total = countParts(build);
  const capUsed = Math.min(100, Math.round((total / meta.maxParts) * 100));

  return (
    <div className="space-y-3">
      {showCap ? (
        <div className="panel-flat px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="hud-label">Workshop part budget</span>
            <span className="hud-mono text-xs text-cyan-200">
              {total} / {meta.maxParts}
            </span>
          </div>
          <div className="stat-bar mt-2">
            <span
              style={{
                width: `${Math.max(2, capUsed)}%`,
                background:
                  capUsed > 90
                    ? "linear-gradient(90deg,#f97316,#ef4444)"
                    : undefined,
              }}
            />
          </div>
          <p className="mt-1.5 text-[0.68rem] text-slate-500">
            Base hulls hold up to {meta.maxParts} modules ({meta.softPartCap}{" "}
            un-modded). Keep it to {meta.maxRecommendedFloors} floors so the
            third-person camera stays clear.
          </p>
        </div>
      ) : null}

      <div className="panel-flat">
        <header className="flex items-center justify-between border-b border-white/5 px-3 py-2">
          <span className="hud-label">Flight certification</span>
          <span
            className="hud-mono text-[0.68rem]"
            style={{ color: met === statuses.length ? "#a3e635" : "#fb923c" }}
          >
            {met}/{statuses.length} requirements
          </span>
        </header>
        <ul className="divide-y divide-white/5">
          {statuses.map((status) => (
            <li
              key={status.requirement.categoryId}
              className="flex items-start gap-2.5 px-3 py-2"
            >
              <span
                className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center border"
                style={{
                  borderColor: status.met ? "#a3e63588" : "#fb923c88",
                  background: status.met ? "#a3e63522" : "#fb923c1a",
                  color: status.met ? "#a3e635" : "#fb923c",
                }}
              >
                <Icon
                  name={status.met ? "Check" : "AlertTriangle"}
                  className="h-3 w-3"
                  strokeWidth={2.6}
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-100">
                    {status.category.label}
                  </span>
                  <span
                    className="hud-mono text-[0.68rem]"
                    style={{ color: status.met ? "#a3e635" : "#fb923c" }}
                  >
                    {status.have} / {status.requirement.min}
                  </span>
                  {status.requirement.min !== status.requirement.legacyMin ? (
                    <span className="chip" style={{ borderColor: "#38bdf855", color: "#7dd3fc" }}>
                      legacy min {status.requirement.legacyMin}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[0.68rem] leading-relaxed text-slate-500">
                  {status.requirement.note}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
