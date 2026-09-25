/**
 * Hand-drawn starfighters.
 *
 * Each of these follows a reference: the X-Wing's "two upper, two lower, splayed
 * at 30 degrees" build note, the Eta-2 sheet with its twin ion engines on the
 * wing roots, the Razor-Crest's measured 24.13 x 27.8 m box (wider than it is
 * long), the Batwing's folded bat plan with the turbines on the spine.
 *
 * The rule everywhere: a part is bolted to a measured point on another part, so
 * nothing floats, and the silhouette is the ship's own, not a box with wings.
 */

import { chainZ, type LatticePlacement } from "../lattice";
import { atTip, deg, fin, hanging, pod, put, row, span, spanPair } from "./dsl";
import { compact, recipeFor } from "./recipe";
import type { Blueprint } from "../types";
import type { NamedRecipe } from "../fleet";
import type { V3 } from "../render3d";

/* ------------------------------------------------------------------ */
/* T-65 X-Wing                                                         */
/* ------------------------------------------------------------------ */

export function xWing(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  // six-cell spine: everything fat here eats the cross
  parts.push(
    ...chainZ(["B_COK_A", "B_GEN_2", "B_CON_5", "B_HAB_B", "B_CON_3", "B_STR_A_N", "B_TRU_G"]),
  );

  // four foils hinged from ONE station, canted 33 degrees, span stretched so the
  // 1.30-wide game foil reaches starfighter proportions
  const root: V3 = [0.47, 0.12, -3.2];
  const tipEnd: V3 = [0.47 + 3.1 * Math.cos(deg(33)), 0.12 + 3.1 * Math.sin(deg(33)), -3.2];
  const cants: [1 | -1, number][] = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  for (const [up, side] of cants) {
    const a: V3 = [root[0], up > 0 ? root[1] : -root[1], root[2]];
    const b: V3 = [tipEnd[0], up > 0 ? tipEnd[1] : -tipEnd[1], tipEnd[2]];
    // mirror goes INTO span: flipping the flag afterwards leaves the root on the
    // starboard side and drags the whole foil across the hull
    const foil = span("B_WNG_R", a, b, {
      scale: 0.8,
      mirror: side < 0,
      role: up > 0 ? "upper S-foil" : "lower S-foil",
    });
    parts.push(foil);

    // sublight pod at the root, cannon on the tip, both carried by the foil's
    // own axis so they move with the cant
    // Pod and cannon sit on the foil's own metal: the cannon on the measured tip
    // vertex, the pod a third of the way out along the same axis.
    const roll = foil.roll ?? 0;
    const dir: [number, number, number] = [side > 0 ? 1 : -1, up > 0 ? 1 : -1, 0];
    const tip = atTip(foil, dir, 0.35);
    if (tip) {
      parts.push({
        assetId: "B_TUR_A",
        pos: [tip[0], tip[1], tip[2] - 0.35],
        mirror: side < 0,
        roll,
        role: "wingtip cannon",
      });
    }
    const podAt = (d: number): V3 => [
      side * (a[0] + Math.cos(roll) * d),
      a[1] + Math.sin(roll) * d,
      a[2] - 0.5,
    ];
    parts.push({
      assetId: "B_TRU_A",
      pos: podAt(1.35),
      mirror: side < 0,
      roll,
      role: "thruster pod",
    });
  }

  // skids under the two lower foils
  parts.push(
    put("B_LND_B", [1.35, -1.62, -3.55], { role: "landing skid" }),
    put("B_LND_B", [-1.35, -1.62, -3.55], { mirror: true, role: "landing skid" }),
    put("B_WNG_K", [0.44, 0.12, -4.4], { scale: 0.5, role: "hull fairing" }),
    put("B_WNG_K", [-0.44, 0.12, -4.4], { mirror: true, scale: 0.5, role: "hull fairing" }),
    put("B_ALK_B", [0, 0.5, -1.6], { role: "walkway collar" }),
    put("B_SHL_A", [0, 0.5, -2.7], { role: "powershield" }),
  );

  return recipeFor(bp, {
    parts,
    view: { yaw: 0, pitch: -0.08, zoom: 1 },
    paint: { hull: "#c9d4e2", hullDark: "#4a5768", emissive: "#ff8a4c", glow: 0.6 },
    blurb:
      "Six-cell spine, four S-foils hinged from one station and canted 33 degrees, a sublight pod at every root and a cannon at every tip.",
  });
}

/* ------------------------------------------------------------------ */
/* TIE Interceptor                                                     */
/* ------------------------------------------------------------------ */

export function tieInterceptor(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(
    put("B_COK_B", [0, 0, 0], { role: "command pod" }),
    put("B_SHL_C", [0, 0.08, 0.5], { role: "viewport" }),
    put("B_SHL_E", [0, -0.3, 0], { role: "ventral hatch" }),
  );
  parts.push(...spanPair("B_STR_A_N", [0.45, 0, -0.1], [1.05, 0, -0.1], { scale: 0.5, role: "wing pylon" }));

  // the Interceptor's dagger blades: two per side, thrown out and up / out and
  // down, which is what makes the flattened X seen from the bow
  const CANT = deg(56);
  const REACH = 2.5;
  for (const up of [1, -1] as const) {
    const b: V3 = [1.05 + REACH * Math.cos(CANT), up * REACH * Math.sin(CANT), -0.1];
    const blades = spanPair("B_WNG_R", [1.05, 0, -0.1], b, {
      scale: 0.85,
      role: up > 0 ? "upper blade" : "lower blade",
    });
    parts.push(...blades);
    // Long laser cannons ON the blade tips. The tip comes from the blade's own
    // vertices, because a bbox tends to claim a corner the metal never reaches.
    blades.forEach((blade, i) => {
      const side = i === 0 ? 1 : -1;
      const dir: [number, number, number] = [side > 0 ? 1 : -1, up > 0 ? 1 : -1, 0];
      const tip = atTip(blade, dir, 0.28);
      if (tip) parts.push({ assetId: "B_TUR_D", pos: tip, mirror: side < 0, roll: blade.roll, role: "wingtip cannon" });
    });
  }
  parts.push(put("B_TUR_A", [0, 0.35, 0.6], { role: "chin cannon" }));

  return recipeFor(bp, {
    parts,
    view: { yaw: 0, pitch: -0.1, zoom: 1 },
    paint: { hull: "#7d8794", hullDark: "#2a3038", emissive: "#ff5a3c", glow: 0.55 },
    blurb:
      "A ball pod on two pylons, four dagger blades thrown out and up / out and down, and a cannon on every tip. The flattened X is the whole point of an Interceptor.",
  });
}

/* ------------------------------------------------------------------ */
/* Delta-7 Aethersprite                                                */
/* ------------------------------------------------------------------ */

export function delta7(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(...chainZ(["B_COK_B", "B_CON_5", "B_GEN_2", "B_HAB1_B", "B_STR_A_N", "B_TRU_G"]));
  // The Aethersprite is mostly needle: two slim blades, the upper one running
  // most of a ship-length ahead of the cockpit. At 0.2 scale it is a needle
  // rather than a plank.
  parts.push(
    span("B_WNG_R", [0, 0.14, 0.8], [0, 0.14, 3.4], { scale: 0.2, role: "needle nose" }),
    span("B_WNG_R", [0, -0.08, 0.8], [0, -0.08, 2.5], { scale: 0.16, role: "chin fairing" }),
  );

  // two short blades at the stern, barely canted, with the engines on the roots
  parts.push(
    ...spanPair("B_WNG_K", [0.5, 0.02, -2.5], [1.75, 0.35, -2.5], { scale: 0.75, role: "wing blade" }),
  );
  parts.push(
    put("B_TRU_A", [0.72, 0.05, -2.9], { role: "sublight thruster" }),
    put("B_TRU_A", [-0.72, 0.05, -2.9], { mirror: true, role: "sublight thruster" }),
    put("B_TUR_A", [0.3, -0.2, 0.9], { role: "nose cannon" }),
    put("B_TUR_A", [-0.3, -0.2, 0.9], { mirror: true, role: "nose cannon" }),
    // a small astromech dome, not a beach ball: the ion barrier is a wide flat
    // shield and reads as a bubble on a hull this slim
    put("B_SHL_C", [0, 0.4, -0.2], { role: "astromech socket" }),
    put("B_SHL_A", [0, 0.28, -1.5], { scale: 0.7, role: "ion barrier" }),
  );

  return recipeFor(bp, {
    parts,
    view: { yaw: 0.5, pitch: -0.24, zoom: 1 },
    paint: { hull: "#d8dee6", hullDark: "#5d6674", emissive: "#f97316", glow: 0.55 },
    blurb:
      "A needle nose, a slim four-cell body and two low blade wings, with the sublight thrusters tucked against the wing roots.",
  });
}

/* ------------------------------------------------------------------ */
/* Eta-2 Actis (Mace Windu)                                            */
/* ------------------------------------------------------------------ */

export function eta2(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(...chainZ(["B_COK_B", "B_CON_5", "B_HAB1_A", "B_STR_A_N"]));
  // the Actis is mostly nose: a long blade with the canopy amidships
  parts.push(
    span("B_WNG_R", [0, 0.06, 0.8], [0, 0.06, 3.9], { scale: 0.2, role: "forward blade" }),
    span("B_WNG_R", [0, -0.18, 0.8], [0, -0.18, 2.6], { scale: 0.16, role: "ventral blade" }),
    put("B_SHL_C", [0, 0.44, -0.15], { role: "astromech socket" }),
  );

  // twin ion engines: a nacelle per side on a wing stub, sitting high and wide
  const podIds = ["B_TRU_C", "B_TRU_D"];
  parts.push(
    ...pod(podIds, 1.45, 0.32, -1.25, { role: "ion engine" }),
    ...pod(podIds, -1.45, 0.32, -1.25, { role: "ion engine" }).map((p) => ({ ...p, mirror: true })),
  );
  parts.push(
    ...spanPair("B_WNG_K", [0.5, 0.14, -1.3], [1.45, 0.32, -1.3], { scale: 0.62, role: "wing stub" }),
  );
  parts.push(
    put("B_TUR_A", [0.28, -0.3, 1.6], { role: "quad laser cannon" }),
    put("B_TUR_A", [-0.28, -0.3, 1.6], { mirror: true, role: "quad laser cannon" }),
  );

  return recipeFor(bp, {
    parts,
    view: { yaw: 0.2, pitch: -0.16, zoom: 1 },
    paint: { hull: "#e4dff0", hullDark: "#4b3f66", emissive: "#f2c14e", glow: 0.6 },
    blurb:
      "Twin ion engines on short wing roots, a long blade nose with the canopy amidships, and an astromech socket on the spine.",
  });
}

/* ------------------------------------------------------------------ */
/* N-1 Starfighter                                                     */
/* ------------------------------------------------------------------ */

export function n1Starfighter(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(
    ...chainZ(["B_COK_A", "B_CON_5", "B_GEN_2", "B_HAB1_B", "B_STR_A_N", "B_TRU_G"]),
    put("B_SHL_C", [0, 0.52, -0.6], { role: "astromech socket" }),
  );

  // the N-1 carries its engines at the wingtips, ahead of the trailing edge
  parts.push(
    ...spanPair("B_WNG_A", [0.5, 0.02, -1.5], [1.85, 0.02, -1.5], { scale: 0.85, role: "wing" }),
  );
  for (const side of [1, -1] as const) {
    const nacelle = chainZ(["B_TRU_D", "B_TRU_B"]).map((p) => ({
      ...p,
      pos: [side * 1.85, 0.02, p.pos[2] - 1.05] as V3,
      mirror: side < 0,
      role: "wingtip engine",
    }));
    parts.push(...nacelle);
  }
  parts.push(
    put("B_TUR_A", [0.55, -0.06, 0.7], { role: "nose cannon" }),
    put("B_TUR_A", [-0.55, -0.06, 0.7], { mirror: true, role: "nose cannon" }),
  );

  return recipeFor(bp, {
    parts,
    view: { yaw: 0.1, pitch: -0.2, zoom: 1 },
    paint: { hull: "#e8c94a", hullDark: "#6b5a1c", emissive: "#8fd6ff", glow: 0.6 },
    blurb:
      "Chromed arrowhead hull, astromech socket amidships and the engines slung at the wingtips, exactly as the Naboo ship carries them.",
  });
}

/* ------------------------------------------------------------------ */
/* Viper Mk II                                                         */
/* ------------------------------------------------------------------ */

export function viperMk2(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  // the Viper is a tube with an intake on the nose and three nozzles at the tail
  parts.push(
    put("B_TRU_C", [0, 0, 1.45], { plume: false, role: "intake" }),
    ...chainZ(["B_COK_B", "B_CON_5", "B_GEN_2", "B_HAB1_A", "B_STR_A_N"]).map((p, i) => ({
      ...p,
      pos: [0, 0, p.pos[2] + (i === 0 ? 0.05 : 0)] as V3,
      role: i === 0 ? "cockpit" : "hull",
    })),
  );

  parts.push(
    ...spanPair("B_WNG_J", [0.45, 0, -2.4], [1.85, 0, -2.9], { scale: 0.8, role: "wing" }),
  );
  // three nozzles across the tail: two outboard on the wing roots, one centre
  parts.push(
    ...row("B_TRU_A", [-0.62, 0, 0.62], 0, -3.95, { role: "main thruster" }),
    put("B_TUR_C", [0, -0.32, 0.5], { role: "chin cannon" }),
  );

  return recipeFor(bp, {
    parts,
    view: { yaw: 0.6, pitch: -0.3, zoom: 1 },
    paint: { hull: "#a8b0ba", hullDark: "#3d434c", emissive: "#ff9b3d", glow: 0.6 },
    blurb:
      "Nose intake, a five-cell tube, two low swept wings and three nozzles across the tail — the Colonial workhorse, not a brick.",
  });
}

/* ------------------------------------------------------------------ */
/* Batwing (BWS-1)                                                     */
/* ------------------------------------------------------------------ */

export function batwing(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(
    ...chainZ(["B_COK_B", "B_CON_3", "B_STR_A_N"]),
    put("B_SHL_A", [0, 0.36, -0.5], { role: "sensor pod" }),
    put("B_TUR_A", [0, -0.3, 1.1], { role: "chin cannon" }),
    put("B_TUR_A", [0, -0.3, 0.1], { role: "chin cannon" }),
  );

  // dual-stage jet turbines on the spine, per the drawing
  parts.push(
    put("B_TRU_C", [0.55, 0.4, -1.5], { role: "jet turbine stbd" }),
    put("B_TRU_C", [-0.55, 0.4, -1.5], { mirror: true, role: "jet turbine port" }),
  );

  // the bat: one huge swept wing pair whose tips fold up
  parts.push(
    ...spanPair("B_WNG_Q", [0.35, 0.05, -0.7], [3.5, 1.35, -1.3], { scale: 0.85, role: "bat wing" }),
  );
  // tail stabiliser standing on the spine
  parts.push(
    ...compact([fin("B_WNG_K", parts, 0, -2.4, { scale: 0.55, role: "tail stabiliser" })]),
    ...compact([
      hanging("B_LND_B", parts, 0.9, -0.6, { drop: 0.05 }),
      hanging("B_LND_B", parts, -0.9, -0.6, { drop: 0.05 }),
    ]),
  );

  return recipeFor(bp, {
    parts,
    view: { yaw: 0.35, pitch: -0.42, zoom: 1 },
    paint: { hull: "#3a4048", hullDark: "#14181d", emissive: "#6fd3ff", glow: 0.7 },
    blurb:
      "A bat plan: one pair of huge swept wings whose tips fold up, turbines on the spine and the missile bay tucked under the nose.",
  });
}

/* ------------------------------------------------------------------ */
/* Sentinel Interceptor                                                */
/* ------------------------------------------------------------------ */

export function sentinelInterceptor(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(
    ...chainZ(["B_COK_B", "B_CON_5", "B_HAB1_A", "B_STR_A_N", "B_TRU_G"]),
    // the sentinel beak: a slim blade run out ahead of the cockpit
    span("B_WNG_R", [0, -0.12, 0.85], [0, -0.12, 2.9], { scale: 0.16, role: "beak" }),
    put("B_SHL_C", [0, 0.42, 0.4], { role: "eye" }),
  );

  // Two slim outriggers, not boxes: one connector cell each, braced to the hull,
  // carrying a long scythe blade that curves forward and up past the nose.
  for (const side of [1, -1] as const) {
    const px = side * 1.55;
    parts.push(
      put("B_CON_5", [px, 0.05, -1.0], { mirror: side < 0, role: "outrigger" }),
      put("B_STR_A_N", [px, 0.05, -2.0], { mirror: side < 0, role: "outrigger cap" }),
      put("B_TRU_A", [px, 0.05, -2.5], { mirror: side < 0, role: "outrigger thruster" }),
      ...spanPair("B_STR_A_N", [0.45, 0.05, -0.55], [1.55, 0.05, -0.55], {
        scale: 0.4,
        role: "outrigger brace",
      }),
      ...spanPair("B_STR_A_N", [0.45, 0.05, -1.55], [1.55, 0.05, -1.55], {
        scale: 0.4,
        role: "outrigger brace",
      }),
    );
    const scythe = span("B_WNG_R", [px, 0.2, -1.2], [px + side * 1.1, 1.5, 2.2], {
      scale: 0.42,
      mirror: side < 0,
      role: "scythe blade",
    });
    parts.push(scythe);
    const tip = atTip(scythe, [side > 0 ? 1 : -1, 1, 1], 0.35);
    if (tip) {
      parts.push(
        put("B_TUR_A", [tip[0], tip[1], tip[2] + 0.3], { mirror: side < 0, role: "blade cannon" }),
      );
    }
  }

  // crest blade standing on the spine, behind the cockpit
  parts.push(...compact([fin("B_WNG_K", parts, 0, -1.3, { scale: 0.45, role: "crest" })]));

  return recipeFor(bp, {
    parts: compact(parts),
    view: { yaw: 0.5, pitch: -0.22, zoom: 1 },
    paint: { hull: "#4c5560", hullDark: "#181f26", emissive: "#5ef2b0", glow: 0.85 },
    blurb:
      "An in-game Sentinel scaled up: a slim beak, a crest blade, two braced outriggers and the long forward-curving scythes it hunts with.",
  });
}

/* ------------------------------------------------------------------ */
/* UNSC Pelican                                                        */
/* ------------------------------------------------------------------ */

export function pelican(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  // A six-cell hull with the flight deck right up front and the tail boom off the
  // back; the boom carries the fin, which is what makes the D77 recognisable from
  // the side.
  parts.push(
    ...chainZ(["B_COK_D", "B_CON_5", "B_HAB_C", "B_HAB_C", "B_CON2_0", "B_STR_A_N"]),
    put("B_SHL_C", [0, 0.44, -0.4], { scale: 0.7, role: "avionics" }),
    put("B_SHL_C", [0, 0.44, -1.6], { scale: 0.7, role: "avionics" }),
    put("B_CON_5", [0, 0.2, -6.9], { scale: 0.8, role: "tail boom" }),
    put("B_STR_A_N", [0, 0.2, -7.7], { scale: 0.7, role: "tail boom" }),
    put("B_TUR_C", [0, 0.35, -4.5], { scale: 0.6, role: "chin gun" }),
  );

  // Wings out of the hull's upper sides, drooping to engine pods slung UNDER the
  // tips — and the skids go under the hull, not under the wing, which is what
  // stops them reading as debris when the wing gets wide.
  const rootA: V3 = [0.5, 0.12, -2.2];
  const tipB: V3 = [1.95, -0.55, -2.2];
  parts.push(...spanPair("B_WNG_D", rootA, tipB, { scale: 0.55, role: "droop wing" }));
  for (const side of [1, -1] as const) {
    parts.push({
      assetId: "B_TRU_C",
      pos: [side * 1.9, -0.6, -2.7],
      mirror: side < 0,
      roll: deg(-16),
      scale: 0.62,
      role: "tip engine",
    });
  }
  parts.push(
    ...compact([fin("B_WNG_K", parts, 0, -7.0, { scale: 0.5, role: "tail fin" })]),
    ...compact([
      hanging("B_LND_B", parts, 0.5, 0.2, { drop: 0.02 }),
      hanging("B_LND_B", parts, -0.5, 0.2, { drop: 0.02 }),
      hanging("B_LND_B", parts, 0.5, -3.6, { drop: 0.02 }),
      hanging("B_LND_B", parts, -0.5, -3.6, { drop: 0.02 }),
    ]),
  );

  return recipeFor(bp, {
    parts: compact(parts),
    view: { yaw: 0.85, pitch: -0.42, zoom: 1 },
    paint: { hull: "#7c8a6e", hullDark: "#2f3628", emissive: "#8fd0ff", glow: 0.5 },
    blurb:
      "Six-cell hull with the flight deck forward, wings mounted high that droop to the engine pods at the tips, and a tail boom carrying the fin.",
  });
}

/* ------------------------------------------------------------------ */
/* X-Men Blackbird                                                     */
/* ------------------------------------------------------------------ */

export function blackbird(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(
    ...chainZ(["B_COK_B", "B_CON_5", "B_GEN_2", "B_HAB1_A", "B_STR_A_N"]),
    span("B_WNG_R", [0, 0.06, 0.8], [0, 0.06, 3.1], { scale: 0.2, role: "nose cone" }),
    put("B_SHL_A", [0, 0.5, -0.4], { role: "dorsal sensor" }),
  );

  // Nacelles slung UNDER the wing roots, with the twin tails standing on them:
  // at wing height they vanish inside the wing and the jet reads as a flying wing.
  const nacelleX = 1.5;
  parts.push(
    ...pod(["B_TRU_C", "B_TRU_D"], nacelleX, -0.1, -1.5, { role: "engine nacelle" }),
    ...pod(["B_TRU_C", "B_TRU_D"], -nacelleX, -0.1, -1.5, { role: "engine nacelle" }).map((p) => ({
      ...p,
      mirror: true,
    })),
    ...spanPair("B_WNG_R", [0.45, 0.2, -2.1], [2.6, 0.55, -2.1], { scale: 0.7, role: "swept wing" }),
    ...spanPair("B_STR_A_N", [0.45, -0.05, -1.6], [nacelleX, -0.05, -1.6], {
      scale: 0.6,
      role: "nacelle pylon",
    }),
    // twin vertical tails, standing on the nacelles
    put("B_WNG_K", [nacelleX, 0.35, -2.3], { roll: deg(90), scale: 0.5, role: "tail fin stbd" }),
    put("B_WNG_K", [-nacelleX, 0.35, -2.3], { mirror: true, roll: deg(90), scale: 0.5, role: "tail fin port" }),
    ...spanPair("B_WNG_K", [0.5, 0.25, 0.5], [1.35, 0.5, 0.5], { scale: 0.32, role: "canard" }),
  );

  return recipeFor(bp, {
    parts,
    view: { yaw: 0.55, pitch: -0.26, zoom: 1 },
    paint: { hull: "#33383f", hullDark: "#0f1216", emissive: "#5fd0ff", glow: 0.65 },
    blurb:
      "A dagger fuselage with two nacelles at the wing roots, swept wings, twin tails and the canards the comic jet always has.",
  });
}

/* ------------------------------------------------------------------ */
/* Razor Crest — ST-70 (wider than it is long)                         */
/* ------------------------------------------------------------------ */

export function razorCrest(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(
    ...chainZ(["B_COK_D", "B_CON_5", "B_HAB_C", "B_HAB_C", "B_CON2_1", "B_STR_A_N"]),
    put("B_SHL_B", [0, 0.5, -0.4], { role: "sensor mast" }),
  );

  // the twin cylindrical engines sit wide, on stub wings, above the hull line
  const nacelleX = 2.4;
  parts.push(
    ...pod(["B_TRU_C", "B_TRU_D"], nacelleX, 0.22, -2.1, { role: "main engine" }),
    ...pod(["B_TRU_C", "B_TRU_D"], -nacelleX, 0.22, -2.1, { role: "main engine" }).map((p) => ({
      ...p,
      mirror: true,
    })),
  );
  parts.push(
    ...spanPair("B_WNG_A", [0.4, 0.1, -2.6], [nacelleX, 0.22, -2.6], { scale: 0.8, role: "stub wing" }),
    // three legs, per the sheet's landing gear grouping
    hanging("B_LND_A", parts, 0.6, 1.0, { drop: 0.05 }) as LatticePlacement,
    hanging("B_LND_A", parts, -0.6, 1.0, { drop: 0.05 }) as LatticePlacement,
    hanging("B_LND_B", parts, 0, -2.2, { drop: 0.05 }) as LatticePlacement,
    put("B_TUR_D", [0.3, -0.28, 1.2], { role: "nose cannon" }),
    put("B_TUR_D", [-0.3, -0.28, 1.2], { mirror: true, role: "nose cannon" }),
  );

  return recipeFor(bp, {
    parts,
    view: { yaw: 0.35, pitch: -0.3, zoom: 1 },
    paint: { hull: "#8d949c", hullDark: "#33383e", emissive: "#ffb347", glow: 0.5 },
    blurb:
      "24 m long and 28 m wide: a boxy hull with the cargo bay amidships, twin cylindrical engines on stub wings and three gear legs.",
  });
}
