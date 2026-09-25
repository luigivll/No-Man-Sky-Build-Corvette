import Link from "next/link";
import { Chip, HudLabel, Panel, PanelHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { assembleCorvette, placedBox, LATTICE_VIEWS, type LatticePlacement } from "@/lib/lattice";
import { LATTICE_RECIPES } from "@/lib/fleet";
import { projectScene, type ShipMesh, type V3 } from "@/lib/render3d";

/**
 * Lattice prototype.
 *
 * Proof that the real corvette assets assemble correctly on the game's own grid:
 * every module is a genuine mesh snapped face-to-face, at true scale. The page is
 * a server component, so the static export ships finished SVG.
 */

export const metadata = {
  title: "Lattice Prototype · NMS Corvette Shipyard",
  description: "Real corvette parts snapped together on the game's own build grid.",
};

const fmt = (n: number) => n.toFixed(2);

/** SVG point lists carry ten decimals by default; one is plenty at these sizes. */
const round = (points: string) => points.replace(/(\d+\.\d)\d+/g, "$1");

function View({
  mesh,
  viewIndex,
  size,
  maxTrisPerPart,
}: {
  mesh: ShipMesh;
  viewIndex: number;
  size: number;
  maxTrisPerPart?: number;
}) {
  const v = LATTICE_VIEWS[viewIndex];
  void maxTrisPerPart;
  const scene = projectScene(mesh, v.view, size, Math.round(size * 0.66), { padding: 1.08 });
  return (
    <svg
      viewBox={`0 0 ${size} ${Math.round(size * 0.66)}`}
      width="100%"
      className="block"
      aria-label={`${v.label} view`}
    >
      <defs>
        <radialGradient id={`bg-${v.id}`} cx="50%" cy="38%" r="72%">
          <stop offset="0%" stopColor="#0d1a26" />
          <stop offset="55%" stopColor="#060b13" />
          <stop offset="100%" stopColor="#03060b" />
        </radialGradient>
      </defs>
      <rect width={size} height={Math.round(size * 0.66)} fill={`url(#bg-${v.id})`} />
      {scene.faces.map((face, i) => (
        <polygon
          key={i}
          points={round(face.points)}
          fill={face.fill}
          opacity={face.opacity < 1 ? face.opacity : undefined}
          stroke={face.kind === "emissive" ? face.fill : "#04070d"}
          strokeWidth={face.kind === "emissive" ? 1.1 : 0.28}
        />
      ))}
    </svg>
  );
}

function BoundsTable({ parts }: { parts: LatticePlacement[] }) {
  const rows = parts.map((p) => {
    const box = placedBox(p.assetId, p.pos, p.yaw, p.mirror);
    return { p, box };
  });
  const ship = rows.reduce(
    (acc, r) => {
      if (!r.box) return acc;
      return {
        min: [Math.min(acc.min[0], r.box.min[0]), Math.min(acc.min[1], r.box.min[1]), Math.min(acc.min[2], r.box.min[2])] as V3,
        max: [Math.max(acc.max[0], r.box.max[0]), Math.max(acc.max[1], r.box.max[1]), Math.max(acc.max[2], r.box.max[2])] as V3,
      };
    },
    { min: [Infinity, Infinity, Infinity] as V3, max: [-Infinity, -Infinity, -Infinity] as V3 },
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse font-mono text-[11px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-sky-300/70">
            <th className="border-b border-white/10 px-3 py-2">Asset</th>
            <th className="border-b border-white/10 px-3 py-2">Snap point</th>
            <th className="border-b border-white/10 px-3 py-2">Extent x</th>
            <th className="border-b border-white/10 px-3 py-2">Extent y</th>
            <th className="border-b border-white/10 px-3 py-2">Extent z</th>
          </tr>
        </thead>
        <tbody className="text-slate-300">
          {rows.map(({ p, box }, i) => (
            <tr key={i} className="odd:bg-white/[0.02]">
              <td className="border-b border-white/5 px-3 py-1.5 text-sky-200">
                {p.assetId}
                {p.mirror ? <span className="text-white/40"> ·mirror</span> : null}
              </td>
              <td className="border-b border-white/5 px-3 py-1.5 text-white/60">
                {p.pos.map(fmt).join(", ")}
              </td>
              <td className="border-b border-white/5 px-3 py-1.5">{box ? `${fmt(box.min[0])} → ${fmt(box.max[0])}` : "-"}</td>
              <td className="border-b border-white/5 px-3 py-1.5">{box ? `${fmt(box.min[1])} → ${fmt(box.max[1])}` : "-"}</td>
              <td className="border-b border-white/5 px-3 py-1.5">{box ? `${fmt(box.min[2])} → ${fmt(box.max[2])}` : "-"}</td>
            </tr>
          ))}
          <tr className="text-emerald-300">
            <td className="px-3 py-2 font-semibold" colSpan={2}>
              Hull envelope
            </td>
            <td className="px-3 py-2">{`${fmt(ship.min[0])} → ${fmt(ship.max[0])}`}</td>
            <td className="px-3 py-2">{`${fmt(ship.min[1])} → ${fmt(ship.max[1])}`}</td>
            <td className="px-3 py-2">{`${fmt(ship.min[2])} → ${fmt(ship.max[2])}`}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function LatticePage() {
  const recipe = LATTICE_RECIPES[0];
  const mesh = assembleCorvette(recipe, { maxTrisPerPart: 0 });

  if (!mesh) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <Panel>
          <PanelHeader icon="Info" title="Mesh pack unavailable" />
          <p className="px-5 py-4 text-sm text-slate-300">
            <code className="font-mono text-sky-300">public/models/corvette.bin</code> is missing —
            rebuild it with <code className="font-mono">scripts/unreal/build-part-models.py</code>.
          </p>
        </Panel>
      </div>
    );
  }

  const triTotal = mesh.parts.reduce((n, p) => n + p.faces.length, 0);
  const back = assembleCorvette(recipe, { maxTrisPerPart: 110 }) ?? mesh;

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
          {mesh.moduleCount} genuine corvette modules — {triTotal.toLocaleString()} triangles of
          real geometry — assembled purely from snap points. Nothing is eyeballed: the spine
          modules butt face-to-face, the wings use the asset&apos;s own inboard edge, and the
          landing gear is bolted to the ventral face of the hull.
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip accent="#34d399">
            <span className="font-mono text-[10px]">cell 1.00 × 0.50 × 1.00</span>
          </Chip>
          <Chip accent="#38bdf8">
            <span className="font-mono text-[10px]">true game scale</span>
          </Chip>
          <Chip accent="#fb923c">
            <span className="font-mono text-[10px]">{mesh.moduleCount} modules</span>
          </Chip>
        </div>
      </header>

      <Panel>
        <PanelHeader icon="Ship" title={recipe.name} subtitle={recipe.role} />
        <div className="border-b border-white/10">
          <View mesh={mesh} viewIndex={0} size={1440} />
        </div>
        <div className="grid grid-cols-1 gap-px bg-white/10 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#050a11]">
              <View mesh={back} viewIndex={i} size={520} />
              <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                {LATTICE_VIEWS[i].label}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader icon="Ruler" title="Every part, measured where it landed" />
          <div className="p-2">
            <BoundsTable parts={recipe.parts} />
          </div>
        </Panel>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Panel>
            <PanelHeader icon="Info" title="How the grid works" />
            <div className="flex flex-col gap-3 px-5 py-4 text-sm leading-relaxed text-slate-300">
              <p>
                A part&apos;s FBX origin <strong className="text-slate-100">is</strong> its snap
                point, and its bounding box says how far it reaches from there. Reading the real
                meshes gives the whole rule set:
              </p>
              <ul className="flex flex-col gap-1.5 font-mono text-[11px] text-sky-200/90">
                <li>B_COK_A&nbsp;&nbsp;→ z 0.00 … 1.07 — reaches forward</li>
                <li>B_HAB_A&nbsp;&nbsp;→ z −0.97 … 1.02 — two cells, centred</li>
                <li>B_TRU_*&nbsp;&nbsp;→ z −0.62 … 0.01 — nozzle aft</li>
                <li>B_WNG_A&nbsp;&nbsp;→ x 0.00 … 1.00 — root to outboard</li>
                <li>B_LND_A&nbsp;&nbsp;→ y −0.04 … 0.98 — foot to hull</li>
              </ul>
              <p>
                So the assembler simply puts the next snap where the previous part ends:{" "}
                <code className="font-mono text-[11px] text-emerald-300">
                  next.z = current.z + current.zMin − next.zMax
                </code>
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader icon="Wrench" title="Stage 2 — what comes next" />
            <div className="flex flex-col gap-2 px-5 py-4 text-sm text-slate-300">
              <p>This is one hand-built spine. Still to do:</p>
              <ol className="ml-4 list-decimal flex-col gap-1 text-[13px]">
                <li>Port the iconics onto lattice recipes</li>
                <li>Read the <code className="font-mono text-[11px]">_N/_S/_E/_W</code> facing so only legal joins are allowed</li>
                <li>Dorsal kit: turrets, shields, reactors on the real hardpoints</li>
                <li>Wire the builder and randomizer to the lattice engine</li>
              </ol>
              <Link
                href="/models"
                className="mt-1 font-mono text-[11px] text-sky-300 underline decoration-dotted"
              >
                browse all 589 real parts →
              </Link>
            </div>
          </Panel>
        </div>
      </div>

      <HudLabel>
        Assembled from public/models/corvette.bin · {mesh.moduleCount} modules ·{" "}
        {triTotal.toLocaleString()} triangles · true game scale
      </HudLabel>
    </div>
  );
}
