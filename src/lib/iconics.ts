/**
 * Hand-authored iconic builds.
 *
 * The generic compiler in `blueprintLattice.ts` lays a blueprint's parts list out
 * on the grid, and for a Star Destroyer that is the right answer: it is a long
 * spine with things bolted to it.  It is the WRONG answer for a starfighter,
 * because the shape IS the ship — an X-Wing is four foils canted into a cross,
 * and no amount of tweaking a generic router gives you that.
 *
 * So the ships whose silhouette matters get drawn here by hand, part by part,
 * and the blueprint's own build notes are treated as the spec they always were:
 * "two upper, two lower, splayed at 30 degrees" is a layout instruction.
 *
 * Everything still snaps to the same 1.0 x 0.5 x 1.0 game grid with the same
 * engine — these are recipes, not special cases in the renderer.
 */

import { chainZ, placedBox, rollXY, stack, type LatticePlacement } from "./lattice";
import type { V3 } from "./render3d";
import type { NamedRecipe } from "./fleet";
import { styleById } from "./shipStyles";
import type { Blueprint } from "./types";

const deg = (d: number) => (d * Math.PI) / 180;
const rad = deg;

interface Foil {
  /** which side of the hull the foil hinges on */
  side: 1 | -1;
  /** cant angle; positive lifts the outboard end */
  roll: number;
  /** z of the hinge, hull space */
  z: number;
}

/**
 * T-65 X-Wing.
 *
 * The fuselage is deliberately thin: a one-cell spine (cockpit, reactor, two
 * connectors, hab, cap, booster) six cells long, because every fat module you
 * add here eats the cross.  The four S-foils hinge from a single station on the
 * aft hull, two canted +31 degrees and two -31, which is what reads as an X from
 * the bow.  Each foil carries a sublight thruster at its root and a photon
 * cannon at its tip — the blueprint asks for exactly four of each and says where
 * they go.
 */
export function xWingRecipe(bp: Blueprint): NamedRecipe {
  const style = styleById(bp.style ?? "corvette", 11);
  const parts: LatticePlacement[] = [];

  // ---- 1. spine: nose, reactor, slim waist, hab, cap, tail booster -------- //
  const spine = chainZ([
    "B_COK_A", // Titan cockpit, pointed nose
    "B_GEN_2", // Azimuth reactor, flush with the hull line
    "B_CON_5",
    "B_HAB_B", // Ambassador hab - inventory + astromech
    "B_CON_3",
    "B_STR_A_N", // armoured cap
    "B_TRU_G", // Arcadia heavy booster, central powerplant
  ]);
  parts.push(...spine.map((p) => ({ ...p, role: p.role === "first" ? "nose" : p.role })));

  const hosts = spine.map((p) => ({ place: p, box: placedBox(p.assetId, p.pos, p.yaw, p.mirror, p.scale ?? 1)! }));
  const at = (t: number) => hosts[Math.max(0, Math.min(hosts.length - 1, Math.round(t * (hosts.length - 1))))];

  // hull half-width where the foils hinge, and mid-height so the roll is symmetric
  const HINGE: Foil[] = [
    { side: 1, roll: rad(33), z: -3.2 },
    { side: 1, roll: rad(-33), z: -3.2 },
    { side: -1, roll: rad(33), z: -3.2 },
    { side: -1, roll: rad(-33), z: -3.2 },
  ];
  const EDGE = 0.47;
  const Y0 = 0.26;
  // B_WNG_R is the one true foil in the pack: 0.35 thick and 4.53 long against a
  // 1.30 span. A starfighter needs the opposite ratio - more span than chord -
  // and the pack has no such wing, so the span is stretched. At 0.80 scale the
  // foil comes out 3.6 of chord by 3.1 of span, which is the X-Wing's own
  // proportion, and the splay then reads as a cross from every angle.
  const FOIL_SCALE = 0.80;
  const FOIL_STRETCH = 3.0;

  /**
   * A point given in the foil's own coordinates -> ship space.
   *
   * The foil hinges at (EDGE, Y0, z), so a wing-local offset is scaled, rolled
   * about that hinge and only then mirrored, which is what makes one roll value
   * lift both halves of a pair.
   */
  const onFoil = (f: Foil, lx: number, ly: number, lz: number): V3 => {
    const [rx, ry] = rollXY(lx * FOIL_SCALE * FOIL_STRETCH, ly * FOIL_SCALE, f.roll);
    return [f.side * (EDGE + rx), Y0 + ry, f.z + lz * FOIL_SCALE];
  };

  const foilPlace = (f: Foil): LatticePlacement => ({
    assetId: "B_WNG_R",
    pos: [f.side * EDGE, Y0, f.z],
    mirror: f.side < 0,
    roll: f.roll,
    scale: FOIL_SCALE,
    stretchX: FOIL_STRETCH,
    role: f.roll > 0 ? "upper S-foil" : "lower S-foil",
  });

  const foils = HINGE.map(foilPlace);
  parts.push(...foils);

  // ---- 2. one thruster per foil root, one cannon per foil tip ------------- //
  // Measured off the real mesh rather than guessed: B_WNG_R's own tip vertex sits
  // at wing-local (1.30, -0.03, -0.69) and its belly at y -0.18, so cannon, pod
  // and skid are all anchored to those numbers. Guessing them is how you end up
  // with a cannon hanging in space next to the wing.
  foils.forEach((foil, i) => {
    const f = HINGE[i];
    parts.push({
      assetId: "B_TRU_A", // Arcadia Sublight Thruster
      pos: onFoil(f, 0.55, 0.00, -0.75),
      mirror: f.side < 0,
      roll: f.roll,
      role: "thruster pod",
    });

    parts.push({
      assetId: "B_TUR_A", // Photon Cannon Array
      pos: onFoil(f, 1.22, -0.03, -0.60),
      mirror: f.side < 0,
      roll: f.roll,
      role: "wingtip cannon",
    });
  });

  // ---- 3. skids under the two lower foils --------------------------------- //
  // B_LND_B reaches UP from its own origin (y +0.14 .. +0.52), so the origin is
  // set one strut-length under the foil's belly at y -0.18 for it to hang.
  parts.push(
    {
      assetId: "B_LND_B",
      pos: onFoil(HINGE[1], 0.45, -0.70, -0.35),
      mirror: HINGE[1].side < 0,
      roll: HINGE[1].roll,
      role: "landing skid",
    },
    {
      assetId: "B_LND_B",
      pos: onFoil(HINGE[3], 0.45, -0.70, -0.35),
      mirror: HINGE[3].side < 0,
      roll: HINGE[3].roll,
      role: "landing skid",
    },
    // flush side fairings: the two winglets have nowhere else to live without
    // breaking the cross, so they hug the aft hull
    { assetId: "B_WNG_K", pos: [0.44, 0.12, -4.35], scale: 0.5, role: "hull fairing" },
    { assetId: "B_WNG_K", pos: [-0.44, 0.12, -4.35], mirror: true, scale: 0.5, role: "hull fairing" },
  );

  // ---- 4. deck kit -------------------------------------------------------- //
  parts.push(
    stack("B_SHL_A", at(0.62).place, { below: false }), // Aeron powershield on the hab deck
    stack("B_ALK_B", at(0.34).place, { below: false }), // walkway collar, breaks the spine
  );

  const boxes = parts.map((p) => placedBox(p.assetId, p.pos, p.yaw ?? 0, p.mirror, p.scale ?? 1, p.roll ?? 0));
  void boxes;

  return {
    id: bp.slug,
    name: bp.name,
    role: `${bp.role} · hand-laid`,
    blurb:
      "Six-cell spine, four S-foils hinged from one station and canted 31 degrees, a sublight pod at every root and a cannon at every tip. The blueprint's own notes, followed literally.",
    hull: style.hullBase,
    hullDark: style.hullDark,
    emissive: style.emissive,
    glow: 0.6,
    environment: style.environment,
    parts,
  };
}

/** slugs that have a hand-drawn layout; everything else uses the compiler */
export const ICONIC_BUILDERS: Record<string, (bp: Blueprint) => NamedRecipe> = {
  "x-wing-t65": xWingRecipe,
};

export function iconicRecipe(bp: Blueprint): NamedRecipe | null {
  const build = ICONIC_BUILDERS[bp.slug];
  return build ? build(bp) : null;
}
