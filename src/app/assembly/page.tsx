"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AssemblyManualView from "@/components/AssemblyManualView";
import { Icon } from "@/components/Icon";
import { useBuild } from "@/components/BuildProvider";
import { Chip, Panel } from "@/components/ui";
import { blueprints } from "@/lib/data";
import { buildFromBlueprint, countParts } from "@/lib/build";

/** Assembly manual for whatever is currently in the build bay. */
export default function AssemblyPage() {
  const { build } = useBuild();
  const modules = countParts(build);
  const [picked, setPicked] = useState<string>(blueprints[0]?.slug ?? "");

  const manualBuild = useMemo(() => build, [build]);

  if (modules === 0) {
    return (
      <div className="space-y-4">
        <header className="panel scanlines p-6">
          <Chip accent="#a855f7">Assembly manual</Chip>
          <h1 className="mt-3 font-display text-3xl font-black uppercase tracking-[0.06em] text-slate-50">
            Nothing in the <span className="text-violet-glow">build bay</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            The manual is generated from a finished module list. Roll a ship, load a blueprint, or
            start placing parts in the builder - then come back and the plan will be waiting.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/randomizer" className="btn">
              <Icon name="Dices" className="h-3.5 w-3.5" />
              Roll a ship
            </Link>
            <Link href="/builder" className="btn-ghost">
              <Icon name="Wrench" className="h-3.5 w-3.5" />
              Open the builder
            </Link>
          </div>
        </header>

        <Panel accent="#22d3ee">
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-slate-100">
            Or pick a blueprint to assemble
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={picked}
              onChange={(event) => setPicked(event.target.value)}
              className="hud-mono border border-white/15 bg-void-900/80 px-2.5 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-400/50"
            >
              {blueprints.map((blueprint) => (
                <option key={blueprint.slug} value={blueprint.slug}>
                  {blueprint.name}
                </option>
              ))}
            </select>
            <Link href={`/assembly/${picked}`} className="btn">
              <Icon name="ClipboardList" className="h-3.5 w-3.5" />
              Open its manual
            </Link>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {blueprints.slice(0, 6).map((blueprint) => {
              const blueprintBuild = buildFromBlueprint(blueprint);
              return (
                <Link
                  key={blueprint.slug}
                  href={`/assembly/${blueprint.slug}`}
                  className="panel-flat flex items-center justify-between px-3 py-2 transition hover:border-cyan-400/40"
                >
                  <span className="font-mono text-[0.68rem] text-slate-200">{blueprint.name}</span>
                  <span className="font-mono text-[0.6rem] text-slate-500">
                    {countParts(blueprintBuild)} mods
                  </span>
                </Link>
              );
            })}
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <AssemblyManualView
      build={manualBuild}
      styleId={(manualBuild.styleIds ?? []).join("+") || undefined}
      title={`${manualBuild.name} - assembly manual`}
      subtitle="Generated from the modules in the build bay: sections in Workshop order, each module drawn on the socket it claims."
      chips={[manualBuild.origin === "randomizer" ? "randomized hull" : "manual build"]}
      backHref="/builder"
      backLabel="Back to the builder"
      headerRight={
        <>
          <Link href="/builder" className="btn">
            <Icon name="Wrench" className="h-3.5 w-3.5" />
            Edit parts
          </Link>
          <Link href="/hangar" className="btn-ghost">
            <Icon name="Boxes" className="h-3.5 w-3.5" />
            Save to hangar
          </Link>
        </>
      }
    />
  );
}
