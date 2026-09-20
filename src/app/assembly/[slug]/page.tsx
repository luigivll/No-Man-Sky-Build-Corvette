import Link from "next/link";
import { notFound } from "next/navigation";
import AssemblyManualView from "@/components/AssemblyManualView";
import { Icon } from "@/components/Icon";
import { buildFromBlueprint, countParts, costBreakdown, formatUnits } from "@/lib/build";
import { blueprints, blueprintBySlug } from "@/lib/data";

export function generateStaticParams() {
  return blueprints.map((blueprint) => ({ slug: blueprint.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const blueprint = blueprintBySlug(slug);
  if (!blueprint) return { title: "Assembly manual | NMS Corvette Shipyard" };
  return {
    title: `${blueprint.name} assembly manual | NMS Corvette Shipyard`,
    description: `Step-by-step Workshop assembly plan for the ${blueprint.name}: every module, the socket it bolts to and the order to place them in.`,
  };
}

export default async function AssemblySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const blueprint = blueprintBySlug(slug);
  if (!blueprint) notFound();

  const build = buildFromBlueprint(blueprint);
  const cost = costBreakdown(build);

  return (
    <AssemblyManualView
      build={build}
      styleId={blueprint.style}
      title={`${blueprint.name} - assembly manual`}
      subtitle={`${blueprint.classification}. Build it in the order the Workshop expects: gear first, engines last, guns on the wing hardpoints.`}
      chips={[blueprint.franchise, `${countParts(build)} modules`, `${formatUnits(cost.total)} U`]}
      backHref={`/blueprints/${blueprint.slug}`}
      backLabel="Blueprint sheet"
      headerRight={
        <>
          <Link href={`/builder?blueprint=${blueprint.slug}`} className="btn">
            <Icon name="Wrench" className="h-3.5 w-3.5" />
            Open in builder
          </Link>
          <Link href={`/blueprints/${blueprint.slug}`} className="btn-ghost">
            <Icon name="ClipboardList" className="h-3.5 w-3.5" />
            Shopping list
          </Link>
        </>
      }
    />
  );
}
