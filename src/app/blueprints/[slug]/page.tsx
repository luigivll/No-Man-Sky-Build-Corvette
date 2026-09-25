import Link from "next/link";
import { notFound } from "next/navigation";
import BlueprintSheet from "@/components/BlueprintSheet";
import LatticeView from "@/components/LatticeView";
import { Icon } from "@/components/Icon";
import { blueprintBySlug, blueprints } from "@/lib/data";

export function generateStaticParams() {
  return blueprints.map((blueprint) => ({ slug: blueprint.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const blueprint = blueprintBySlug(slug);
  if (!blueprint) return { title: "Blueprint not found" };
  return {
    title: `${blueprint.name} (${blueprint.designation}) | NMS Corvette Shipyard`,
    description: `${blueprint.classification} — the exact No Man's Sky Corvette parts list to recreate ${blueprint.name}.`,
  };
}

export default async function BlueprintDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const blueprint = blueprintBySlug(slug);
  if (!blueprint) notFound();

  const others = blueprints.filter((b) => b.id !== blueprint.id).slice(0, 4);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/blueprints" className="btn btn-ghost">
          <Icon name="ChevronRight" className="h-3.5 w-3.5 rotate-180" />
          Back to hangar
        </Link>
        <span className="hud-mono text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
          Blueprint sheet · {blueprint.franchise}
        </span>
      </div>

      <BlueprintSheet blueprint={blueprint} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xs uppercase tracking-[0.2em] text-emerald-300">
            Real-mesh build
          </h2>
          <Link href={`/lattice/${blueprint.slug}`} className="font-mono text-[11px] text-cyan-300/80 underline decoration-dotted">
            full lattice sheet →
          </Link>
        </div>
        <LatticeView slug={blueprint.slug} height={520} />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-cyan-300">
          Next in the hangar
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {others.map((other) => (
            <Link
              key={other.id}
              href={`/blueprints/${other.slug}`}
              className="panel-flat px-3 py-3 transition hover:border-cyan-400/40"
            >
              <span className="hud-label block">{other.franchise}</span>
              <span
                className="font-display text-sm uppercase tracking-wide"
                style={{ color: other.accent }}
              >
                {other.name}
              </span>
              <span className="mt-1 block text-[0.68rem] text-slate-500">
                {other.designation}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
