"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBuild } from "@/components/BuildProvider";
import HullSchematic from "@/components/HullSchematic";
import CopyButton from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { Chip, HudLabel, Panel } from "@/components/ui";
import {
  buildToMarkdown,
  computeStats,
  costBreakdown,
  countParts,
  formatUnits,
  inventorySlots,
  isSpaceworthy,
} from "@/lib/build";
import { meta } from "@/lib/data";

export default function HangarPage() {
  const { hangar, build, setBuild, removeFromHangar, loadFromHangar, clearHangar } =
    useBuild();
  const router = useRouter();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <HudLabel>Storage</HudLabel>
          <h1 className="font-display text-2xl font-black uppercase tracking-[0.12em] text-slate-50">
            My <span className="text-plasma-400">Hangar</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Saved builds live in this browser&apos;s local storage, capped at
            {" "}
            {40} hulls. Load one back into the builder to keep editing, or export
            its shopping list for your notes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip accent="#22d3ee">{hangar.length} saved</Chip>
          <Chip accent="#ff7a1a">Active: {build.name}</Chip>
          {hangar.length > 0 ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (window.confirm("Delete every saved build?")) clearHangar();
              }}
            >
              <Icon name="Trash2" className="h-3.5 w-3.5" />
              Empty hangar
            </button>
          ) : null}
          <Link href="/builder" className="btn">
            <Icon name="Wrench" className="h-3.5 w-3.5" />
            Back to builder
          </Link>
        </div>
      </header>

      {hangar.length === 0 ? (
        <Panel className="grid place-items-center px-6 py-16 text-center">
          <div>
            <Icon name="Save" className="mx-auto h-8 w-8 text-cyan-400/50" />
            <p className="mt-3 font-display text-sm uppercase tracking-[0.2em] text-slate-300">
              Hangar empty
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Generate a hull in the randomizer or load an iconic blueprint, then
              hit Save to park it here. Builds persist between sessions.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/randomizer" className="btn btn-plasma">
                <Icon name="Dices" className="h-3.5 w-3.5" />
                Roll a hull
              </Link>
              <Link href="/blueprints" className="btn btn-ghost">
                <Icon name="Ship" className="h-3.5 w-3.5" />
                Browse blueprints
              </Link>
            </div>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {hangar.map((saved) => {
            const stats = computeStats(saved);
            const cost = costBreakdown(saved);
            const ready = isSpaceworthy(saved);
            return (
              <Panel
                key={saved.id}
                accent={ready ? "#a3e635" : "#fb923c"}
                className="overflow-hidden"
              >
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
                  <div>
                    <HudLabel>
                      {saved.designation ?? saved.origin} ·{" "}
                      {new Date(saved.createdAt).toLocaleDateString()}
                    </HudLabel>
                    <h2 className="font-display text-base uppercase tracking-[0.1em] text-slate-100">
                      {saved.name}
                    </h2>
                    <p className="hud-mono text-[0.66rem] text-slate-500">
                      {stats.profile.join(" · ") || "Unclassified hull"}
                    </p>
                  </div>
                  <span
                    className="chip"
                    style={
                      ready
                        ? { borderColor: "#a3e63577", color: "#a3e635" }
                        : { borderColor: "#fb923c77", color: "#fb923c" }
                    }
                  >
                    {ready ? "Spaceworthy" : "Incomplete"}
                  </span>
                </header>

                <HullSchematic build={saved} height={220} showEmpty={false} />

                <div className="grid grid-cols-3 gap-2 border-t border-white/5 p-3">
                  <div>
                    <HudLabel>Modules</HudLabel>
                    <div className="hud-mono text-sm text-cyan-200">
                      {countParts(saved)}
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
                    <HudLabel>Slots</HudLabel>
                    <div className="hud-mono text-sm text-signal-400">
                      +{inventorySlots(saved)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-3 py-3">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      loadFromHangar(saved.id);
                      router.push("/builder");
                    }}
                  >
                    <Icon name="Wrench" className="h-3.5 w-3.5" />
                    Load
                  </button>
                  <CopyButton
                    text={() => buildToMarkdown(saved)}
                    label="Copy list"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setBuild(saved)}
                  >
                    <Icon name="RefreshCw" className="h-3.5 w-3.5" />
                    Set active
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost ml-auto"
                    onClick={() => removeFromHangar(saved.id)}
                  >
                    <Icon name="Trash2" className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
