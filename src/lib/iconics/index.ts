/**
 * Hand-drawn iconic ships.
 *
 * The generic compiler in `blueprintLattice.ts` lays a blueprint's parts list out
 * on the grid.  That is the right answer for a Star Destroyer — it IS a spine with
 * things bolted to it — and the wrong answer for a starfighter, where the shape
 * is the ship: an X-Wing is four foils canted into a cross, a Razor Crest is
 * wider than it is long, a TIE is a pod between four thrown blades.
 *
 * So everything with a reference drawing is laid out by hand in these modules and
 * the compiler becomes the fallback.  Both end up as ordinary lattice recipes, so
 * they render, audit and step through the assembly manual the same way.
 */

import type { Blueprint } from "../types";
import type { NamedRecipe } from "../fleet";
import * as fighters from "./ships-fighters";
import * as capital from "./ships-capital";

const BUILDERS: Record<string, (bp: Blueprint) => NamedRecipe> = {
  // starfighters and gunships
  "x-wing-t65": fighters.xWing,
  "tie-interceptor": fighters.tieInterceptor,
  "delta-7-jedi": fighters.delta7,
  "eta-2-jedi": fighters.eta2,
  "n1-starfighter": fighters.n1Starfighter,
  "viper-mk2": fighters.viperMk2,
  batwing: fighters.batwing,
  "sentinel-interceptor": fighters.sentinelInterceptor,
  "unsc-pelican": fighters.pelican,
  "xmen-blackbird": fighters.blackbird,
  "razor-crest": fighters.razorCrest,

  // capital ships and transports
  "millennium-falcon": capital.millenniumFalcon,
  "imperial-star-destroyer": capital.starDestroyer,
  "uss-enterprise": capital.enterprise,
  serenity: capital.serenity,
  rocinante: capital.rocinante,
  nostromo: capital.nostromo,
  "thunderbird-2": capital.thunderbird2,
  "firespray-slave-one": capital.firespray,
  "normandy-sr2": capital.normandy,
  "corrupted-dreadnought": capital.corruptedDreadnought,
};

/** slugs with a hand-drawn layout */
export const HAND_DRAWN = Object.keys(BUILDERS);

export function iconicRecipe(bp: Blueprint): NamedRecipe | null {
  const build = BUILDERS[bp.slug];
  return build ? build(bp) : null;
}
