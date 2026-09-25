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

export interface NamedRecipe extends LatticeRecipe {
  blurb: string;
}

function firstNavyProbe(): NamedRecipe {
  // Spine: cockpit up front, two full habitation modules, armoured tail cap.
  const spine = chainZ(["B_COK_A", "B_HAB_A", "B_HAB_A", "B_STR_A_N"]);
  const [, hab1, hab2] = spine;

  const parts: LatticePlacement[] = [
    ...spine,
    // Wings root on the leading habitation module and sweep aft.
    flank("B_WNG_A", hab1, { side: 1 }),
    flank("B_WNG_A", hab1, { side: -1 }),
    // Boosters clamp onto the flanks of the trailing hab, nozzle aft.
    flank("B_TRU_B", hab2, { side: 1 }),
    flank("B_TRU_B", hab2, { side: -1 }),
    // Gear hangs off the ventral face: two forward legs, one at the tail.
    stack("B_LND_A", hab1, { zOffset: 0.6 }),
    stack("B_LND_A", hab1, { zOffset: -0.6 }),
    stack("B_LND_A", hab2),
  ];

  return {
    id: "lattice-probe",
    name: "Lattice Probe",
    role: "Corvette, standard spine",
    blurb:
      "A plain workshop corvette: flight deck, two habitation modules, swept wings and a pair of flank boosters, standing on three legs.",
    hull: "#93a0b6",
    hullDark: "#141922",
    emissive: "#ff8a30",
    glow: 0.6,
    parts,
  };
}

export const LATTICE_RECIPES: NamedRecipe[] = [firstNavyProbe()];

export function recipeById(id: string): NamedRecipe | undefined {
  return LATTICE_RECIPES.find((r) => r.id === id);
}
