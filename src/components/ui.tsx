import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
  accent = "#22d3ee",
  flat = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
  flat?: boolean;
}) {
  return (
    <section
      className={`${flat ? "panel-flat" : "panel"} ${className}`}
      style={{ ["--panel-accent" as string]: accent }}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  subtitle,
  icon,
  accent = "#22d3ee",
  right,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  accent?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-white/5 px-4 py-3">
      <div className="flex items-start gap-3">
        {icon ? (
          <span
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center border"
            style={{
              borderColor: `${accent}55`,
              background: `${accent}14`,
              color: accent,
            }}
          >
            {icon}
          </span>
        ) : null}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-100">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {right}
    </header>
  );
}

export function HudLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`hud-label ${className}`}>{children}</span>;
}

export function Chip({
  children,
  accent,
  className = "",
}: {
  children: ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    <span
      className={`chip ${className}`}
      style={
        accent
          ? { borderColor: `${accent}66`, color: accent, background: `${accent}12` }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export function StatBar({
  value,
  accent = "#22d3ee",
  label,
  right,
}: {
  value: number;
  accent?: string;
  label?: string;
  right?: string;
}) {
  return (
    <div>
      {label ? (
        <div className="mb-1 flex items-center justify-between">
          <span className="hud-label">{label}</span>
          {right ? (
            <span className="hud-mono text-[0.68rem] text-slate-300">{right}</span>
          ) : null}
        </div>
      ) : null}
      <div className="stat-bar">
        <span
          style={{
            width: `${Math.max(2, Math.min(100, value))}%`,
            background: `linear-gradient(90deg, ${accent}, ${accent}aa)`,
            boxShadow: `0 0 12px ${accent}88`,
          }}
        />
      </div>
    </div>
  );
}

export function KeyStat({
  label,
  value,
  sub,
  accent = "#22d3ee",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="panel-flat px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="hud-label">{label}</span>
        {icon ? <span style={{ color: accent }}>{icon}</span> : null}
      </div>
      <div
        className="hud-mono mt-1 text-lg font-semibold"
        style={{ color: accent }}
      >
        {value}
      </div>
      {sub ? <div className="text-[0.7rem] text-slate-400">{sub}</div> : null}
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />
      {label ? <span className="hud-label">{label}</span> : null}
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />
    </div>
  );
}
