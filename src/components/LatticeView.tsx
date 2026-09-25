"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ShipPreview3D from "@/components/ShipPreview3D";
import { Chip, HudLabel, Panel, PanelHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { assembleCorvette, placedBox } from "@/lib/lattice";
import { blueprintToRecipe } from "@/lib/blueprintLattice";
import { LATTICE_RECIPES, latticeBuild } from "@/lib/fleet";
import { ensurePack } from "@/lib/realMeshes";
import { blueprintBySlug } from "@/lib/data";
import type { ShipMesh } from "@/lib/render3d";

/**
 * One blueprint, rendered from real corvette assets snapped on the game grid.
 *
 * Client-side because the mesh pack is fetched once and cached — which is what
 * lets the drag-orbit, the turntable and the engine trails work.
 */

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "-");

export default function LatticeView({ slug, height = 620 }: { slug: string; height?: number }) {
  const blueprint = blueprintBySlug(slug);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    ensurePack().then((p) => alive && setReady(Boolean(p)));
    return () => {
      alive = false;
    };
  }, []);

  // the hand-built probe lives in the fleet table rather than in the blueprints
  const recipe = useMemo(
    () => LATTICE_RECIPES.find((r) => r.id === slug) ?? (blueprint ? blueprintToRecipe(blueprint) : null),
    [blueprint, slug],
  );

  const mesh: ShipMesh | null = useMemo(
    () => (ready && recipe ? assembleCorvette(recipe, { maxTrisPerPart: 0 }) : null),
    [ready, recipe],
  );

  const rows = useMemo(
    () =>
      (recipe?.parts ?? []).map((p) => ({
        p,
        box: placedBox(p.assetId, p.pos, p.yaw, p.mirror, p.scale ?? 1),
      })),
    [recipe],
  );

  const triTotal = mesh ? mesh.parts.reduce((n, p) => n + p.faces.length, 0) : 0;

  const envelope = rows.reduce(
    (acc, r) => {
      if (!r.box) return acc;
      return {
        min: [Math.min(acc.min[0], r.box.min[0]), Math.min(acc.min[1], r.box.min[1]), Math.min(acc.min[2], r.box.min[2])],
        max: [Math.max(acc.max[0], r.box.max[0]), Math.max(acc.max[1], r.box.max[1]), Math.max(acc.max[2], r.box.max[2])],
      };
    },
    { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
  );

  if (!recipe) {
    return (
      <Panel>
        <PanelHeader icon="Info" title="Blueprint not found" />
        <p className="px-5 py-4 text-sm text-slate-300">
          No blueprint matches <code className="font-mono text-sky-300">{slug}</code>.{" "}
          <Link href="/lattice" className="text-sky-300 underline decoration-dotted">
            Back to the lattice index
          </Link>
        </p>
      </Panel>
    );
  }

  const families = [...new Set(recipe.parts.map((p) => p.assetId.split("_")[1] ?? p.assetId))];

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHeader
          icon="Ship"
          title={recipe.name}
          subtitle={blueprint ? `${blueprint.franchise} · ${recipe.role}` : recipe.role}
          accent={blueprint?.accent}
          right={
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300/70">
              {ready === null ? "loading meshes" : ready ? "lattice build" : "pack missing"}
            </span>
          }
        />
        {mesh ? (
          <ShipPreview3D
            build={latticeBuild(recipe)}
            mesh={mesh}
            height={height}
            showStylePicker={false}
            initialView="hero"
            initialViewState={recipe.view}
          />
        ) : (
          <div className="grid place-items-center px-6 py-20 text-center" style={{ minHeight: height }}>
            <div>
              <Icon name="ScanLine" className="mx-auto h-8 w-8 animate-pulse text-cyan-400/60" />
              <p className="mt-3 font-display text-xs uppercase tracking-[0.2em] text-slate-400">
                {ready === null ? "Fetching the mesh pack" : "Mesh pack unavailable"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                public/models/corvette.bin · cached after the first load
              </p>
            </div>
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Chip accent={blueprint?.accent}>
          <span className="font-mono text-[10px]">
            {mesh ? mesh.moduleCount : recipe.parts.length} modules
          </span>
        </Chip>
        {mesh ? (
          <Chip accent="#38bdf8">
            <span className="font-mono text-[10px]">{triTotal.toLocaleString()} triangles</span>
          </Chip>
        ) : null}
        {mesh ? (
          <Chip accent="#fb923c">
            <span className="font-mono text-[10px]">{mesh.plumes.length} engine trails</span>
          </Chip>
        ) : null}
        <Chip accent="#a78bfa">
          <span className="font-mono text-[10px]">
            {fmt(envelope.max[2] - envelope.min[2])} × {fmt(envelope.max[0] - envelope.min[0])} ×{" "}
            {fmt(envelope.max[1] - envelope.min[1])} u
          </span>
        </Chip>
        <Chip accent="#34d399">
          <span className="font-mono text-[10px]">families {families.join(" ")}</span>
        </Chip>
      </div>

      <p className="max-w-3xl text-sm leading-relaxed text-slate-300">{recipe.blurb}</p>

      <Panel>
        <PanelHeader icon="Ruler" title="Where every part landed" />
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[700px] border-collapse font-mono text-[11px]">
            <thead className="sticky top-0 bg-[#070c14]">
              <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-sky-300/70">
                <th className="border-b border-white/10 px-3 py-2">Asset</th>
                <th className="border-b border-white/10 px-3 py-2">Role</th>
                <th className="border-b border-white/10 px-3 py-2">Snap point</th>
                <th className="border-b border-white/10 px-3 py-2">Scale</th>
                <th className="border-b border-white/10 px-3 py-2">y</th>
                <th className="border-b border-white/10 px-3 py-2">z</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {rows.map(({ p, box }, i) => (
                <tr key={i} className="odd:bg-white/[0.02]">
                  <td className="border-b border-white/5 px-3 py-1.5 text-sky-200">
                    {p.assetId}
                    {p.mirror ? <span className="text-white/35"> ·m</span> : null}
                  </td>
                  <td className="border-b border-white/5 px-3 py-1.5 text-white/50">{p.role ?? "-"}</td>
                  <td className="border-b border-white/5 px-3 py-1.5 text-white/60">
                    {p.pos.map(fmt).join(" ")}
                  </td>
                  <td className="border-b border-white/5 px-3 py-1.5">{fmt(p.scale ?? 1)}</td>
                  <td className="border-b border-white/5 px-3 py-1.5">
                    {box ? `${fmt(box.min[1])}→${fmt(box.max[1])}` : "-"}
                  </td>
                  <td className="border-b border-white/5 px-3 py-1.5">
                    {box ? `${fmt(box.min[2])}→${fmt(box.max[2])}` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <HudLabel>
        {recipe.name} · assembled from public/models/corvette.bin ·{" "}
        {mesh ? mesh.moduleCount : recipe.parts.length} snap points · true game lattice
      </HudLabel>
    </div>
  );
}
