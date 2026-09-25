"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ShipPreview3D from "@/components/ShipPreview3D";
import { Chip, HudLabel, Panel, PanelHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { assembleCorvette, placedBox } from "@/lib/lattice";
import { LATTICE_RECIPES, latticeBuild } from "@/lib/fleet";
import { ensurePack } from "@/lib/realMeshes";
import type { ShipMesh } from "@/lib/render3d";

/**
 * Lattice prototype.
 *
 * Real corvette assets snapped together on the game's own build grid.  The page
 * runs in the browser because the mesh pack is fetched once and cached, which is
 * what lets the turntable, the drag-orbit and the engine trails work.
 */

const fmt = (n: number) => n.toFixed(2);

export default function LatticePage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [packInfo, setPackInfo] = useState<{ count: number; bytes: number } | null>(null);

  useEffect(() => {
    let alive = true;
    ensurePack().then((p) => {
      if (!alive) return;
      setPackInfo(p ? { count: p.count, bytes: p.bytes ?? 0 } : null);
      setReady(Boolean(p));
    });
    return () => {
      alive = false;
    };
  }, []);

  const recipe = LATTICE_RECIPES[0];
  const mesh: ShipMesh | null = useMemo(
    () => (ready ? assembleCorvette(recipe, { maxTrisPerPart: 0 }) : null),
    [ready, recipe],
  );

  const triTotal = mesh ? mesh.parts.reduce((n, p) => n + p.faces.length, 0) : 0;

  const rows = useMemo(
    () =>
      recipe.parts.map((p) => ({
        p,
        box: placedBox(p.assetId, p.pos, p.yaw, p.mirror),
      })),
    [recipe],
  );

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

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-emerald-400/80">
          <Icon name="Boxes" className="h-3.5 w-3.5" />
          <span>Lattice prototype · stage 1</span>
        </div>
        <h1 className="text-3xl font-semibold text-slate-50 sm:text-4xl">
          Real parts, snapped on the game&apos;s own grid
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
          {mesh ? mesh.moduleCount : recipe.parts.length} genuine corvette modules assembled purely
          from snap points. Nothing is eyeballed: the spine modules butt face-to-face, the wings use
          the asset&apos;s own inboard edge, and the landing gear is bolted to the ventral face of
          the hull. Drag to orbit, scroll to zoom.
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip accent="#34d399">
            <span className="font-mono text-[10px]">cell 1.00 × 0.50 × 1.00</span>
          </Chip>
          <Chip accent="#38bdf8">
            <span className="font-mono text-[10px]">true game scale</span>
          </Chip>
          {mesh ? (
            <Chip accent="#fb923c">
              <span className="font-mono text-[10px]">
                {mesh.moduleCount} modules · {triTotal.toLocaleString()} tris
              </span>
            </Chip>
          ) : null}
        </div>
      </header>

      <Panel>
        <PanelHeader
          icon="Ship"
          title={recipe.name}
          subtitle={recipe.role}
          right={
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300/70">
              {ready === null ? "loading meshes" : ready ? "live" : "pack missing"}
            </span>
          }
        />
        {mesh ? (
          <ShipPreview3D
            build={latticeBuild(recipe)}
            mesh={mesh}
            height={620}
            showStylePicker={false}
            initialView="hero"
          />
        ) : (
          <div className="grid place-items-center px-6 py-24 text-center" style={{ minHeight: 620 }}>
            <div>
              <Icon name="ScanLine" className="mx-auto h-8 w-8 animate-pulse text-cyan-400/60" />
              <p className="mt-3 font-display text-xs uppercase tracking-[0.2em] text-slate-400">
                {ready === null ? "Fetching the mesh pack" : "Mesh pack unavailable"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {ready === null
                  ? "public/models/corvette.bin · 3.2 MB · cached after the first load"
                  : "Rebuild it with scripts/unreal/build-part-models.py"}
              </p>
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader icon="Ruler" title="Every part, measured where it landed" />
          <div className="overflow-x-auto p-2">
            <table className="w-full min-w-[700px] border-collapse font-mono text-[11px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-sky-300/70">
                  <th className="border-b border-white/10 px-3 py-2">Asset</th>
                  <th className="border-b border-white/10 px-3 py-2">Snap point</th>
                  <th className="border-b border-white/10 px-3 py-2">x</th>
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
                    <td className="border-b border-white/5 px-3 py-1.5 text-white/55">
                      {p.pos.map(fmt).join(" ")}
                    </td>
                    <td className="border-b border-white/5 px-3 py-1.5">
                      {box ? `${fmt(box.min[0])}→${fmt(box.max[0])}` : "-"}
                    </td>
                    <td className="border-b border-white/5 px-3 py-1.5">
                      {box ? `${fmt(box.min[1])}→${fmt(box.max[1])}` : "-"}
                    </td>
                    <td className="border-b border-white/5 px-3 py-1.5">
                      {box ? `${fmt(box.min[2])}→${fmt(box.max[2])}` : "-"}
                    </td>
                  </tr>
                ))}
                <tr className="text-emerald-300">
                  <td className="px-3 py-2 font-semibold" colSpan={2}>
                    Hull envelope
                  </td>
                  <td className="px-3 py-2">{`${fmt(envelope.min[0])}→${fmt(envelope.max[0])}`}</td>
                  <td className="px-3 py-2">{`${fmt(envelope.min[1])}→${fmt(envelope.max[1])}`}</td>
                  <td className="px-3 py-2">{`${fmt(envelope.min[2])}→${fmt(envelope.max[2])}`}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Panel>
            <PanelHeader icon="Info" title="How the grid works" />
            <div className="flex flex-col gap-3 px-5 py-4 text-sm leading-relaxed text-slate-300">
              <p>
                A part&apos;s FBX origin <strong className="text-slate-100">is</strong> its snap
                point, and its bounding box says how far it reaches from there:
              </p>
              <ul className="flex flex-col gap-1 font-mono text-[11px] text-sky-200/90">
                <li>B_COK_A → z 0.00 … 1.07 reaches forward</li>
                <li>B_HAB_A → z −0.97 … 1.02 two cells, centred</li>
                <li>B_TRU_* → z −0.62 … 0.01 nozzle aft</li>
                <li>B_WNG_A → x 0.00 … 1.00 root to outboard</li>
                <li>B_LND_A → y −0.04 … 0.98 foot to hull</li>
              </ul>
              <p>
                So the assembler puts the next snap where the previous part ends:{" "}
                <code className="font-mono text-[11px] text-emerald-300">
                  next.z = current.z + current.zMin − next.zMax
                </code>
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader icon="Wrench" title="Stage 2 — what comes next" />
            <div className="flex flex-col gap-2 px-5 py-4 text-sm text-slate-300">
              <ol className="ml-4 list-decimal flex-col gap-1 text-[13px]">
                <li>Cleaner decimation — the hull still reads faceted</li>
                <li>Read the <code className="font-mono text-[11px]">_N/_S/_E/_W</code> facing so only legal joins are allowed</li>
                <li>Port the 21 iconics onto lattice recipes</li>
                <li>Wire the builder and randomizer to the lattice engine</li>
              </ol>
              <Link
                href="/models"
                className="mt-1 font-mono text-[11px] text-sky-300 underline decoration-dotted"
              >
                browse all {packInfo ? packInfo.count.toLocaleString() : "589"} real parts →
              </Link>
            </div>
          </Panel>
        </div>
      </div>

      <HudLabel>
        Assembled from public/models/corvette.bin · {mesh ? mesh.moduleCount : recipe.parts.length}{" "}
        modules · {mesh ? mesh.plumes.length : 0} engine trails · true game scale
      </HudLabel>
    </div>
  );
}
