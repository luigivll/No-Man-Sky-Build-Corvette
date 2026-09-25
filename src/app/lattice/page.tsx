import Link from "next/link";
import { Chip, HudLabel, Panel, PanelHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { blueprints } from "@/lib/data";
import { blueprintToRecipe } from "@/lib/blueprintLattice";
import { LATTICE_RECIPES } from "@/lib/fleet";

/**
 * Lattice builds index.
 *
 * Every iconic blueprint is compiled to a lattice recipe on the server — the
 * compiler is pure data, so the static export ships the module counts and
 * dimensions for all 21 without shipping a single triangle.
 */

export const metadata = {
  title: "Lattice builds · NMS Corvette Shipyard",
  description:
    "The 21 iconic blueprints assembled from real No Man's Sky corvette parts on the game's own build grid.",
};

export default function LatticeIndexPage() {
  const entries = blueprints.map((bp) => {
    const recipe = blueprintToRecipe(bp);
    const prologue = LATTICE_RECIPES.find((r) => r.id === recipe.id);
    return { bp, recipe, custom: Boolean(prologue) };
  });

  const probe = LATTICE_RECIPES[0];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-emerald-400/80">
          <Icon name="Boxes" className="h-3.5 w-3.5" />
          <span>Lattice builds · real geometry</span>
        </div>
        <h1 className="text-3xl font-semibold text-slate-50 sm:text-4xl">
          Iconic ships, from real Corvette parts
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
          Every blueprint below is compiled to a recipe and assembled from the 589 real game
          meshes on the 6.0 × 3.0 × 6.0 build lattice. The compiler is deterministic: a part&apos;s
          FBX origin is its snap point, so spine modules butt face-to-face and nothing floats.
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip accent="#34d399">
            <span className="font-mono text-[10px]">{entries.length} blueprints</span>
          </Chip>
          <Chip accent="#38bdf8">
            <span className="font-mono text-[10px]">lattice 1.00 × 0.50 × 1.00 per cell</span>
          </Chip>
          <Chip accent="#fb923c">
            <span className="font-mono text-[10px]">589 real meshes</span>
          </Chip>
        </div>
      </header>

      <Panel>
        <PanelHeader
          icon="Wrench"
          title="Reference build"
          subtitle="The hand-tuned probe the compiler is measured against"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-sm text-slate-200">{probe.name}</p>
            <p className="font-mono text-[11px] text-white/45">
              {probe.parts.length} modules · {probe.role}
            </p>
          </div>
          <Link
            href="/lattice/lattice-probe"
            className="font-mono text-[11px] text-sky-300 underline decoration-dotted"
          >
            open build →
          </Link>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map(({ bp, recipe }) => (
          <Link
            key={bp.slug}
            href={`/lattice/${bp.slug}`}
            className="group flex flex-col gap-2 border border-white/10 bg-[#070c14] p-4 transition-colors hover:border-sky-400/40 hover:bg-[#0a1420]"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-[13px] uppercase tracking-[0.12em] text-slate-100">
                  {bp.name}
                </p>
                <p className="font-mono text-[10px] text-white/40">{bp.designation}</p>
              </div>
              <span
                className="shrink-0 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]"
                style={{ borderColor: `${bp.accent}66`, color: bp.accent }}
              >
                {bp.franchise}
              </span>
            </div>
            <p className="line-clamp-2 text-[12px] leading-relaxed text-slate-400">{bp.blurb}</p>
            <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-1 font-mono text-[10px] text-white/45">
              <span className="text-emerald-300/80">{recipe.parts.length} modules</span>
              <span>{bp.parts.reduce((n, p) => n + (p.qty ?? 1), 0)} units bought</span>
              <span>{bp.role}</span>
            </div>
          </Link>
        ))}
      </div>

      <HudLabel>
        Compiled by src/lib/blueprintLattice.ts · assembled by src/lib/lattice.ts · every mesh from
        public/models/corvette.bin
      </HudLabel>
    </div>
  );
}
