/**
 * Corvette recipes on the real game lattice.
 *
 * Each entry is assembled purely from snap points — no fitted boxes, no eyeballed
 * offsets. `chainZ` runs modules nose-to-tail so their faces touch, `flank` hangs
 * parts off the flanks using the asset's own inboard face, and `stack` bolts
 * things under or over a host. Everything is at true game scale.
 *
 * Asset key (measured from the FBX sources, see scripts/unreal/fbx.py):
 *   B_COK_*  cockpit        B_HAB_*   habitation (2 cells)   B_HAB1_*  1-cell pod
 *   B_ALK_*  access way     B_CON*_*  connectors             B_STR_*_N  hull block
 *   B_WNG_*  wings          B_TRU_*   boosters               B_TUR_*    turrets
 *   B_SHL_*  shields        B_GEN_*   reactors                B_LND_*    landing gear
 */

import { chainZ, flank, stack, type LatticePlacement, type LatticeRecipe } from "./lattice";
import type { Build } from "./types";

export interface NamedRecipe extends LatticeRecipe {
  blurb: string;
}

function firstNavyProbe(): NamedRecipe {
  // Spine: flight deck, two habitation modules, a twin-cell connector and an
  // armoured tail cap. Everything behind the cockpit butts onto the part in
  // front of it, so the hull is watertight before anything is bolted on.
  const spine = chainZ(["B_COK_A", "B_HAB_A", "B_HAB_A", "B_CON2_0", "B_STR_A_N"]);
  const [, hab1, hab2, conn, tail] = spine;

  const parts: LatticePlacement[] = [
    ...spine,

    // --- wings: a canard pair up front, the main span amidships ------------
    flank("B_WNG_E", hab1, { side: 1, zOffset: 0.85 }),
    flank("B_WNG_E", hab1, { side: -1, zOffset: 0.85 }),
    flank("B_WNG_A", hab2, { side: 1, zOffset: 0.75 }),
    flank("B_WNG_A", hab2, { side: -1, zOffset: 0.75 }),
    flank("B_WNG_I", hab2, { side: 1, zOffset: -0.85 }),
    flank("B_WNG_I", hab2, { side: -1, zOffset: -0.85 }),

    // --- propulsion: flank boosters plus a pair on the tail cap ------------
    flank("B_TRU_C", conn, { side: 1, yOffset: -0.02 }),
    flank("B_TRU_C", conn, { side: -1, yOffset: -0.02 }),
    flank("B_TRU_G", tail, { side: 1, yOffset: -0.04 }),
    flank("B_TRU_G", tail, { side: -1, yOffset: -0.04 }),

    // --- legs: two forward, two aft, all on the ventral face ---------------
    stack("B_LND_A", hab1, { zOffset: 0.72 }),
    stack("B_LND_A", hab1, { zOffset: -0.72 }),
    stack("B_LND_C", conn, { zOffset: 0.6 }),
    stack("B_LND_A", tail, {}),

    // --- dorsal kit: hardpoints are the module's own top face --------------
    stack("B_SHL_A", hab1, { below: false, zOffset: -0.5 }),
    stack("B_GEN_0", hab2, { below: false, zOffset: 0.55 }),
    stack("B_TUR_A", hab1, { below: false, zOffset: 0.5 }),
    stack("B_TUR_C", hab2, { below: false, zOffset: -0.55 }),
    stack("B_DECO_C", hab2, { below: false, zOffset: 0 }),

    // --- one ventral turret, so the belly is not bare ----------------------
    stack("B_TUR_E", hab2, { below: true, zOffset: 0.4 }),
  ];

  return {
    id: "lattice-probe",
    name: "Lattice Probe",
    role: "Corvette, standard spine",
    blurb:
      "A fully kitted workshop corvette: flight deck, twin habitation modules, " +
      "twin-cell connector and armoured tail, six wings, four boosters, four legs " +
      "and a dorsal battery of shield, reactor and turrets.",
    hull: "#9aa7bd",
    hullDark: "#12161f",
    emissive: "#ff8a30",
    glow: 0.62,
    environment: "space",
    parts,
  };
}

export const LATTICE_RECIPES: NamedRecipe[] = [firstNavyProbe()];

export function recipeById(id: string): NamedRecipe | undefined {
  return LATTICE_RECIPES.find((r) => r.id === id);
}

/**
 * `ShipPreview3D` wants a `Build` for its chrome (part counts, hover labels).
 * The lattice is not driven by the catalogue, so it gets an empty one and the
 * mesh is handed over directly.
 */
export function latticeBuild(recipe: NamedRecipe): Build {
  return {
    id: recipe.id,
    name: recipe.name,
    createdAt: 0,
    slots: {},
    roles: [],
    origin: "blueprint",
    designation: recipe.role,
  };
}
