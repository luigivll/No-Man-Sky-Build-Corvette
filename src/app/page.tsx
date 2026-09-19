import Link from "next/link";
import ContinueBuildCard from "@/components/ContinueBuildCard";
import ModeCard from "@/components/ModeCard";
import { Icon } from "@/components/Icon";
import { Chip, Divider, HudLabel, Panel, PanelHeader } from "@/components/ui";
import { blueprints, categories, meta, parts, requirements } from "@/lib/data";
import { formatNumber } from "@/lib/build";

const MODES = [
  {
    href: "/builder",
    title: "Build from Scratch",
    tagline: "Step-by-step Workshop assembly with a live shopping list.",
    bullets: [
      "Walk the exact build order the Workshop expects",
      "Live hull schematic, stat radar and cost meter",
      "Export a tick-box list to your Notes app or Notes terminal",
    ],
    accent: "#22d3ee",
    icon: "Wrench",
    cta: "Open builder",
  },
  {
    href: "/randomizer",
    title: "Randomize by Role",
    tagline: "Procedural Corvettes weighted by how you actually fly.",
    bullets: [
      "Combat, Exploration, Massive and Minimalist role weighting",
      "Seeded rolls you can share, lock and reroll",
      "Guarantees: Deadeye + High-Energy on Combat, Heavy Gear on Massive",
    ],
    accent: "#ff7a1a",
    icon: "Dices",
    cta: "Roll a hull",
  },
  {
    href: "/blueprints",
    title: "Iconic Ship Blueprints",
    tagline: "Recreate legendary ships from the parts pool.",
    bullets: [
      `${blueprints.length} verified part lists from sci-fi classics`,
      "Exact modules, quantities, unit cost and build tips",
      "Load any blueprint straight into the builder",
    ],
    accent: "#a855f7",
    icon: "Ship",
    cta: "Enter the hangar",
  },
];

export default function HomePage() {
  const salvageOnly = parts.filter((part) => !part.buyable).length;

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="panel scanlines relative overflow-hidden p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Chip accent="#22d3ee">{meta.gameVersion}</Chip>
            <Chip accent="#ff7a1a">Corvette Workshop</Chip>
            <Chip>Updated {meta.lastVerified}</Chip>
          </div>

          <h1 className="mt-4 font-display text-3xl font-black uppercase leading-tight tracking-[0.06em] text-slate-50 neon-text sm:text-4xl">
            NMS Corvette
            <br />
            <span className="text-cyan-300">Shipyard</span>
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
            A workshop companion for the Voyagers update. Browse every Corvette
            module, price a build before you spend a single Unit, roll role-based
            hulls, and replicate the ships you actually want to fly &mdash;
            Millennium Falcon, X-Wing, Pelican, Rocinante and friends &mdash;
            using parts that genuinely exist in the game.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/builder" className="btn">
              <Icon name="Wrench" className="h-4 w-4" />
              Build from scratch
            </Link>
            <Link href="/randomizer" className="btn btn-plasma">
              <Icon name="Dices" className="h-4 w-4" />
              Randomize by role
            </Link>
            <Link href="/blueprints" className="btn btn-ghost">
              <Icon name="Ship" className="h-4 w-4" />
              Iconic blueprints
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Modules", value: `${parts.length}` },
              { label: "Categories", value: `${categories.length}` },
              { label: "Blueprints", value: `${blueprints.length}` },
              { label: "Salvage-only", value: `${salvageOnly}` },
            ].map((item) => (
              <div key={item.label} className="panel-flat px-3 py-2">
                <HudLabel>{item.label}</HudLabel>
                <div className="hud-mono text-lg text-cyan-200">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <ContinueBuildCard />
      </section>

      <section>
        <Divider label="Select operation mode" />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {MODES.map((mode) => (
            <ModeCard key={mode.href} {...mode} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel
          accent="#ff7a1a"
          className="overflow-hidden"
        >
          <PanelHeader
            title="Corvette Workshop briefing"
            subtitle={meta.workshopLocation}
            icon={<Icon name="Radar" className="h-4 w-4" />}
            accent="#ff7a1a"
          />
          <div className="space-y-4 p-4">
            <div>
              <HudLabel>Terminal options</HudLabel>
              <ul className="mt-1.5 space-y-1.5 text-xs text-slate-300">
                {meta.workshopOptions.map((option) => (
                  <li key={option} className="flex items-start gap-2">
                    <Icon
                      name="ChevronRight"
                      className="mt-0.5 h-3 w-3 shrink-0 text-plasma-400"
                      strokeWidth={2.5}
                    />
                    {option}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <HudLabel>Where salvaged modules drop</HudLabel>
              <ul className="mt-1.5 space-y-1.5 text-xs text-slate-300">
                {meta.salvageSources.map((source) => (
                  <li key={source} className="flex items-start gap-2">
                    <Icon
                      name="Boxes"
                      className="mt-0.5 h-3 w-3 shrink-0 text-cyan-300"
                      strokeWidth={2}
                    />
                    {source}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { label: "Part cap", value: `${meta.maxParts}` },
                { label: "Soft cap", value: `${meta.softPartCap}` },
                { label: "Max floors", value: `${meta.maxRecommendedFloors}` },
                { label: "Reactors max", value: `${meta.maxReactorModules}` },
                {
                  label: "Starter ship",
                  value: `${formatNumber(meta.starterShipCost)} U`,
                },
                {
                  label: "C → S nanites",
                  value: formatNumber(meta.naniteUpgradeCtoS),
                },
              ].map((item) => (
                <div key={item.label} className="panel-flat px-3 py-2">
                  <HudLabel>{item.label}</HudLabel>
                  <div className="hud-mono text-sm text-slate-100">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[0.7rem] leading-relaxed text-slate-500">
              {meta.adjacencyNote}
            </p>
          </div>
        </Panel>

        <Panel accent="#22d3ee" className="overflow-hidden">
          <PanelHeader
            title="Flight certification requirements"
            subtitle="A Corvette must pass every check before the Workshop finalises the build."
            icon={<Icon name="ListChecks" className="h-4 w-4" />}
          />
          <div className="divide-y divide-white/5">
            {categories.map((category) => {
              const requirement = requirements.find(
                (r) => r.categoryId === category.id,
              );
              if (!requirement) return null;
              return (
                <div
                  key={category.id}
                  className="flex items-start gap-3 px-4 py-2.5"
                >
                  <span
                    className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center border"
                    style={{
                      borderColor: `${category.accent}55`,
                      background: `${category.accent}12`,
                      color: category.accent,
                    }}
                  >
                    <Icon name={category.icon} className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-100">
                        {category.label}
                      </span>
                      <span className="hud-mono text-[0.68rem] text-cyan-300">
                        min {requirement.min}
                      </span>
                    </div>
                    <p className="text-[0.7rem] text-slate-500">
                      {requirement.note}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-white/5 px-4 py-3 text-[0.7rem] leading-relaxed text-slate-400">
            Buying the full minimum set from the vendor costs about{" "}
            <span className="hud-mono text-plasma-300">
              {formatNumber(meta.starterShipCost)} Units
            </span>
            . Salvage is free: planetary Salvageable Scrap, derelict freighter
            fabrication terminals and pirate wrecks all drop modules &mdash; often
            the rarer ones you cannot buy at all.
          </div>
        </Panel>
      </section>
    </div>
  );
}
