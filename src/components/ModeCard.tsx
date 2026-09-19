import Link from "next/link";
import { Icon } from "./Icon";

export default function ModeCard({
  href,
  title,
  tagline,
  bullets,
  accent,
  icon,
  cta,
}: {
  href: string;
  title: string;
  tagline: string;
  bullets: string[];
  accent: string;
  icon: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="panel group flex flex-col gap-3 p-5 transition hover:-translate-y-0.5"
      style={{ borderColor: `${accent}44` }}
    >
      <div className="flex items-center gap-3">
        <span
          className="grid h-11 w-11 place-items-center border"
          style={{ borderColor: `${accent}66`, background: `${accent}16`, color: accent }}
        >
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <div>
          <h3
            className="font-display text-sm font-bold uppercase tracking-[0.14em]"
            style={{ color: accent }}
          >
            {title}
          </h3>
          <p className="text-xs text-slate-400">{tagline}</p>
        </div>
      </div>

      <ul className="space-y-1.5 text-xs text-slate-400">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2">
            <Icon
              name="ChevronRight"
              className="mt-0.5 h-3 w-3 shrink-0"
              strokeWidth={2.5}
            />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      <span
        className="mt-auto inline-flex items-center gap-2 font-display text-[0.68rem] uppercase tracking-[0.18em] transition group-hover:gap-3"
        style={{ color: accent }}
      >
        {cta}
        <Icon name="ChevronRight" className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
