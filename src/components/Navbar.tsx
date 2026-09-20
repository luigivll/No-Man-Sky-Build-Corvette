"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { countParts } from "@/lib/build";
import { meta } from "@/lib/data";
import { useBuild } from "./BuildProvider";
import { Icon } from "./Icon";

const LINKS = [
  { href: "/", label: "Bridge", icon: "Home" },
  { href: "/builder", label: "Builder", icon: "Wrench" },
  { href: "/randomizer", label: "Randomizer", icon: "Dices" },
  { href: "/blueprints", label: "Iconic Blueprints", icon: "Ship" },
  { href: "/assembly", label: "Assembly Manual", icon: "ClipboardList" },
  { href: "/parts", label: "Parts Codex", icon: "BookOpen" },
  { href: "/hangar", label: "My Hangar", icon: "Save" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { build, hangar } = useBuild();
  const moduleCount = countParts(build);

  return (
    <header className="relative z-20 border-b border-cyan-400/15 bg-void-950/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="group flex items-center gap-3">
            <span className="relative grid h-10 w-10 place-items-center border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
              <Icon name="Ship" className="h-5 w-5" />
              <span className="absolute -bottom-px left-0 h-px w-full bg-gradient-to-r from-cyan-400/0 via-cyan-400 to-cyan-400/0" />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-sm font-black uppercase tracking-[0.24em] text-slate-100 group-hover:text-cyan-200">
                NMS Corvette Shipyard
              </span>
              <span className="hud-label">
                {meta.gameVersion} &middot; Corvette Workshop Companion
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-4 md:flex">
            <div className="text-right">
              <span className="hud-label block">Active Build</span>
              <span className="hud-mono text-xs text-cyan-200">
                {moduleCount} / {meta.maxParts} modules
              </span>
            </div>
            <div className="text-right">
              <span className="hud-label block">Hangar</span>
              <span className="hud-mono text-xs text-plasma-300">
                {hangar.length} saved
              </span>
            </div>
          </div>
        </div>

        <nav className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto pb-0.5">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex shrink-0 items-center gap-2 border px-3 py-1.5 font-display text-[0.66rem] uppercase tracking-[0.16em] transition ${
                  active
                    ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                    : "border-transparent text-slate-400 hover:border-cyan-400/25 hover:text-cyan-200"
                }`}
              >
                <Icon name={link.icon} className="h-3.5 w-3.5" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
