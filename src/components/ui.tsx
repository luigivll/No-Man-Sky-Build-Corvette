"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { useShipyard } from "@/lib/store";

export function Button({
  variant = "ghost",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "ghost" | "danger" | "outline";
  size?: "sm" | "md";
}) {
  const variants = {
    primary:
      "bg-plasma/15 text-plasma border-plasma/40 hover:bg-plasma/25 hover:border-plasma/70 hover:shadow-[0_0_22px_-8px_#4ee1ff]",
    accent:
      "bg-fusion/15 text-fusion border-fusion/40 hover:bg-fusion/25 hover:border-fusion/70 hover:shadow-[0_0_22px_-8px_#ffb547]",
    ghost: "bg-white/[0.03] text-ink-dim border-edge hover:text-ink hover:border-edge-bright hover:bg-white/[0.06]",
    outline: "bg-transparent text-ink border-edge-bright hover:border-plasma/60 hover:text-plasma",
    danger: "bg-alarm/12 text-alarm border-alarm/35 hover:bg-alarm/22 hover:border-alarm/60",
  } as const;

  return (
    <button
      type="button"
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 rounded-lg border font-medium transition-all duration-150",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "px-2.5 py-1.5 text-[11px]" : "px-3.5 py-2 text-xs",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("panel", className)}>{children}</div>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-edge/70 px-4 py-2.5">
      <h3 className="label !text-ink-dim">{children}</h3>
      {right}
    </div>
  );
}

export function Chip({
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        "rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all",
        active
          ? "border-plasma/60 bg-plasma/15 text-plasma shadow-[0_0_16px_-8px_#4ee1ff]"
          : "border-edge bg-white/[0.02] text-ink-faint hover:border-edge-bright hover:text-ink-dim",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string | number;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="panel-inset px-2.5 py-2" title={hint}>
      <div className="label">{label}</div>
      <div className="telemetry mt-0.5 text-[13px] font-semibold" style={{ color: accent ?? "var(--color-ink)" }}>
        {value}
      </div>
    </div>
  );
}

export function Meter({
  label,
  value,
  max,
  color = "var(--color-plasma)",
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="telemetry text-[11px] text-ink-dim">
          {Math.round(value)}
          <span className="text-ink-faint">/{max}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 12px -2px ${color}` }}
        />
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useShipyard((state) => state.toasts);
  const dismiss = useShipyard((state) => state.dismissToast);

  const tones = {
    info: "border-plasma/40 text-plasma",
    success: "border-verdant/40 text-verdant",
    warning: "border-fusion/40 text-fusion",
    error: "border-alarm/40 text-alarm",
  } as const;

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          className={cx(
            "panel animate-rise pointer-events-auto border px-4 py-2.5 text-xs font-medium backdrop-blur-xl",
            tones[toast.tone],
          )}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}

export function Swatch({ color, label }: { color: string; label?: string }) {
  return (
    <span
      className="inline-block h-3 w-3 shrink-0 rounded-[3px] ring-1 ring-white/20"
      style={{ background: color }}
      title={label}
    />
  );
}
