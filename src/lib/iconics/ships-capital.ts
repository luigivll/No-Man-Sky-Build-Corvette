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
import { atTip, deg, fin, hanging, pod, prong, put, row, span, spanPair, standing, surfaceAt } from "./dsl";
import { compact, recipeFor } from "./recipe";
import type { Blueprint } from "../types";
import type { NamedRecipe } from "../fleet";
import type { V3 } from "../render3d";

/* ------------------------------------------------------------------ */
/* Millennium Falcon                                                   */
/* ------------------------------------------------------------------ */

export function millenniumFalcon(bp: Blueprint): NamedRecipe {
  const parts: LatticePlacement[] = [];

  // The pack has no round part at all — the roundest thing in it is a dome — so
  // the YT-1300 disc is a MOSAIC: half-metre cells laid on a hex grid and kept
  // only where they fall inside the circle. The silhouette is what makes the
  // saucer read, and the silhouette is the grid's outline.
  const R = 2.1;
  const pitch = 0.5;
  for (let z = -R; z <= R + 1e-6; z += pitch) {
    const half = Math.sqrt(Math.max(0, R * R - z * z));
    for (let x = -half; x <= half + 1e-6; x += pitch) {
      // Half-metre plates on a half-metre pitch would BUTT exactly, and butting
      // plates show every seam and bevel: the saucer came out looking like a
      // radiator grille. Overlapping them ~15% welds the disc into one surface
      // and the outline is still the circle, because the cells are placed on the
      // circle in the first place.
      const r = Math.hypot(x, z) / R;
      const scale = r > 0.92 ? 0.5 : 0.58;
      parts.push(
        put("B_CON_5", [Number(x.toFixed(2)), 0, Number(z.toFixed(2))], {
          scale,
          role: r > 0.92 ? "rim plate" : "saucer plate",
        }),
      );
    }
  }

  // forward mandibles, rooted inside the rim so they are one hull with the disc
  parts.push(
    put("B_CON_5", [0.62, 0, 1.65], { scale: 0.6, role: "mandible root" }),
    put("B_CON_5", [0.62, 0, 2.3], { scale: 0.6, role: "mandible" }),
    put("B_STR_A_N", [0.62, 0, 2.95], { scale: 0.6, role: "mandible tip" }),
    put("B_CON_5", [-0.62, 0, 1.65], { mirror: true, scale: 0.6, role: "mandible root" }),
    put("B_CON_5", [-0.62, 0, 2.3], { mirror: true, scale: 0.6, role: "mandible" }),
    put("B_STR_A_N", [-0.62, 0, 2.95], { mirror: true, scale: 0.6, role: "mandible tip" }),
  );

  // offset cockpit on its own access tube, starboard, jammed into the rim
  parts.push(
    put("B_CON2_2", [1.55, 0.04, 1.15], { scale: 0.75, role: "cockpit tube" }),
    put("B_COK_B", [2.2, 0.04, 0.9], { scale: 0.9, role: "cockpit" }),
    // docking rings flush against the rim
    put("B_SHL_A", [1.62, -0.1, -0.7], { role: "docking ring stbd" }),
    put("B_SHL_A", [-1.62, -0.1, -0.7], { mirror: true, role: "docking ring port" }),
    // engine bank across the back: three exchangers plus the main drive
    ...row("B_TRU_A", [-0.58, 0, 0.58], 0, -1.9, { role: "heat exchanger" }),
    put("B_TRU_D", [0, 0.05, -2.0], { role: "main drive" }),
  );
  parts.push(
    ...compact([
      standing("B_TUR_A", parts, 0.7, 1.0, { role: "dorsal quad turret" }),
      hanging("B_TUR_A", parts, 0.7, 1.0, { role: "ventral quad turret" }),
      standing("B_SHL_C", parts, -0.9, -0.4, { role: "sensor dome" }),
      standing("B_ALK_B", parts, 0, 0.4, { role: "dorsal spine" }),
    ]),
  );

  return recipeFor(bp, {
    parts: compact(parts),
    view: { yaw: 0.5, pitch: -0.6, zoom: 1 },
    paint: { hull: "#b9bcc0", hullDark: "#3d4045", emissive: "#5ec8ff", glow: 0.55 },
    blurb:
      "A disc of hull plates on a hex grid, two forward mandibles, the offset cockpit tube on its access corridor and the engine bank across the back.",
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

  // The wedge: rows of connector cells across the hull, each row wider than the
  // last. Four approaches were tried and three are recorded here because the
  // failures are the informative part:
  //
  //   fanned wing plates   -> fins. The game wings are thin perforated panels;
  //                           stretched to five units their spars become spikes
  //                           and their cut-outs become holes.
  //   tiled grid cells     -> a radiator grille. Every cell carries its own
  //                           bevel, so the eye counts crates, not a hull.
  //   habitation modules   -> those are INTERIOR parts: no roof, so the rows
  //                           render as open corridors.
  //
  // Connector cells are solid boxes with flat tops, and overlapping them by
  // about a third buries the bevels. Rows of different widths then step from the
  // bow to the wide stern, which is what the Workshop would let you lay.
  const ROWS: [number, number, number][] = [
    // [cells across the row, z, scale]
    [2, 2.3, 0.8],
    [4, 1.0, 1],
    [6, -0.6, 1],
    [8, -2.4, 1],
    [8, -4.1, 1],
  ];
  for (const [across, z, sc] of ROWS) {
    for (let i = 0; i < across; i++) {
      const x = (i - (across - 1) / 2) * (0.95 * sc);
      parts.push(put("B_CON_5", [Number(x.toFixed(2)), 0, z], { scale: sc, role: "hull plate" }));
    }
  }

  // bridge tower with its two sensor globes, near the stern
  const tower: LatticePlacement[] = [];
  const TOWER_Z = -4.4;
  tower.push(standing("B_ALK_B", parts, 0, TOWER_Z, { role: "tower base" }) as LatticePlacement);
  tower.push(
    standing("B_HAB1_A", [...parts, ...tower], 0, TOWER_Z, { role: "tower deck" }) as LatticePlacement,
  );
  tower.push(
    standing("B_HAB1_C", [...parts, ...tower], 0, TOWER_Z, { role: "bridge" }) as LatticePlacement,
  );
  const towerTop = surfaceAt([...parts, ...tower], -0.55, TOWER_Z);
  tower.push(
    put("B_SHL_C", [0.55, towerTop + 0.05, TOWER_Z], { role: "sensor globe stbd" }),
    put("B_SHL_C", [-0.55, towerTop + 0.05, TOWER_Z], { mirror: true, role: "sensor globe port" }),
    put("B_SHL_A", [0, towerTop + 0.05, TOWER_Z], { role: "comms mast" }),
  );
  parts.push(...compact(tower));

  // three big ion engines across the stern
  parts.push(
    ...row("B_TRU_C", [-1.9, 0, 1.9], 0, -4.0, { role: "ion engine" }),
    ...row("B_TRU_A", [-3.1, 3.1], 0, -4.0, { role: "ion engine" }),
    hanging("B_TUR_F", parts, 0, 1.9, { role: "bow turbolaser" }) as LatticePlacement,
    ...compact([
      standing("B_TUR_B", parts, 0.95, 1.6, { role: "turbolaser" }),
      standing("B_TUR_B", parts, -0.95, 1.6, { mirror: true, role: "turbolaser" }),
    ]),
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
  const DECK = 0;

  // Primary hull: five cells across the waist tapering to three fore and aft, with
  // the corners bitten off by scaled fillers. The neck then starts INSIDE that
  // saucer, which is what keeps the two hulls joined instead of parked next to
  // each other.
  const disc: [number, number, number][] = [
    [0, 1.5, 0.55],
    [0, 0, 1],
    [1, 0, 1],
    [-1, 0, 1],
    [1.8, 0, 0.6],
    [-1.8, 0, 0.6],
    [0.55, 1.0, 0.8],
    [-0.55, 1.0, 0.8],
    [1.4, 0.7, 0.6],
    [-1.4, 0.7, 0.6],
    [0.55, -1.1, 0.8],
    [-0.55, -1.1, 0.8],
    [1.4, -0.7, 0.6],
    [-1.4, -0.7, 0.6],
    [0, -1.9, 0.6],
  ];
  disc.forEach(([x, z, sc], i) => {
    parts.push(
      put("B_CON_5", [x, DECK, z], { scale: sc, role: i === 0 ? "saucer core" : "saucer plate" }),
    );
  });
  parts.push(
    ...compact([
      standing("B_HAB1_C", parts, 0, 0.5, { role: "bridge module" }),
      standing("B_SHL_C", parts, 0, -1.9, { scale: 0.8, role: "impulse deck" }),
    ]),
  );

  // Neck: a structural node buried in the saucer's underside, then the engineering
  // hull hangs off it two cells further aft.
  const neck = put("B_STR_A_N", [0, -0.34, -1.95], { scale: 0.95, role: "neck" });
  parts.push(neck);
  // Engineering hull: three cells of body off the bottom of the neck, with the
  // deflector dish up front and the nacelle pylons growing out of its flanks.
  parts.push(
    put("B_HAB_A", [0, -0.34, -3.1], { role: "engineering hull" }),
    put("B_HAB_A", [0, -0.34, -4.6], { role: "engineering hull" }),
    put("B_CON2_0", [0, -0.34, -5.8], { role: "engineering hull aft" }),
    put("B_SHL_A", [0, -0.52, -2.5], { role: "deflector dish" }),
  );

  // Warp nacelles: pylons rise out of the engineering hull and the nacelles sit up
  // and out, so the classic silhouette shows in the bow view too.
  const pyA: V3 = [0.45, -0.2, -3.6];
  const pyB: V3 = [1.5, 0.75, -3.9];
  const pylons = spanPair("B_WNG_R", pyA, pyB, { scale: 0.22, role: "nacelle pylon" });
  parts.push(...pylons);
  for (const side of [1, -1] as const) {
    parts.push(
      ...chainZ(["B_TRU_H", "B_TRU_H", "B_TRU_D"]).map((p) => ({
        ...p,
        pos: [side * 1.5, 0.75, p.pos[2] - 2.1] as V3,
        mirror: side < 0,
        role: "warp nacelle",
      })),
    );
  }

  return recipeFor(bp, {
    parts: compact(parts),
    view: { yaw: 0.55, pitch: -0.45, zoom: 1 },
    paint: { hull: "#cfd6dd", hullDark: "#4b545e", emissive: "#7fc9ff", glow: 0.55 },
    blurb:
      "A wide saucer with the corners cut and the bridge on top, a neck down to the engineering hull, and two nacelles on swept pylons rising off it.",
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

  // The Firefly's neck: a low flight deck standing on the hull amidships, with the
  // sensor mule standing on THAT — two blobs at different stations and heights
  // just read as damage.
  // The mule sits directly on the nose deck, with the raised flight deck behind it —
  // stacking the mule on the neck instead left it hanging a unit above the bow.
  parts.push(
    ...compact([
      standing("B_SHL_C", parts, 0, 0.35, { scale: 0.75, role: "sensor mule" }),
      standing("B_COK_D", parts, 0, -1.4, { role: "flight deck" }),
    ]),
  );

  // the mid-hull gets a second cell of width, so the cargo body has the volume the
  // ship is mostly made of instead of reading as a pipe
  parts.push(
    put("B_ALK_B", [0.62, 0, -2.4], { scale: 0.85, role: "cargo flank stbd" }),
    put("B_ALK_B", [-0.62, 0, -2.4], { mirror: true, scale: 0.85, role: "cargo flank port" }),
    put("B_ALK_B", [0.62, 0, -3.6], { scale: 0.85, role: "cargo flank stbd" }),
    put("B_ALK_B", [-0.62, 0, -3.6], { mirror: true, scale: 0.85, role: "cargo flank port" }),
  );

  // The aft ramp: its own module on the centreline, not a four-unit wing stood on
  // edge — a wing there reads as a fin the ship does not have.
  parts.push(
    put("B_CON2_2", [0, -0.02, -4.75], { scale: 0.9, role: "cargo ramp" }),
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

  // An M-class tug is a big blocky industrial hull, so the spine is two cells
  // tall and three wide amidships instead of a single row of modules.
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
    // second deck over the cargo run
    ...chainZ(["B_HAB_A", "B_HAB_A", "B_CON2_0"]).map((p) => ({
      ...p,
      pos: [0, 0.52, p.pos[2] - 4.1] as V3,
      role: "upper deck",
    })),
    // side plating, so the hull has width and the deck lights sit in a wall
    ...["B_CON_6", "B_CON_7", "B_CON_8"]
      .map((id, i) => put(id, [1.0, 0, -4.6 - i * 1.0], { role: "side plating" }))
      .flatMap((p) => [p, { ...p, pos: [-p.pos[0], p.pos[1], p.pos[2]] as V3, mirror: true }]),
  );

  // Towing arms: two needles reaching ahead of the bow, about a third of the hull
  // long apiece. That silhouette — blunt industrial hull, two prongs — is the
  // Nostromo's face, and boxy arms do not read as it.
  for (const side of [1, -1] as const) {
    const px = side * 0.95;
    parts.push(
      span("B_WNG_R", [px, -0.05, 0.6], [px, -0.05, 3.2], { scale: 0.16, role: "towing arm" }),
      span("B_WNG_R", [px, 0.35, 0.6], [px, 0.35, 2.9], { scale: 0.12, role: "towing arm upper" }),
      put("B_STR_A_N", [px, 0.16, 3.0], { scale: 0.55, mirror: side < 0, role: "arm clamp" }),
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
    standing("B_TUR_B", [...parts, ...tower], 0.6, -6.0, { role: "crane" }) as LatticePlacement,
  );
  parts.push(...compact(tower));

  // outboard engine pods on stub arms, plus the inboard bank
  parts.push(
    ...spanPair("B_WNG_R", [0.4, 0, -8.2], [2.4, 0, -8.2], { scale: 0.6, role: "engine arm" }),
    ...pod(["B_TRU_C", "B_TRU_D"], 2.4, 0, -8.4, { role: "outboard engine" }),
    ...pod(["B_TRU_C", "B_TRU_D"], -2.4, 0, -8.4, { role: "outboard engine" }).map((p) => ({
      ...p,
      mirror: true,
    })),
    ...row("B_TRU_D", [-0.6, 0.6], 0, -8.8, { role: "main engine" }),
  );

  return recipeFor(bp, {
    parts: compact(parts),
    view: { yaw: 0.7, pitch: -0.34, zoom: 1 },
    paint: { hull: "#8b8f92", hullDark: "#2f3235", emissive: "#ffc36b", glow: 0.5 },
    blurb:
      "A two-deck industrial hull three cells wide, two towing needles reaching ahead of the bow, a three-tier refinery tower amidships and two outboard engine pods.",
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
