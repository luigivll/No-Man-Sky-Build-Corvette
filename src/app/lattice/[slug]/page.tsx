import Link from "next/link";
import { HudLabel, Panel, PanelHeader } from "@/components/ui";
import LatticeView from "@/components/LatticeView";
import { blueprints, blueprintBySlug } from "@/lib/data";
import { LATTICE_RECIPES } from "@/lib/fleet";

/**
 * One iconic ship, built from real corvette parts on the game grid.
 *
 * Server component so `generateStaticParams` can enumerate the blueprint set and
 * the static export emits a page per ship; the interactive renderer inside is a
 * client child because the mesh pack is fetched in the browser.
 */

export function generateStaticParams() {
  return [...LATTICE_RECIPES.map((r) => ({ slug: r.id })), ...blueprints.map((bp) => ({ slug: bp.slug }))];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bp = blueprintBySlug(slug);
  return {
    title: bp ? `${bp.name} · Lattice build · NMS Corvette Shipyard` : "Lattice build",
    description: bp
      ? `${bp.name} assembled from real No Man's Sky corvette parts on the game's own build grid.`
      : undefined,
  };
}

export default async function LatticeBlueprintPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bp = blueprintBySlug(slug);
  const probe = LATTICE_RECIPES.find((r) => r.id === slug) ?? null;
  const index = blueprints.findIndex((b) => b.slug === slug);
  const prev = index > 0 ? blueprints[index - 1] : null;
  const next = index >= 0 && index < blueprints.length - 1 ? blueprints[index + 1] : null;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
      <nav className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
        <Link href="/lattice" className="text-sky-300 underline decoration-dotted">
          Lattice builds
        </Link>
        <span className="text-white/25">/</span>
        <span className="text-slate-200">{bp?.name ?? probe?.name ?? slug}</span>
      </nav>

      {bp || probe ? (
        <LatticeView slug={slug} />
      ) : (
        <Panel>
          <PanelHeader icon="Info" title="Blueprint not found" />
          <p className="px-5 py-4 text-sm text-slate-300">
            Nothing here matches <code className="font-mono text-sky-300">{slug}</code>.
          </p>
        </Panel>
      )}

      <div className="flex items-center justify-between gap-3">
        {prev ? (
          <Link
            href={`/lattice/${prev.slug}`}
            className="font-mono text-[11px] text-sky-300/80 hover:text-sky-200"
          >
            ← {prev.name}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/lattice/${next.slug}`}
            className="font-mono text-[11px] text-sky-300/80 hover:text-sky-200"
          >
            {next.name} →
          </Link>
        ) : (
          <span />
        )}
      </div>

      <HudLabel>
        21 iconic blueprints · all rendered from the same real-asset lattice engine
      </HudLabel>
    </div>
  );
}
