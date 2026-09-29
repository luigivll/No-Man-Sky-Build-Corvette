"use client";

import { useEffect, useMemo, useState } from "react";
import ShipPreview3D from "@/components/ShipPreview3D";
import { Icon } from "@/components/Icon";
import { assembleCorvette, heroBudget } from "@/lib/lattice";
import { buildToRecipe } from "@/lib/buildLattice";
import { latticeBuild } from "@/lib/fleet";
import { ensurePack } from "@/lib/realMeshes";
import type { ShipMesh, ViewState } from "@/lib/render3d";
import type { Build } from "@/lib/types";

/**
 * Any build, rendered from the real game meshes.
 *
 * `ShipPreview3D` falls back to the polygon stand-ins when nobody hands it a
 * mesh, which is fine as a placeholder and useless as a preview of what you are
 * about to build in game. This wrapper compiles the build to a lattice recipe,
 * assembles it from the same 589-asset pack the iconic ships use, and passes the
 * result straight in — so the manual builder, the randomizer and the hangar all
 * show real geometry.
 */
export default function RealMeshView({
  build,
  height = 420,
  compact = false,
  showControls = true,
  initialView,
  className,
}: {
  build: Build;
  height?: number;
  compact?: boolean;
  showControls?: boolean;
  initialView?: string;
  className?: string;
}) {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    ensurePack().then((p) => alive && setReady(Boolean(p)));
    return () => {
      alive = false;
    };
  }, []);

  // Same rule as LatticeView: nothing is compiled until the meshes are here,
  // because a recipe compiled without the pack has no modules in it at all.
  const recipe = useMemo(() => (ready ? buildToRecipe(build) : null), [build, ready]);

  const mesh: ShipMesh | null = useMemo(() => {
    if (!recipe) return null;
    return assembleCorvette(recipe, {
      maxTrisPerPart: heroBudget(recipe.parts.length, compact ? 14000 : 26000),
    });
  }, [recipe, compact]);

  if (ready === null) {
    return (
      <div className={className} style={{ minHeight: height }}>
        <div className="grid h-full place-items-center">
          <div className="text-center">
            <Icon name="ScanLine" className="mx-auto h-7 w-7 animate-pulse text-cyan-400/60" />
            <p className="mt-2 font-display text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Loading real meshes
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!recipe) {
    // the pack never arrived: show the polygon stand-ins built from the Build
    // itself, which need no meshes, instead of a lattice recipe with no parts
    return (
      <ShipPreview3D
        build={build}
        height={height}
        compact={compact}
        showControls={showControls}
        initialView={initialView}
        showStylePicker={false}
      />
    );
  }

  if (!mesh) {
    // the pack is here but this recipe did not assemble — fall back to the
    // polygon view of the compiled lattice rather than showing nothing
    return (
      <ShipPreview3D
        build={latticeBuild(recipe)}
        height={height}
        compact={compact}
        showControls={showControls}
        initialView={initialView}
        showStylePicker={false}
      />
    );
  }

  return (
    <ShipPreview3D
      build={latticeBuild(recipe)}
      mesh={mesh}
      height={height}
      compact={compact}
      showControls={showControls}
      initialView={initialView}
      initialViewState={recipe.view as ViewState | undefined}
      showStylePicker={false}
    />
  );
}
