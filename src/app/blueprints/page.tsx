import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Chip, HudLabel, Panel } from "@/components/ui";
import {
  buildFromBlueprint,
  costBreakdown,
  countParts,
  formatUnits,
  inventorySlots,
} from "@/lib/build";
import { blueprints, blueprintsFile } from "@/lib/data";

export const metadata = {
  title: "Iconic Ship Blueprints | NMS Corvette Shipyard",
  description:
    "Recreate the Millennium Falcon, X-Wing, Star Destroyer, UNSC Pelican, Rocinante, USS Enterprise and more with real No Man's Sky Corvette parts.",
};

export default function BlueprintsPage() {
  const cards = blueprints.map((blueprint) => {
    const build = buildFromBlueprint(blueprint);
    const cost = costBreakdown(build);
    return {
      blueprint,
      modules: countParts(build),
      cost: cost.total,
      vendors: cost.buyable,
      salvage: cost.salvage,
      slots: inventorySlots(build),
    };
  });

  const franchises = [...new Set(blueprints.map((b) => b.franchise))];

  return (
    <div className="space-y-6">
      <header className="panel scanlines relative overflow-hidden p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Chip accent="#a855f7">{blueprintsFile.meta.title}</Chip>
          <Chip accent="#22d3ee">{blueprints.length} blueprints</Chip>
          <Chip>{franchises.length} franchises</Chip>
        </div>
        <h1 className="mt-4 font-display text-3xl font-black uppercase tracking-[0.08em] text-slate-50">
          Iconic Ship <span className="text-violet-glow">Blueprints</span>
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
          {blueprintsFile.meta.subtitle} Each sheet lists the exact Workshop
          modules, quantities, notes on how to make the silhouette read, an
          estimated Unit cost and the Nanite bill for taking it to S-class.
        </p>
        <p className="mt-3 max-w-3xl text-[0.7rem] leading-relaxed text-slate-500">
          {blueprintsFile.meta.disclaimer}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ blueprint, modules, cost, vendors, salvage, slots }) => (
          <Panel
            key={blueprint.id}
            accent={blueprint.accent}
            className="group flex flex-col overflow-hidden transition hover:-translate-y-0.5"
          >
            <div
              className="h-1 w-full"
              style={{
                background: `linear-gradient(90deg, ${blueprint.accent}, ${blueprint.accent2}, transparent)`,
              }}
            />
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <HudLabel>{blueprint.franchise}</HudLabel>
                  <h2
                    className="font-display text-base font-bold uppercase tracking-[0.08em] text-slate-100"
                    style={{ textShadow: `0 0 18px ${blueprint.accent}55` }}
                  >
                    {blueprint.name}
                  </h2>
                  <p className="hud-mono text-[0.68rem] text-slate-400">
                    {blueprint.designation}
                  </p>
                </div>
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center border font-display text-sm font-black"
                  style={{
                    borderColor: `${blueprint.accent}66`,
                    background: `${blueprint.accent}14`,
                    color: blueprint.accent,
                  }}
                >
                  {blueprint.difficulty}
                </span>
              </div>

              <p className="text-xs leading-relaxed text-slate-400">
                {blueprint.blurb}
              </p>

              <div className="mt-auto grid grid-cols-2 gap-2">
                <div className="panel-flat px-2.5 py-1.5">
                  <HudLabel>Modules</HudLabel>
                  <div className="hud-mono text-sm text-cyan-200">{modules}</div>
                </div>
                <div className="panel-flat px-2.5 py-1.5">
                  <HudLabel>Cost</HudLabel>
                  <div className="hud-mono text-sm text-plasma-300">
                    {formatUnits(cost)} U
                  </div>
                </div>
                <div className="panel-flat px-2.5 py-1.5">
                  <HudLabel>Vendor</HudLabel>
                  <div className="hud-mono text-xs text-slate-200">
                    {formatUnits(vendors)} U
                  </div>
                </div>
                <div className="panel-flat px-2.5 py-1.5">
                  <HudLabel>Salvage</HudLabel>
                  <div className="hud-mono text-xs text-signal-400">
                    {formatUnits(salvage)} U
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[0.68rem] text-slate-500">
                <span className="hud-mono">+{slots} slots</span>
                <span>&middot;</span>
                <span>{blueprint.role}</span>
              </div>

              <Link
                href={`/blueprints/${blueprint.slug}`}
                className="btn w-full"
                style={{ borderColor: `${blueprint.accent}66` }}
              >
                <Icon name="ClipboardList" className="h-3.5 w-3.5" />
                Open blueprint sheet
              </Link>
            </div>
          </Panel>
        ))}
      </div>

      <section className="panel-flat p-4">
        <h2 className="font-display text-xs uppercase tracking-[0.18em] text-cyan-300">
          How these blueprints are built
        </h2>
        <ul className="mt-2 grid gap-1.5 text-xs text-slate-400 md:grid-cols-2">
          <li>
            Every module listed exists in the {blueprintsFile.meta.disclaimer.includes("Voyagers") ? "Voyagers" : "current"} parts
            pool &mdash; nothing is invented.
          </li>
          <li>
            Optional modules are cosmetic padding: skip them to save Units or
            stay under the 160-part cap.
          </li>
          <li>
            Costs are calculated from the parts database, so editing
            <span className="hud-mono text-cyan-300"> data/parts.json </span>
            re-prices every sheet instantly.
          </li>
          <li>
            Blueprints are suggestions, not gospel &mdash; load one into the
            builder and remix it.
          </li>
        </ul>
      </section>
    </div>
  );
}
