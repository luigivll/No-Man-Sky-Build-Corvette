/**
 * The last step of a hand-drawn ship: turn a lay-out into a renderable recipe.
 *
 * Hand-drawn ships are painted from their own reference art rather than from the
 * catalogue's hull families — a TIE is gunmetal, an N-1 is chromed yellow — so the
 * paint is passed in explicitly instead of being derived from the style family.
 */

import type { LatticePlacement } from "../lattice";
import type { NamedRecipe } from "../fleet";
import { styleById } from "../shipStyles";
import type { Blueprint } from "../types";
import type { ViewState } from "../render3d";

export interface Paint {
  hull: string;
  hullDark: string;
  emissive: string;
  glow?: number;
}

export function recipeFor(
  bp: Blueprint,
  opts: {
    parts: LatticePlacement[];
    paint: Paint;
    blurb: string;
    /** where the camera should open on this ship */
    view?: ViewState;
    role?: string;
  },
): NamedRecipe {
  const style = styleById(bp.style ?? "corvette", 7);
  return {
    id: bp.slug,
    name: bp.name,
    role: opts.role ?? `${bp.role} · hand-laid`,
    blurb: opts.blurb,
    hull: opts.paint.hull,
    hullDark: opts.paint.hullDark,
    emissive: opts.paint.emissive,
    glow: opts.paint.glow ?? 0.55,
    environment: style.environment,
    // a placement that could not find a surface to sit on is dropped rather than
    // crashing the ship: better a missing turret than a broken build
    parts: opts.parts.filter((q): q is LatticePlacement => Boolean(q)),
    view: opts.view,
  };
}

/** drops nulls so optional placements can be spread straight into a build */
export function compact(list: (LatticePlacement | null)[]): LatticePlacement[] {
  return list.filter((p): p is LatticePlacement => Boolean(p));
}
