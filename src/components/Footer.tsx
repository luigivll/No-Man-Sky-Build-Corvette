import Link from "next/link";
import { meta } from "@/lib/data";

export default function Footer() {
  return (
    <footer className="relative z-10 mt-10 border-t border-cyan-400/15 bg-void-950/80">
      <div className="mx-auto grid w-full max-w-[1500px] gap-6 px-4 py-7 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div>
          <h3 className="font-display text-xs uppercase tracking-[0.22em] text-cyan-300">
            Data Sources
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            <li>
              <a
                className="inline-flex items-center gap-1 hover:text-cyan-200"
                href={meta.sources[0]}
                target="_blank"
                rel="noreferrer"
              >
                nomansskyresources.com &mdash; Corvette Parts
              </a>
            </li>
            <li>
              <a
                className="inline-flex items-center gap-1 hover:text-cyan-200"
                href={meta.sources[1]}
                target="_blank"
                rel="noreferrer"
              >
                nomansskyrecipes.com &mdash; Corvette Guide
              </a>
            </li>
            <li className="pt-1 text-slate-500">
              Verified against {meta.gameVersion} &middot; {meta.lastVerified}
            </li>
          </ul>
        </div>
        <div>
          <h3 className="font-display text-xs uppercase tracking-[0.22em] text-cyan-300">
            Workshop Quick Facts
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            <li>
              Starter ship bought outright:{" "}
              <span className="hud-mono text-plasma-300">
                ~{(meta.starterShipCost / 1_000_000).toFixed(2)}M Units
              </span>
            </li>
            <li>
              C &rarr; S-class upgrade:{" "}
              <span className="hud-mono text-plasma-300">
                ~{meta.naniteUpgradeCtoS.toLocaleString()} Nanites
              </span>
            </li>
            <li>
              Part cap: <span className="hud-mono text-cyan-200">{meta.maxParts}</span>{" "}
              &middot; Reactor modules:{" "}
              <span className="hud-mono text-cyan-200">{meta.maxReactorModules}</span>
            </li>
            <li>
              Recommended height: {meta.maxRecommendedFloors} floors max
            </li>
          </ul>
        </div>
        <div>
          <h3 className="font-display text-xs uppercase tracking-[0.22em] text-cyan-300">
            Shipyard
          </h3>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <li>
              <Link className="hover:text-cyan-200" href="/builder">
                Manual Builder
              </Link>
            </li>
            <li>
              <Link className="hover:text-cyan-200" href="/randomizer">
                Role Randomizer
              </Link>
            </li>
            <li>
              <Link className="hover:text-cyan-200" href="/blueprints">
                Iconic Blueprints
              </Link>
            </li>
            <li>
              <Link className="hover:text-cyan-200" href="/parts">
                Parts Codex
              </Link>
            </li>
            <li>
              <Link className="hover:text-cyan-200" href="/hangar">
                My Hangar
              </Link>
            </li>
          </ul>
          <p className="mt-3 text-[0.68rem] leading-relaxed text-slate-500">
            Fan-made companion tool. Not affiliated with Hello Games. No Man&apos;s
            Sky is a trademark of Hello Games Ltd. Pop-culture ship names belong
            to their respective rights holders.
          </p>
        </div>
      </div>
    </footer>
  );
}
