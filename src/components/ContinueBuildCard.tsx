"use client";

import Link from "next/link";
import {
  computeStats,
  countParts,
  costBreakdown,
  formatUnits,
  inventorySlots,
  isSpaceworthy,
  requirementStatus,
} from "@/lib/build";
import { meta } from "@/lib/data";
import { useBuild } from "./BuildProvider";
import HullSchematic from "./HullSchematic";
import { Icon } from "./Icon";
import { HudLabel } from "./ui";

export default function ContinueBuildCard() {
  const { build, hangar, hydrated } = useBuild();
  const total = countParts(build);
  const stats = computeStats(build);
  const cost = costBreakdown(build);
  const statuses = requirementStatus(build);
  const ready = isSpaceworthy(build);
  const metCount = statuses.filter((s) => s.met).length;

  return (
    <div className="panel overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div>
          <HudLabel>Active build</HudLabel>
          <h2 className="font-display text-sm uppercase tracking-[0.16em] text-slate-100">
            {hydrated ? build.name : "Loading…"}
          </h2>
        </div>
        <span
          className="chip"
          style={
            ready
              ? { borderColor: "#a3e63577", color: "#a3e635", background: "#a3e6351a" }
              : { borderColor: "#fb923c77", color: "#fb923c", background: "#fb923c1a" }
          }
        >
          {ready ? "Spaceworthy" : `${metCount}/${statuses.length} checks`}
        </span>
      </header>

      <HullSchematic build={build} height={300} />

      <div className="grid grid-cols-2 gap-2 border-t border-white/5 p-3 sm:grid-cols-4">
        <div>
          <HudLabel>Modules</HudLabel>
          <div className="hud-mono text-sm text-cyan-200">
            {total}
            <span className="text-slate-500">/{meta.maxParts}</span>
          </div>
        </div>
        <div>
          <HudLabel>Cost</HudLabel>
          <div className="hud-mono text-sm text-plasma-300">
            {formatUnits(cost.total)}
          </div>
        </div>
        <div>
          <HudLabel>Inventory</HudLabel>
          <div className="hud-mono text-sm text-signal-400">
            +{inventorySlots(build)}
          </div>
        </div>
        <div>
          <HudLabel>Hangar</HudLabel>
          <div className="hud-mono text-sm text-slate-200">{hangar.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-3 py-2.5">
        <span className="hud-mono text-[0.66rem] uppercase tracking-wider text-slate-500">
          {stats.profile.join(" · ") || "Unclassified hull"}
        </span>
        <div className="flex gap-2">
          <Link href="/builder" className="btn">
            <Icon name="Wrench" className="h-3.5 w-3.5" />
            Continue build
          </Link>
          <Link href="/randomizer" className="btn btn-plasma">
            <Icon name="Dices" className="h-3.5 w-3.5" />
            Reroll
          </Link>
        </div>
      </div>
    </div>
  );
}
