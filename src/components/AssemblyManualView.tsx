"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Chip, HudLabel, Panel } from "./ui";
import { compileManual } from "@/lib/assembly";
import { formatUnits } from "@/lib/build";
import { projectScene, DEFAULT_VIEW, type ProjectedScene, type ViewState } from "@/lib/render3d";
import type { Build } from "@/lib/types";

/**
 * The assembly booklet: one numbered section at a time, drawn the way a flat-pack
 * manual is - everything already bolted on as solid line art, the module you are
 * holding picked out in the section accent, and the rest of the frame ghosted so
 * you can see where it is heading. The last page shows the finished ship.
 */

const VIEW: ViewState = { yaw: DEFAULT_VIEW.yaw, pitch: -0.42, zoom: 1 };
const PRINT_VIEW: ViewState = { yaw: DEFAULT_VIEW.yaw, pitch: -0.5, zoom: 1 };

interface Props {
  build: Build;
  styleId?: string;
  title: string;
  subtitle?: string;
  chips?: string[];
  backHref?: string;
  backLabel?: string;
  /** renders the build/blueprint actions in the header */
  headerRight?: React.ReactNode;
  autoplayMs?: number;
}

export default function AssemblyManualView({
  build,
  styleId,
  title,
  subtitle,
  chips = [],
  backHref,
  backLabel,
  headerRight,
  autoplayMs = 2600,
}: Props) {
  const manual = useMemo(() => compileManual(build, { style: styleId }), [build, styleId]);
  const steps = manual.steps;
  const pageCount = steps.length + 1; // + the finished-ship page

  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showFrame, setShowFrame] = useState(true);
  const [printMode, setPrintMode] = useState<"none" | "current" | "all">("none");
  const [printReady, setPrintReady] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 900, height: 520 });
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const finished = page >= steps.length;
  const step = steps[Math.min(page, steps.length - 1)];

  const placedKeys = useMemo(
    () => (finished ? manual.mesh.modules.map((m) => m.key) : step.cumulative),
    [finished, manual.mesh.modules, step],
  );

  const activeKeys = useMemo(
    () => (finished ? [] : step.placements.map((p) => p.key)),
    [finished, step],
  );

  const accent = finished ? "#0f172a" : step.sectionId ? sectionAccent(manual, step.sectionId) : "#7c5cff";

  const scene: ProjectedScene = useMemo(
    () =>
      projectScene(manual.mesh, VIEW, size.width, size.height, {
        padding: finished ? 1.3 : 1.42,
        material: finished ? "render" : "manual",
        activeKeys,
        placedKeys,
        accent,
        showDecor: finished,
      }),
    [manual.mesh, size.width, size.height, activeKeys, placedKeys, accent, finished],
  );

  /* ---- measure ---- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: Math.max(300, rect.width), height: Math.max(260, rect.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* ---- playback ---- */
  useEffect(() => {
    if (!playing) return;
    if (page >= pageCount - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setPage((current) => Math.min(pageCount - 1, current + 1));
    }, autoplayMs);
    return () => window.clearTimeout(timer);
  }, [playing, page, pageCount, autoplayMs]);

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        setPlaying(false);
        setPage((current) => Math.min(pageCount - 1, current + 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPlaying(false);
        setPage((current) => Math.max(0, current - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageCount]);

  /* ---- printing ---- */
  const printPages = printMode === "all" ? manual.sections : printMode === "current" ? [currentSection(manual, step)] : [];
  useEffect(() => {
    if (printMode === "none") {
      setPrintReady(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setPrintReady(true);
      window.print();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [printMode]);

  useEffect(() => {
    if (printMode === "none") return;
    const after = () => setPrintMode("none");
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, [printMode]);

  const go = useCallback(
    (delta: number) => {
      setPlaying(false);
      setPage((current) => Math.max(0, Math.min(pageCount - 1, current + delta)));
    },
    [pageCount],
  );

  const sectionProgress = manual.sections.map((section) => ({
    id: section.id,
    title: section.title,
    steps: section.steps.length,
    startIndex: steps.findIndex((s) => s.id === section.steps[0]?.id),
  }));

  const currentSectionIndex = finished
    ? manual.sections.length - 1
    : manual.sections.findIndex((section) => section.id === step.sectionId);
  const activeSection = manual.sections[Math.max(0, currentSectionIndex)];

  return (
    <div className="space-y-4">
      {/* ---------- header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {backHref ? (
            <a
              href={backHref}
              className="mb-1 inline-flex items-center gap-1 font-mono text-[0.62rem] uppercase tracking-wider text-slate-400 transition hover:text-cyan-200"
            >
              <Icon name="ChevronRight" className="h-3 w-3 rotate-180" />
              {backLabel ?? "Back"}
            </a>
          ) : null}
          <h1 className="font-display text-2xl font-black uppercase tracking-[0.06em] text-slate-50">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip accent="#22d3ee">
              {manual.moduleCount} modules · {steps.length} steps
            </Chip>
            <Chip accent="#a855f7">{manual.sections.length} sections</Chip>
            <Chip accent="#f59e0b">{formatUnits(manual.totalCost)} U</Chip>
            {chips.map((chip) => (
              <Chip key={chip}>{chip}</Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{headerRight}</div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
        {/* ---------- the page ---------- */}
        <div className="space-y-3">
          <div className="manual-paper relative overflow-hidden border border-white/15">
            {/* page furniture: like a printed booklet sheet */}
            <div
              className={`pointer-events-none absolute left-3 top-3 z-10 border px-2 py-1 ${
                finished ? "border-white/15 bg-void-950/80" : "border-black/10 bg-white/70"
              }`}
            >
              <span
                className={`font-mono text-[0.58rem] uppercase tracking-wider ${
                  finished ? "text-slate-400" : "text-slate-500"
                }`}
              >
                {finished ? "Assembly complete" : `${manual.moduleCount} modules · step ${step.index} of ${step.of}`}
              </span>
            </div>
            <div
              className={`pointer-events-none absolute right-3 top-3 z-10 border px-2 py-1 text-right ${
                finished ? "border-white/15 bg-void-950/80" : "border-black/10 bg-white/70"
              }`}
            >
              <span
                className={`font-mono text-[0.58rem] uppercase tracking-wider ${
                  finished ? "text-slate-400" : "text-slate-500"
                }`}
              >
                SECTION: {String(Math.max(1, currentSectionIndex + 1)).padStart(2, "0")}/
                {String(manual.sections.length).padStart(2, "0")}
              </span>
              <span
                className={`ml-2 font-mono text-[0.58rem] lowercase tracking-wider ${
                  finished ? "text-slate-500" : "text-slate-400"
                }`}
              >
                {finished ? "flight ready" : activeSection?.title.toLowerCase()}
              </span>
            </div>

            <div ref={wrapRef} className="h-[440px] w-full sm:h-[520px]">
              <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
                <defs>
                  <pattern id="manual-dots" width="16" height="16" patternUnits="userSpaceOnUse">
                    <circle cx="1.4" cy="1.4" r="0.9" fill="rgba(15,23,42,0.16)" />
                  </pattern>
                </defs>
                <rect
                  width={size.width}
                  height={size.height}
                  fill={finished ? "#04060d" : "#fbfbfd"}
                />
                {finished ? (
                  <>
                    {scene.nebula.map((cloud, index) => (
                      <ellipse
                        key={`neb-${index}`}
                        cx={cloud.x}
                        cy={cloud.y}
                        rx={cloud.rx}
                        ry={cloud.ry}
                        fill={cloud.color}
                        opacity={cloud.alpha}
                        transform={`rotate(${cloud.rotate} ${cloud.x} ${cloud.y})`}
                        style={{ filter: "blur(26px)" }}
                      />
                    ))}
                    {scene.stars.map((star, index) => (
                      <circle
                        key={`st-${index}`}
                        cx={star.x}
                        cy={star.y}
                        r={star.r}
                        fill="#e8f4ff"
                        opacity={star.alpha}
                      />
                    ))}
                  </>
                ) : (
                  <rect width={size.width} height={size.height} fill="url(#manual-dots)" />
                )}

                {finished ? (
                  <g>
                    {scene.plumes.map((plume, index) => (
                      <g key={`tr-${index}`}>
                        {plume.segments.map((segment, segIndex) => (
                          <polygon
                            key={segIndex}
                            points={segment.points}
                            fill={manual.mesh.style.trail}
                            opacity={segment.alpha}
                          />
                        ))}
                      </g>
                    ))}
                  </g>
                ) : null}

                {/* ghost pass: the rest of the frame, so you can see where it goes */}
                <g>
                  {scene.faces
                    .filter((face) => face.state === "ghost" && showFrame)
                    .map((face, index) => (
                      <polygon
                        key={`g-${index}`}
                        points={face.points}
                        fill="#ffffff"
                        fillOpacity={0.62}
                        stroke="rgba(30,41,59,0.16)"
                        strokeWidth={0.6}
                        strokeDasharray="2.5 2"
                      />
                    ))}
                </g>

                {/* already installed */}
                <g>
                  {scene.faces
                    .filter((face) => face.state === "placed" || face.state === "decor")
                    .map((face, index) => (
                      <polygon
                        key={`p-${index}`}
                        points={face.points}
                        fill={face.fill}
                        opacity={face.state === "decor" ? 0.4 : 1}
                        stroke={
                          finished
                            ? face.kind === "emissive" || face.kind === "trim"
                              ? face.fill
                              : "rgba(3,6,12,0.45)"
                            : "rgba(15,23,42,0.55)"
                        }
                        strokeWidth={finished ? (face.kind === "emissive" || face.kind === "trim" ? 2 : 0.3) : 0.7}
                        strokeLinejoin="round"
                        onMouseEnter={() => setHovered(face.partName)}
                        onMouseLeave={() => setHovered(null)}
                      />
                    ))}
                </g>

                {finished ? (
                  <g>
                    {scene.plumes.map((plume, index) => (
                      <polygon key={`core-${index}`} points={plume.core} fill="#fff2d8" opacity={0.7} />
                    ))}
                  </g>
                ) : null}

                {/* the module you are holding right now */}
                <g>
                  {scene.faces
                    .filter((face) => face.state === "active")
                    .map((face, index) => (
                      <polygon
                        key={`a-${index}`}
                        points={face.points}
                        fill={face.fill}
                        stroke={accent}
                        strokeWidth={1.25}
                        strokeLinejoin="round"
                        onMouseEnter={() => setHovered(face.partName)}
                        onMouseLeave={() => setHovered(null)}
                      />
                    ))}
                </g>
              </svg>

              {hovered ? (
                <div className="pointer-events-none absolute bottom-[86px] left-3 z-10 border border-black/10 bg-white/85 px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wider text-slate-600">
                  {hovered}
                </div>
              ) : null}
            </div>

            {/* ---------- caption bar ---------- */}
            <div
              className={`relative z-10 border-t px-3 py-2.5 ${
                finished ? "border-white/10 bg-void-950/90" : "border-black/10 bg-white/85"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="border px-1.5 py-0.5 font-mono text-[0.58rem] uppercase tracking-wider"
                  style={{
                    borderColor: `${accent}66`,
                    color: accent === "#0f172a" ? "#334155" : accent,
                    background: `${accent}12`,
                  }}
                >
                  {finished ? "SECTION: FINAL" : `SECTION ${String(currentSectionIndex + 1).padStart(2, "0")}/${String(manual.sections.length).padStart(2, "0")}`}
                </span>
                <span
                  className={`font-display text-sm font-bold uppercase tracking-[0.06em] ${
                    finished ? "text-slate-100" : "text-slate-800"
                  }`}
                >
                  {finished ? "Finished ship" : activeSection?.title}
                </span>
                <span className="font-mono text-[0.62rem] text-slate-500">
                  {finished
                    ? "all modules bolted on - this is the launch configuration"
                    : `step ${step.index}/${step.of}`}
                </span>
                {!finished ? (
                  <span className="ml-auto font-mono text-[0.62rem] text-slate-500">
                    {step.placements[0]?.offset}
                  </span>
                ) : null}
              </div>

              <div
                className={`mt-1.5 flex flex-wrap items-center gap-3 font-mono text-[0.58rem] uppercase tracking-wider ${
                  finished ? "text-slate-500" : "text-slate-500"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-4 border" style={{ borderColor: accent, background: `${accent}55` }} />
                  this step
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-4 border border-slate-700 bg-slate-200" />
                  already fitted
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-4 border border-dashed border-slate-400 bg-white/60" />
                  later sections
                </span>
              </div>

              {!finished ? (
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-sm font-semibold text-slate-800">{step.title}</p>
                  {step.body.map((line, index) => (
                    <p key={index} className="text-[0.72rem] leading-relaxed text-slate-600">
                      <span className="mr-1 text-slate-400">·</span>
                      {line}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-[0.72rem] leading-relaxed text-slate-400">
                  Every module is on its socket. Take the sheet to the Workshop terminal, place the
                  parts in this order, and this is what comes off the assembly pad.
                </p>
              )}
            </div>

            {/* ---------- progress strip (video-player style, as in the guides) ---------- */}
            <div
              className={`relative z-10 flex items-center gap-3 border-t px-3 py-2 ${
                finished ? "border-white/10 bg-void-950/90" : "border-black/10 bg-white/90"
              }`}
            >
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={page === 0}
                className="grid h-7 w-7 place-items-center border border-black/15 bg-white text-slate-700 transition hover:border-slate-400 disabled:opacity-35"
                aria-label="Previous step"
              >
                <Icon name="ChevronRight" className="h-4 w-4 rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => setPlaying((current) => !current)}
                className="grid h-7 w-7 place-items-center border border-black/15 bg-white text-slate-700 transition hover:border-slate-400"
                aria-label={playing ? "Pause" : "Play the assembly"}
              >
                <Icon name={playing ? "X" : "Rocket"} className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                disabled={page >= pageCount - 1}
                className="grid h-7 w-7 place-items-center border border-black/15 bg-white text-slate-700 transition hover:border-slate-400 disabled:opacity-35"
                aria-label="Next step"
              >
                <Icon name="ChevronRight" className="h-4 w-4" />
              </button>

              <div className="relative h-1.5 flex-1 bg-slate-300/70">
                {sectionProgress.map((section) => (
                  <span
                    key={section.id}
                    className="absolute -top-1 h-3.5 w-px bg-slate-400"
                    style={{ left: `${(section.startIndex / Math.max(1, pageCount - 1)) * 100}%` }}
                  />
                ))}
                <span
                  className="absolute -top-1 h-3.5 w-0.5 bg-slate-800"
                  style={{ left: `${(page / Math.max(1, pageCount - 1)) * 100}%` }}
                />
                <span
                  className="absolute inset-y-0 left-0 bg-slate-800"
                  style={{ width: `${(page / Math.max(1, pageCount - 1)) * 100}%` }}
                />
              </div>

              <span className="font-mono text-[0.6rem] text-slate-500">
                {String(page + 1).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={() => setShowFrame((current) => !current)}
                className={`hidden border px-2 py-1 font-mono text-[0.58rem] uppercase tracking-wider transition sm:block ${
                  showFrame ? "border-slate-500 bg-slate-200 text-slate-800" : "border-black/15 bg-white text-slate-600 hover:border-slate-400"
                }`}
                title="Show the finished frame behind the current step"
              >
                Ghost frame
              </button>
              <button
                type="button"
                onClick={() => setPrintMode("current")}
                className="border border-black/15 bg-white px-2 py-1 font-mono text-[0.58rem] uppercase tracking-wider text-slate-600 transition hover:border-slate-400"
                title="Print this section"
              >
                Print
              </button>
              <button
                type="button"
                onClick={() => setPrintMode("all")}
                className="hidden border border-black/15 bg-white px-2 py-1 font-mono text-[0.58rem] uppercase tracking-wider text-slate-600 transition hover:border-slate-400 md:block"
                title="Print the whole booklet"
              >
                Booklet
              </button>
            </div>
          </div>

          <p className="text-[0.68rem] leading-relaxed text-slate-500">
            Arrow keys or the strip move between steps. Grey outlines are the modules that bolt on
            later, solid plates are already fitted, the highlighted parts are the ones in your hand.
            The layout comes from the same socket engine the 3D preview uses, so nothing in the
            drawing sits anywhere it cannot actually mount.
          </p>
        </div>

        {/* ---------- section index ---------- */}
        <aside className="space-y-3">
          <Panel accent="#22d3ee">
            <div className="flex items-center justify-between">
              <HudLabel>Sections</HudLabel>
              <span className="font-mono text-[0.6rem] text-slate-500">
                {steps.length} steps
              </span>
            </div>
            <ol className="mt-2 space-y-1">
              {manual.sections.map((section, index) => {
                const sectionStart = steps.findIndex((s) => s.id === section.steps[0].id);
                const isActive = !finished && section.id === step.sectionId;
                const isDone = finished || sectionStart < page;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setPage(sectionStart);
                      }}
                      className={`flex w-full items-center gap-2 border px-2 py-1.5 text-left transition ${
                        isActive
                          ? "border-cyan-400/60 bg-cyan-400/10"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      <span
                        className="grid h-5 w-5 shrink-0 place-items-center border font-mono text-[0.55rem]"
                        style={{
                          borderColor: `${section.accent}66`,
                          color: section.accent,
                          background: isDone ? `${section.accent}22` : "transparent",
                        }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[0.66rem] uppercase tracking-wider text-slate-200">
                          {section.title}
                        </span>
                        <span className="block truncate text-[0.6rem] text-slate-500">
                          {section.steps.length} step{section.steps.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      {isDone ? <Icon name="Check" className="h-3.5 w-3.5 text-cyan-300" /> : null}
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setPage(steps.length);
                  }}
                  className={`flex w-full items-center gap-2 border px-2 py-1.5 text-left transition ${
                    finished ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center border border-white/20 font-mono text-[0.55rem] text-slate-300">
                    <Icon name="Check" className="h-3 w-3" />
                  </span>
                  <span className="font-mono text-[0.66rem] uppercase tracking-wider text-slate-200">
                    Finished ship
                  </span>
                </button>
              </li>
            </ol>
          </Panel>

          <Panel accent="#a855f7">
            <HudLabel>This section</HudLabel>
            <p className="mt-1 text-[0.7rem] leading-relaxed text-slate-400">
              {activeSection?.subtitle}
            </p>
            <ol className="mt-2 space-y-0.5">
              {(activeSection?.steps ?? []).map((sectionStep) => (
                <li key={sectionStep.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setPage(steps.findIndex((s) => s.id === sectionStep.id));
                    }}
                    className={`w-full text-left font-mono text-[0.62rem] leading-relaxed transition ${
                      sectionStep.id === step.id && !finished
                        ? "text-cyan-200"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {sectionStep.id === step.id && !finished ? ">" : " "} {sectionStep.index}.{" "}
                    {sectionStep.placements.map((p) => p.partName).join(" + ")}
                  </button>
                </li>
              ))}
            </ol>
          </Panel>

          {!finished ? (
            <Panel accent="#f59e0b">
              <HudLabel>Pick from the crate</HudLabel>
              <ul className="mt-2 space-y-1.5">
                {step.placements.map((placement) => (
                  <li key={placement.key} className="panel-flat px-2 py-1.5">
                    <div className="font-mono text-[0.68rem] text-slate-100">{placement.partName}</div>
                    <div className="text-[0.6rem] text-slate-500">
                      {placement.position}
                      {placement.buyable ? " · vendor" : " · salvage only"}
                    </div>
                    {placement.mirrored ? (
                      <div className="mt-0.5 font-mono text-[0.58rem] uppercase tracking-wider text-plasma-300">
                        mirrored pair
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
                <HudLabel>Step cost</HudLabel>
                <span className="hud-mono text-xs text-plasma-300">
                  {formatUnits(step.stepCost)} U
                </span>
              </div>
            </Panel>
          ) : (
            <Panel accent="#22d3ee">
              <HudLabel>Launch configuration</HudLabel>
              <p className="mt-1 text-[0.7rem] leading-relaxed text-slate-400">
                {manual.moduleCount} modules across {manual.sections.length} sections,{" "}
                {formatUnits(manual.totalCost)} Units of hardware. Fly it to the Workshop and the
                validation station will pass it - every module sits on a real socket.
              </p>
            </Panel>
          )}
        </aside>
      </div>

      {/* ---------- print sheet (only mounted while printing) ---------- */}
      {printPages.length > 0 ? (
        <div className={`assembly-print ${printReady ? "is-ready" : ""}`}>
          {printPages.map((section, index) => (
            <PrintPage
              key={section.id}
              manual={manual}
              sectionIndex={index}
              sectionFilter={printMode === "current" ? section.id : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function currentSection(manual: ReturnType<typeof compileManual>, step: { sectionId: string }) {
  return manual.sections.find((section) => section.id === step.sectionId) ?? manual.sections[0];
}

function sectionAccent(manual: ReturnType<typeof compileManual>, id: string): string {
  return manual.sections.find((section) => section.id === id)?.accent ?? "#7c5cff";
}

/** One printed page: the section's finished state plus its numbered steps. */
function PrintPage({
  manual,
  sectionIndex,
  sectionFilter,
}: {
  manual: ReturnType<typeof compileManual>;
  sectionIndex: number;
  sectionFilter?: string;
}) {
  const section = sectionFilter
    ? manual.sections.find((s) => s.id === sectionFilter) ?? manual.sections[sectionIndex]
    : manual.sections[sectionIndex];
  const scene = projectScene(manual.mesh, PRINT_VIEW, 460, 320, {
    padding: 1.4,
    material: "manual",
    placedKeys: section.completed,
    activeKeys: section.steps.at(-1)?.placements.map((p) => p.key) ?? [],
    accent: section.accent,
    showDecor: false,
  });
  return (
    <section className="assembly-print-page">
      <header>
        <span className="kicker">
          SECTION {String(sectionIndex + 1).padStart(2, "0")}/{String(manual.sections.length).padStart(2, "0")}
        </span>
        <h2>{section.title}</h2>
        <p>{section.subtitle}</p>
      </header>
      <svg width={460} height={320} viewBox="0 0 460 320">
        <rect width={460} height={320} fill="#fbfbfd" />
        {scene.faces
          .filter((face) => face.state === "ghost")
          .map((face, index) => (
            <polygon key={`pg-${index}`} points={face.points} fill="#fff" stroke="rgba(30,41,59,0.18)" strokeWidth={0.5} strokeDasharray="2 2" />
          ))}
        {scene.faces
          .filter((face) => face.state === "placed" || face.state === "decor")
          .map((face, index) => (
            <polygon key={`pp-${index}`} points={face.points} fill={face.fill} stroke="rgba(15,23,42,0.5)" strokeWidth={0.5} />
          ))}
        {scene.faces
          .filter((face) => face.state === "active")
          .map((face, index) => (
            <polygon key={`pa-${index}`} points={face.points} fill={face.fill} stroke={section.accent} strokeWidth={1} />
          ))}
      </svg>
      <ol>
        {section.steps.map((step) => (
          <li key={step.id}>
            <strong>
              {step.index}. {step.title}
            </strong>
            <span>
              {step.body.join(" ")} ({step.placements.length} x {step.placements[0]?.partName})
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
