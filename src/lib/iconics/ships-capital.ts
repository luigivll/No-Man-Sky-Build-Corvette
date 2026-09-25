/**
 * Hand-drawn capital ships and transports.
 *
 * References used, as with the fighters: the Nostromo sheet's towing arms and
 * dorsal refinery, the MCRN Tachi's four Epstein drives in a row and its corner
 * PDCs, Serenity's raised bridge with the sensor mule, the Firefly's outboard
 * VTL pods, the Star Destroyer's flat wedge, and the Thunderbird 2's two pod
 * carriers.  Proportions follow the numbers on the sheets where they are given.
 */

import { chainZ, type LatticePlacement } from "../lattice";
import { atTip, deg, fin, hanging, pod, prong, put, row, span, spanPair, standing } from "./dsl";
import { compact, recipeFor } from "./recipe";
import type { Blueprint } from "../types";
import type { NamedRecipe } from "../fleet";
import type { V3 } from "../render3d";

/* ------------------------------------------------------------------ */
/* Millennium Falcon                                                   */
/* ------------------------------------------------------------------ */

export function millenniumFalcon(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  // The saucer is the ship, and the Falcon is nearly as wide as it is long, so the
  // disc is laid out as a hexagon of cells: a full row across the middle, tapering
  // rows fore and aft, with scaled fillers biting the corners off.
  const disc: [number, number, number][] = [
    [0, 0, 1],
    [1, 0, 1],
    [-1, 0, 1],
    [0.55, 1.05, 0.8],
    [-0.55, 1.05, 0.8],
    [0.55, -1.05, 0.8],
    [-0.55, -1.05, 0.8],
    [1.55, 0.35, 0.62],
    [-1.55, 0.35, 0.62],
    [1.5, -0.7, 0.62],
    [-1.5, -0.7, 0.62],
    [0, 1.75, 0.6],
    [0, -1.75, 0.6],
  ];
  disc.forEach(([x, z, sc], i) => {
    parts.push(put("B_CON_5", [x, 0, z], { scale: sc, role: i === 0 ? "saucer core" : "saucer plate" }));
  });

  // forward mandibles: the Falcon's signature gap, overlapping the saucer rim
  parts.push(
    put("B_CON_5", [0.5, 0, 1.75], { role: "mandible" }),
    put("B_CON2_2", [0.5, 0, 2.9], { scale: 0.9, role: "mandible" }),
    put("B_STR_A_N", [0.5, 0, 4.0], { role: "mandible tip" }),
    put("B_CON_5", [-0.5, 0, 1.75], { mirror: true, role: "mandible" }),
    put("B_CON2_2", [-0.5, 0, 2.9], { mirror: true, scale: 0.9, role: "mandible" }),
    put("B_STR_A_N", [-0.5, 0, 4.0], { mirror: true, role: "mandible tip" }),
  );

  // offset cockpit on its own access tube, starboard
  parts.push(
    put("B_CON_5", [1.75, 0.05, 1.15], { scale: 0.9, role: "cockpit tube" }),
    put("B_COK_B", [2.4, 0.05, 0.85], { role: "cockpit" }),
    // side docking rings, flush on the rim
    put("B_SHL_A", [1.78, -0.15, -0.4], { role: "docking ring stbd" }),
    put("B_SHL_A", [-1.78, -0.15, -0.4], { mirror: true, role: "docking ring port" }),
    // three heat exchangers across the back, not one big drum
    ...row("B_TRU_A", [-1.0, 0, 1.0], 0, -2.5, { role: "heat exchanger" }),
    put("B_TRU_D", [0, 0.05, -3.05], { role: "main engine" }),
  );
  parts.push(
    ...compact([
      standing("B_TUR_A", parts, 1.6, 0.4, { role: "dorsal quad turret" }),
      hanging("B_TUR_A", parts, 1.6, 0.4, { role: "ventral quad turret" }),
      standing("B_SHL_C", parts, -1.2, 0.6, { role: "sensor dish" }),
      standing("B_ALK_B", parts, 0, -0.5, { role: "dorsal spine" }),
    ]),
  );

  return recipeFor(bp, {
    parts: compact(parts),
    view: { yaw: 0.5, pitch: -0.6, zoom: 1 },
    paint: { hull: "#b9bcc0", hullDark: "#3d4045", emissive: "#5ec8ff", glow: 0.55 },
    blurb:
      "A nine-cell saucer with the corner cut, two forward mandibles, the offset cockpit tube and the heat exchangers across the back.",
  });
}

/* ------------------------------------------------------------------ */
/* Imperial Star Destroyer                                             */
/* ------------------------------------------------------------------ */

export function starDestroyer(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  // long dorsal spine down the middle of the wedge
  parts.push(
    ...chainZ([
      "B_COK_D",
      "B_CON_5",
      "B_CON2_0",
      "B_GEN_3",
      "B_HAB_A",
      "B_HAB_A",
      "B_CON2_1",
      "B_STR_A_N",
    ]),
  );

  // the wedge, built as three steps of flat plating that widen as they run aft:
  // one big diagonal plate reads as fins, three read as a hull
  parts.push(
    ...spanPair("B_WNG_Q", [0.3, 0, 2.4], [2.9, 0, -0.6], { scale: 0.4, role: "hull plate fore" }),
    ...spanPair("B_WNG_Q", [0.3, 0, 0.4], [4.2, 0, -2.6], { scale: 0.4, role: "hull plate mid" }),
    ...spanPair("B_WNG_Q", [0.3, 0, -1.6], [5.6, 0, -5.4], { scale: 0.4, role: "hull plate aft" }),
    ...spanPair("B_WNG_R", [0.4, -0.02, 1.8], [3.0, -0.02, -0.9], { scale: 0.3, role: "hull edge" }),
  );

  // bridge tower with its two sensor globes, near the stern
  const tower: LatticePlacement[] = [];
  tower.push(standing("B_ALK_B", parts, 0, -5.4, { role: "tower base" }) as LatticePlacement);
  tower.push(standing("B_HAB1_A", [...parts, ...tower], 0, -5.4, { role: "tower deck" }) as LatticePlacement);
  tower.push(
    standing("B_HAB1_C", [...parts, ...tower], 0, -5.4, { role: "bridge" }) as LatticePlacement,
  );
  tower.push(
    put("B_SHL_C", [0.55, 1.6, -5.4], { role: "sensor globe stbd" }),
    put("B_SHL_C", [-0.55, 1.6, -5.4], { mirror: true, role: "sensor globe port" }),
    put("B_SHL_A", [0, 1.75, -5.4], { role: "comms mast" }),
  );
  parts.push(...compact(tower));

  // three big ion engines across the stern
  parts.push(
    ...row("B_TRU_C", [-1.1, 0, 1.1], 0, -7.2, { role: "ion engine" }),
    ...row("B_TRU_A", [-2.2, 2.2], 0, -7.0, { role: "ion engine" }),
    put("B_TUR_F", [0, 0.45, 3.4], { role: "bow turbolaser" }),
    put("B_TUR_B", [0.6, 0.4, 1.6], { role: "turbolaser" }),
    put("B_TUR_B", [-0.6, 0.4, 1.6], { mirror: true, role: "turbolaser" }),
  );

  return recipeFor(bp, {
    parts,
    view: { yaw: 0.6, pitch: -0.42, zoom: 1 },
    paint: { hull: "#aeb6bf", hullDark: "#3a4049", emissive: "#9fd8ff", glow: 0.5 },
    blurb:
      "An eight-cell dorsal spine with flat plates flaring to the stern, the bridge tower and its two globes aft, and three ion engines at the back.",
  });
}

/* ------------------------------------------------------------------ */
/* USS Enterprise (Constitution)                                       */
/* ------------------------------------------------------------------ */

export function enterprise(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  // primary hull: three cells across by two deep, corners cut = a saucer
  const cells: [number, number][] = [
    [0, 1.0],
    [1, 1.0],
    [-1, 1.0],
    [0, 0],
    [1, 0],
    [-1, 0],
    [0.5, 0.5],
    [-0.5, 0.5],
    [0.5, -0.5],
    [-0.5, -0.5],
  ];
  for (const [x, z] of cells) {
    parts.push(
      put("B_CON_5", [x, 0, z], { scale: x % 1 === 0 ? 1 : 0.72, role: "saucer cell" }),
    );
  }
  parts.push(
    standing("B_HAB1_C", parts, 0, 0.5, { role: "bridge module" }) as LatticePlacement,
    standing("B_SHL_C", parts, 0, -0.6, { role: "impulse deck" }) as LatticePlacement,
  );

  // neck down to the secondary hull, then the engineering spine
  parts.push(
    put("B_STR_A_N", [0, -0.62, -1.5], { scale: 0.9, role: "neck" }),
    ...chainZ(["B_HAB_A", "B_HAB_A", "B_CON2_0"], 0).map((p, i) => ({
      ...p,
      pos: [0, -0.62, p.pos[2] - (i === 0 ? 1.0 : 3.0)] as V3,
      role: "secondary hull",
    })),
    put("B_SHL_A", [0, -0.62, 1.2], { role: "deflector dish" }),
  );

  // two warp nacelles on swept pylons: the pylon is a stretched structural node
  // rather than a wing, because the game's wings are three units of chord and
  // read as blades bolted to the saucer
  parts.push(
    ...span("B_STR_A_N", [0.4, -0.1, -2.3], [1.45, 0.95, -2.9], { scale: 0.5, role: "nacelle pylon" })
      ? spanPair("B_WNG_R", [0.4, -0.1, -2.3], [1.45, 0.95, -2.9], { scale: 0.22, role: "nacelle pylon" })
      : [],
  );
  for (const side of [1, -1] as const) {
    parts.push(
      ...chainZ(["B_TRU_H", "B_TRU_D", "B_TRU_H"]).map((p) => ({
        ...p,
        pos: [side * 1.45, 0.95, p.pos[2] - 1.3] as V3,
        mirror: side < 0,
        role: "warp nacelle",
      })),
    );
  }

  return recipeFor(bp, {
    parts,
    view: { yaw: 0.55, pitch: -0.45, zoom: 1 },
    paint: { hull: "#cfd6dd", hullDark: "#4b545e", emissive: "#7fc9ff", glow: 0.55 },
    blurb:
      "A saucer of cells with the corners cut, the bridge on top, a neck down to the engineering hull and two nacelles on swept pylons.",
  });
}

/* ------------------------------------------------------------------ */
/* Serenity (Firefly)                                                  */
/* ------------------------------------------------------------------ */

export function serenity(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(
    ...chainZ(["B_COK_A", "B_HAB_C", "B_ALK_B", "B_HAB_A", "B_CON2_1", "B_STR_A_N"], 0, {
      startIndex: 0,
    }).map((p, i) => ({ ...p, role: i === 0 ? "snout" : "hull" })),
  );

  // raised bridge, with the sensor mule standing on the bridge's own deck
  const bridge: LatticePlacement[] = [];
  bridge.push(standing("B_HAB1_A", parts, 0, 0.4, { role: "bridge deck" }) as LatticePlacement);
  bridge.push(
    standing("B_COK_B", [...parts, ...bridge], 0, 0.4, { role: "flight deck" }) as LatticePlacement,
  );
  parts.push(...compact(bridge));
  parts.push(
    ...compact([
      standing("B_SHL_C", parts, 0, 1.9, { role: "sensor mule" }),
      standing("B_SHL_C", parts, 0, 1.1, { scale: 0.7, role: "sensor mule base" }),
    ]),
  );

  // two outboard VTL pods on stub wings, plus the tail engine
  parts.push(
    ...spanPair("B_WNG_D", [0.5, -0.05, -2.6], [1.9, -0.05, -2.6], { scale: 0.8, role: "engine pylon" }),
  );
  parts.push(
    ...pod(["B_TRU_C", "B_TRU_D"], 1.9, -0.05, -2.3, { role: "VTL engine" }),
    ...pod(["B_TRU_C", "B_TRU_D"], -1.9, -0.05, -2.3, { role: "VTL engine" }).map((p) => ({
      ...p,
      mirror: true,
    })),
    put("B_TRU_C", [0, 0, -3.6], { role: "tail engine" }),
  );
  parts.push(
    hanging("B_LND_B", parts, 0.8, 0.2, { drop: 0.1 }) as LatticePlacement,
    hanging("B_LND_B", parts, -0.8, 0.2, { drop: 0.1 }) as LatticePlacement,
  );

  return recipeFor(bp, {
    parts: compact(parts),
    view: { yaw: 0.85, pitch: -0.32, zoom: 1 },
    paint: { hull: "#9aa39b", hullDark: "#3c443e", emissive: "#ffb45e", glow: 0.5 },
    blurb:
      "Raised bridge and sensor mule up front, a long cargo spine with the ramp aft, two outboard VTL pods and the tail engine.",
  });
}

/* ------------------------------------------------------------------ */
/* Rocinante (MCRN Tachi)                                              */
/* ------------------------------------------------------------------ */

export function rocinante(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(
    ...chainZ([
      "B_COK_D",
      "B_CON_5",
      "B_GEN_3",
      "B_HAB_C",
      "B_HAB_C",
      "B_CON2_0",
      "B_STR_A_N",
    ]),
    // the bow only reaches z 1.0, so the array and railguns ride the cockpit
    ...compact([
      standing("B_SHL_A", parts, 0, 0.7, { role: "targeting array" }),
      hanging("B_TUR_D", parts, 0.32, 0.8, { role: "bow railgun" }),
      hanging("B_TUR_D", parts, -0.32, 0.8, { role: "bow railgun" }),
    ]),
  );

  // the drive deck: three cells wide, then the four Epstein drives in a row
  parts.push(
    ...row("B_HAB1_A", [-1, 0, 1], 0, -7.6, { role: "drive deck" }),
    ...row("B_TRU_D", [-1.75, -0.6, 0.6, 1.75], 0, -8.05, { role: "Epstein drive" }),
  );

  // side sponsons with the PDC clusters on the corners
  parts.push(
    put("B_CON2_0", [1.6, -0.05, -3.4], { role: "sponson stbd" }),
    put("B_CON2_0", [-1.6, -0.05, -3.4], { mirror: true, role: "sponson port" }),
    ...spanPair("B_STR_A_N", [0.3, 0, -2.4], [1.6, 0, -2.4], { scale: 0.7, role: "sponson brace" }),
    ...spanPair("B_STR_A_N", [0.3, 0, -4.2], [1.6, 0, -4.2], { scale: 0.7, role: "sponson brace" }),
  );
  parts.push(
    standing("B_TUR_C", parts, 1.45, -2.8, { role: "PDC" }) as LatticePlacement,
    standing("B_TUR_C", parts, -1.45, -2.8, { role: "PDC" }) as LatticePlacement,
    standing("B_TUR_A", parts, 1.45, -4.4, { role: "PDC" }) as LatticePlacement,
    standing("B_TUR_A", parts, -1.45, -4.4, { role: "PDC" }) as LatticePlacement,
    standing("B_TUR_B", parts, 0, 0.9, { role: "PDC" }) as LatticePlacement,
    hanging("B_TUR_B", parts, 0, 0.9, { role: "PDC" }) as LatticePlacement,
  );

  return recipeFor(bp, {
    parts: compact(parts),
    view: { yaw: 0.45, pitch: -0.42, zoom: 1 },
    paint: { hull: "#8e99a6", hullDark: "#333c47", emissive: "#5fc8ff", glow: 0.6 },
    blurb:
      "Seven-cell hull, three-cell drive deck carrying four Epstein drives, side sponsons and eight PDCs, just like the Tachi's sheet.",
  });
}

/* ------------------------------------------------------------------ */
/* Nostromo (Weyland-Yutani M-class)                                   */
/* ------------------------------------------------------------------ */

export function nostromo(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(
    ...chainZ([
      "B_COK_D",
      "B_CON_5",
      "B_GEN_3",
      "B_HAB_A",
      "B_HAB_A",
      "B_CON2_0",
      "B_CON2_1",
      "B_STR_A_N",
    ]),
  );

  // towing arms: two prongs run forward off the bow, which is the Nostromo's face
  for (const side of [1, -1] as const) {
    parts.push(
      ...chainZ(["B_CON_5", "B_CON_5", "B_STR_A_N"]).map((p) => ({
        ...p,
        pos: [side * 1.1, 0, p.pos[2] + 1.6] as V3,
        mirror: side < 0,
        role: "towing arm",
      })),
      ...spanPair("B_STR_A_N", [0.5, 0, 1.2], [1.1, 0, 1.2], { scale: 0.6, role: "arm brace" }),
    );
  }

  // dorsal refinery: a three-tier processing tower amidships
  const tower: LatticePlacement[] = [];
  tower.push(standing("B_HAB1_B", parts, 0, -6.0, { role: "refinery deck" }) as LatticePlacement);
  tower.push(
    standing("B_CON2_2", [...parts, ...tower], 0, -6.0, { role: "processing tier" }) as LatticePlacement,
  );
  tower.push(
    standing("B_HAB1_A", [...parts, ...tower], 0, -6.0, { role: "cracking tower" }) as LatticePlacement,
  );
  tower.push(
    standing("B_SHL_A", [...parts, ...tower], 0, -6.0, { role: "vent stack" }) as LatticePlacement,
    standing("B_TUR_B", [...parts, ...tower], 0.55, -6.0, { role: "crane" }) as LatticePlacement,
  );
  parts.push(...compact(tower));

  // outboard engine pods on stub arms, plus the inboard bank
  parts.push(
    ...spanPair("B_WNG_R", [0.4, 0, -8.2], [2.8, 0, -8.2], { scale: 0.6, role: "engine arm" }),
    ...pod(["B_TRU_C", "B_TRU_D"], 2.8, 0, -8.4, { role: "outboard engine" }),
    ...pod(["B_TRU_C", "B_TRU_D"], -2.8, 0, -8.4, { role: "outboard engine" }).map((p) => ({
      ...p,
      mirror: true,
    })),
    ...row("B_TRU_D", [-0.6, 0.6], 0, -8.6, { role: "main engine" }),
  );

  return recipeFor(bp, {
    parts,
    view: { yaw: 0.7, pitch: -0.34, zoom: 1 },
    paint: { hull: "#8b8f92", hullDark: "#2f3235", emissive: "#ffc36b", glow: 0.5 },
    blurb:
      "Eight-cell spine with towing arms forward, a three-tier refinery tower amidships and two outboard engine pods on stub arms.",
  });
}

/* ------------------------------------------------------------------ */
/* Thunderbird 2                                                       */
/* ------------------------------------------------------------------ */

export function thunderbird2(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(
    ...chainZ(["B_COK_A", "B_HAB_C", "B_HAB_C", "B_CON2_0", "B_STR_A_N"]),
    put("B_SHL_E", [0, 0.42, 0.9], { role: "flight deck glazing" }),
  );

  // the two pod carriers: a 2 x 2 module stack on each flank, held off the hull
  // on four braced struts — the shape everyone recognises
  for (const side of [1, -1] as const) {
    const px = side * 1.95;
    parts.push(
      ...chainZ(["B_HAB1_A", "B_HAB1_A"]).map((p) => ({
        ...p,
        pos: [px, 0.52, p.pos[2] - 0.9] as V3,
        mirror: side < 0,
        role: "pod upper",
      })),
      ...chainZ(["B_HAB1_C", "B_HAB1_C"]).map((p) => ({
        ...p,
        pos: [px, 0.02, p.pos[2] - 0.9] as V3,
        mirror: side < 0,
        role: "pod lower",
      })),
    );
    // the pod's eye, sitting on the pod's own deck
    parts.push(
      standing("B_SHL_C", parts, Math.abs(px), -0.6, { role: "pod eye" }) as LatticePlacement,
      standing("B_SHL_C", parts, -Math.abs(px), -0.6, {
        mirror: true,
        role: "pod eye",
      }) as LatticePlacement,
    );
    // Two braced struts per station (span, not spanPair: we are already per side).
    // They start inside the hull and land inside the pods' own height band, so
    // each brace buries both ends in metal instead of grazing a surface.
    for (const z of [-0.5, -1.8]) {
      for (const y of [0.24, 0.62]) {
        parts.push(
          span("B_STR_A_N", [0.3, y, z], [Math.abs(px), y, z], {
            scale: 0.55,
            mirror: side < 0,
            role: "pod strut",
          }),
        );
      }
    }
  }

  parts.push(
    hanging("B_LND_C", parts, 0.9, 0.3, { drop: 0.05 }) as LatticePlacement,
    hanging("B_LND_C", parts, -0.9, 0.3, { drop: 0.05 }) as LatticePlacement,
    hanging("B_LND_C", parts, 0.9, -2.6, { drop: 0.05 }) as LatticePlacement,
    hanging("B_LND_C", parts, -0.9, -2.6, { drop: 0.05 }) as LatticePlacement,
    ...row("B_TRU_C", [-0.7, 0.7], 0, -4.4, { role: "main thruster" }),
  );

  return recipeFor(bp, {
    parts: compact(parts),
    view: { yaw: 0.4, pitch: -0.5, zoom: 1 },
    paint: { hull: "#6f8f5f", hullDark: "#243021", emissive: "#ffd479", glow: 0.5 },
    blurb:
      "A five-cell body with the two pod carriers held off the flanks on braced struts, four legs and the thruster bank aft.",
  });
}

/* ------------------------------------------------------------------ */
/* Firespray (Slave I)                                                 */
/* ------------------------------------------------------------------ */

export function firespray(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  // Flown upright, so the "deck" is the ship's belly: a flat four-cell hull with
  // the cockpit and the sensor pod riding on top and the drives hung underneath.
  parts.push(
    put("B_HAB_A", [0.5, 0, -0.2], { role: "hull stbd" }),
    put("B_HAB_A", [-0.5, 0, -0.2], { mirror: true, role: "hull port" }),
    put("B_CON_5", [0.5, 0, 1.7], { role: "nose stbd" }),
    put("B_CON_5", [-0.5, 0, 1.7], { mirror: true, role: "nose port" }),
    put("B_STR_A_N", [0, 0, 3.05], { role: "nose tip" }),
    put("B_COK_B", [0, 0.32, 0.9], { role: "cockpit" }),
    put("B_SHL_B", [0, 0.34, -0.6], { role: "sensor pod" }),
    put("B_TUR_E", [0, -0.3, 2.4], { role: "chin blaster" }),
  );

  // The two rotating arms, each in two segments: the first rises beside the hull,
  // the second leans back in toward the nose. That curve is the ship's silhouette,
  // and one straight segment cannot make it.
  for (const side of [1, -1] as const) {
    const elbow = span("B_WNG_R", [side * 1.05, 0.1, -0.9], [side * 1.85, 1.25, -1.2], {
      scale: 0.5,
      mirror: side < 0,
      role: "grapple arm lower",
    });
    parts.push(elbow);
    const knee = atTip(elbow, [side > 0 ? 1 : -1, 1, 0], 0.4);
    if (knee) {
      const upper = span("B_WNG_R", knee, [side * 1.15, knee[1] + 1.5, knee[2] - 0.3], {
        scale: 0.34,
        mirror: side < 0,
        role: "grapple arm upper",
      });
      parts.push(upper);
      const gun = atTip(upper, [side > 0 ? -1 : 1, 1, 0], 0.3);
      if (gun) {
        parts.push({
          assetId: "B_TUR_A",
          pos: [gun[0], gun[1] - 0.12, gun[2] - 0.4],
          mirror: side < 0,
          roll: upper.roll,
          role: "blaster cannon",
        });
      }
    }
    parts.push(put("B_TRU_A", [side * 1.5, 0.42, -1.9], { mirror: side < 0, role: "arm thruster" }));
  }

  // the two big drives hang under the flat hull
  parts.push(
    ...row("B_TRU_C", [-0.55, 0.55], -0.34, -1.85, { role: "main drive" }),
    ...compact([
      hanging("B_LND_A", parts, 0.6, 0.5, { drop: -0.02 }),
      hanging("B_LND_A", parts, -0.6, 0.5, { drop: -0.02 }),
    ]),
  );

  return recipeFor(bp, {
    parts: compact(parts),
    view: { yaw: 0.75, pitch: -0.34, zoom: 1 },
    paint: { hull: "#5f6470", hullDark: "#20242b", emissive: "#ff7a4a", glow: 0.55 },
    blurb:
      "A flat four-cell hull flown upright, cockpit and sensor pod on the spine, two two-segment grapple arms rising at the flanks and the drives hung underneath.",
  });
}

/* ------------------------------------------------------------------ */
/* Normandy SR-2                                                       */
/* ------------------------------------------------------------------ */

export function normandy(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(
    ...chainZ(["B_COK_B", "B_CON_5", "B_GEN_2", "B_HAB_C", "B_HAB1_A", "B_CON2_0", "B_STR_A_N"]),
    span("B_WNG_R", [0, 0.08, 1.3], [0, 0.08, 3.0], { scale: 0.42, role: "nose" }),
    // the CIC hump and the drive core
    standing("B_ALK_B", parts, 0, -0.2, { role: "CIC" }) as LatticePlacement,
    put("B_GEN_0", [0, 0.5, -3.2], { role: "Tantalus drive core" }),
  );

  parts.push(
    ...spanPair("B_WNG_D", [0.5, 0, -3.6], [2.1, 0.32, -3.6], { scale: 0.8, role: "wing" }),
    ...pod(["B_TRU_C", "B_TRU_D"], 1.6, 0.05, -3.9, { role: "engine pod" }),
    ...pod(["B_TRU_C", "B_TRU_D"], -1.6, 0.05, -3.9, { role: "engine pod" }).map((p) => ({
      ...p,
      mirror: true,
    })),
    // twin tail fins
    put("B_WNG_K", [0.45, 0.75, -5.2], { roll: deg(90), scale: 0.5, role: "tail fin stbd" }),
    put("B_WNG_K", [-0.45, 0.75, -5.2], { mirror: true, roll: deg(90), scale: 0.5, role: "tail fin port" }),
    put("B_TUR_D", [0.3, -0.3, 1.4], { role: "chin cannon" }),
    put("B_TUR_D", [-0.3, -0.3, 1.4], { mirror: true, role: "chin cannon" }),
  );

  return recipeFor(bp, {
    parts: compact(parts),
    view: { yaw: 0.5, pitch: -0.3, zoom: 1 },
    paint: { hull: "#9aa3ad", hullDark: "#333b45", emissive: "#6fc9ff", glow: 0.65 },
    blurb:
      "Seven-cell hull with the CIC hump amidships, swept wings, twin tail fins, two engine pods and the drive core aft.",
  });
}

/* ------------------------------------------------------------------ */
/* Corrupted Dreadnought (Sentinel capital)                            */
/* ------------------------------------------------------------------ */

export function corruptedDreadnought(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  parts.push(
    ...chainZ([
      "B_COK_D",
      "B_CON_5",
      "B_CON2_0",
      "B_GEN_3",
      "B_HAB_A",
      "B_HAB_A",
      "B_HAB_A",
      "B_CON2_1",
      "B_CON2_2",
      "B_STR_A_N",
    ]),
  );

  // four blades sweeping out of the flanks, canted up and down
  for (const side of [1, -1] as const) {
    for (const up of [1, -1] as const) {
      const blade = span(
        "B_WNG_Q",
        [side * 0.45, 0.05, -3.2],
        [side * 4.4, up * 2.3, -6.4],
        { scale: 0.7, mirror: side < 0, role: up > 0 ? "upper blade" : "lower blade" },
      );
      parts.push(blade);
    }
  }

  // dorsal cathedral: stacked modules and glowing hardware
  const tower: LatticePlacement[] = [];
  tower.push(standing("B_ALK_B", parts, 0, -6.0, { role: "spine fairing" }) as LatticePlacement);
  tower.push(
    standing("B_HAB1_A", [...parts, ...tower], 0, -6.0, { role: "spine deck" }) as LatticePlacement,
  );
  tower.push(
    standing("B_CON2_3", [...parts, ...tower], 0, -6.0, { role: "spine ridge" }) as LatticePlacement,
  );
  parts.push(...compact(tower));
  parts.push(
    // bow spike, so the siege cannon has something to hang from
    ...prong(["B_STR_A_N", "B_CON_5", "B_STR_A_N"], 0, 0, 2.6, { role: "bow spike" }),
    ...compact([
      standing("B_SHL_A", parts, 0.4, -6.0, { role: "shield node" }),
      standing("B_SHL_A", parts, -0.4, -6.0, { mirror: true, role: "shield node" }),
      standing("B_SHL_C", parts, 0, -3.6, { role: "shield node" }),
      standing("B_SHL_C", parts, 0.8, -1.6, { role: "shield node" }),
      standing("B_SHL_C", parts, -0.8, -1.6, { mirror: true, role: "shield node" }),
      hanging("B_TUR_F", parts, 0, 1.6, { role: "siege cannon" }),
    ]),
    ...row("B_TRU_C", [-1.6, 0, 1.6], 0, -11.0, { role: "main engine" }),
    ...row("B_TRU_A", [-0.7, 0.7], 0.3, -10.6, { role: "main engine" }),
  );

  return recipeFor(bp, {
    parts: compact(parts),
    view: { yaw: 0.6, pitch: -0.36, zoom: 1 },
    paint: { hull: "#3c4a55", hullDark: "#141c22", emissive: "#63f5c0", glow: 0.85 },
    blurb:
      "A ten-cell spine, four blades sweeping out of the flanks, a stacked dorsal ridge and shield nodes glowing along the whole length.",
  });
}
