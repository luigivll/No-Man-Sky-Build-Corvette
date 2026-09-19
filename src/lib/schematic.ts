import { categoryById, partById } from "./data";
import { expandParts } from "./build";
import type { Build, Part, PartCategoryId } from "./types";

export interface SchematicBlock {
  key: string;
  partId: string;
  partName: string;
  category: PartCategoryId;
  kind:
    | "cockpit"
    | "hab"
    | "walkway"
    | "reactor"
    | "bay"
    | "engine-main"
    | "engine-light"
    | "weapon"
    | "gear"
    | "wing"
    | "plating"
    | "shield";
  shape: "rect" | "poly" | "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  points?: string;
  accent: string;
  rotate?: number;
  z: number;
}

export interface SchematicLayout {
  width: number;
  height: number;
  blocks: SchematicBlock[];
  hullCenterX: number;
  hullTop: number;
  hullBottom: number;
  hasWings: boolean;
}

const W = 480;
const H = 380;
const CX = W / 2;
const NOSE_Y = 46;
const BODY_LIMIT = 300;

function rotatePoint(x: number, y: number, cx: number, cy: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(rad) - dy * Math.sin(rad), cy + dx * Math.sin(rad) + dy * Math.cos(rad)];
}

function polyRect(cx: number, cy: number, w: number, h: number, deg = 0): string {
  const corners: [number, number][] = [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ];
  return corners
    .map(([x, y]) => rotatePoint(x, y, cx, cy, deg).map((n) => Math.round(n)).join(","))
    .join(" ");
}

function stack(
  list: Part[],
  predicate: (p: Part) => boolean,
): Part[] {
  return list.filter(predicate);
}

/**
 * Turns a build into a top-down schematic. This is a stylised blueprint, not a
 * scale model: hull length grows with modules, wings cluster in pairs, engines
 * sit at the stern and weapon hardpoints hug the outermost surface.
 */
export function computeSchematic(build: Build): SchematicLayout {
  const all = expandParts(build);
  const blocks: SchematicBlock[] = [];
  const accentOf = (category: PartCategoryId) => categoryById[category]?.accent ?? "#38bdf8";

  const cockpits = stack(all, (p) => p.category === "cockpit");
  const habs = stack(all, (p) => p.category === "habitation" && p.cargoSlots === 3);
  const walkways = stack(all, (p) => p.category === "habitation" && p.cargoSlots === 1);
  const reactors = stack(all, (p) => p.category === "reactor");
  const bays = stack(all, (p) => p.category === "access");
  const mains = stack(all, (p) => p.category === "engine-main");
  const lights = stack(all, (p) => p.category === "engine-light");
  const weapons = stack(all, (p) => p.category === "weapon");
  const gears = stack(all, (p) => p.category === "landing");
  const wings = stack(all, (p) => p.category === "wing" && p.geometry.mount !== "hull");
  const platings = stack(all, (p) => p.category === "wing" && p.geometry.mount === "hull");
  const shields = stack(all, (p) => p.category === "shield");

  // ---- cockpit -----------------------------------------------------------
  const cockpit = cockpits[0];
  let cursorY = NOSE_Y;
  if (cockpit) {
    const profile = cockpit.geometry.profile;
    const w = profile === "blunt-block" ? 74 : profile === "offset-dome" ? 58 : 62;
    const h = profile === "blunt-block" ? 40 : 48;
    const offsetX = profile === "offset-dome" ? 20 : 0;
    if (profile === "offset-dome") {
      blocks.push({
        key: "cockpit-bridge",
        partId: cockpit.id,
        partName: cockpit.name,
        category: "cockpit",
        kind: "cockpit",
        shape: "rect",
        x: CX - 6,
        y: cursorY + 12,
        w: 20,
        h: 22,
        rx: 4,
        accent: accentOf("cockpit"),
        z: 4,
      });
    }
    blocks.push({
      key: "cockpit",
      partId: cockpit.id,
      partName: cockpit.name,
      category: "cockpit",
      kind: "cockpit",
      shape: profile === "arrowhead" ? "poly" : "rect",
      x: CX + offsetX - w / 2,
      y: cursorY,
      w,
      h,
      rx: profile === "blunt-block" ? 6 : 26,
      points:
        profile === "arrowhead"
          ? `${CX + offsetX},${cursorY - 22} ${CX + offsetX + w / 2},${cursorY + 30} ${CX + offsetX},${cursorY + h} ${CX + offsetX - w / 2},${cursorY + 30}`
          : undefined,
      accent: accentOf("cockpit"),
      z: 3,
    });
    cursorY += h;
  }

  // ---- hull spine (habs + walkways) --------------------------------------
  const segments: { part: Part; h: number; w: number; kind: "hab" | "walkway" }[] = [];
  for (const hab of habs) segments.push({ part: hab, h: 30, w: Math.min(96, 40 + hab.geometry.span * 8), kind: "hab" });
  for (const walkway of walkways) segments.push({ part: walkway, h: 14, w: 34, kind: "walkway" });

  const rawLength = segments.reduce((sum, s) => sum + s.h, 0);
  const available = BODY_LIMIT - cursorY;
  const scale = rawLength > available ? Math.max(0.35, available / Math.max(1, rawLength)) : 1;

  const hullTop = cursorY;
  let y = cursorY;
  segments.forEach((segment, index) => {
    const h = Math.max(6, segment.h * scale);
    blocks.push({
      key: `hull-${index}`,
      partId: segment.part.id,
      partName: segment.part.name,
      category: "habitation",
      kind: segment.kind,
      shape: "rect",
      x: CX - segment.w / 2,
      y,
      w: segment.w,
      h,
      rx: segment.kind === "walkway" ? 4 : 8,
      accent: accentOf("habitation"),
      z: 2,
    });
    y += h;
  });
  const hullBottom = Math.max(y, cursorY + 24);
  const hullMidY = (hullTop + hullBottom) / 2;

  // ---- reactors (inner core, dorsal line) --------------------------------
  reactors.forEach((reactor, index) => {
    const spot = hullTop + ((index + 0.5) / Math.max(1, reactors.length)) * (hullBottom - hullTop);
    blocks.push({
      key: `reactor-${index}`,
      partId: reactor.id,
      partName: reactor.name,
      category: "reactor",
      kind: "reactor",
      shape: "rect",
      x: CX - 9,
      y: spot - 9,
      w: 18,
      h: 18,
      rx: 3,
      accent: accentOf("reactor"),
      z: 5,
    });
  });

  // ---- access bays (ventral, drawn behind the hull) ----------------------
  bays.forEach((bay, index) => {
    const spot = hullBottom - 16 - index * 30;
    blocks.push({
      key: `bay-${index}`,
      partId: bay.id,
      partName: bay.name,
      category: "access",
      kind: "bay",
      shape: "rect",
      x: CX - 30,
      y: Math.max(hullTop + 6, spot),
      w: 60,
      h: 20,
      rx: 6,
      accent: accentOf("access"),
      z: 1,
    });
  });

  // ---- wings (paired port/starboard) -------------------------------------
  const wingPairs: Part[][] = [];
  for (let i = 0; i < wings.length; i += 2) wingPairs.push(wings.slice(i, i + 2));
  wingPairs.forEach((pair, index) => {
    const fractions = wingPairs.length === 1 ? [0.5] : index === 0 ? [0.28] : index === wingPairs.length - 1 ? [0.82] : [0.35 + index * 0.2];
    const spotY = hullTop + Math.min(0.9, fractions[0]) * Math.max(30, hullBottom - hullTop);
    const sample = pair[0];
    const span = 34 + sample.geometry.span * 9;
    const chord = 30 + sample.geometry.span * 2;
    const sweep = sample.geometry.profile === "s-foil" ? 14 : sample.geometry.profile === "swept" ? 8 : 4;
    const thickness = 9;
    for (const side of [-1, 1] as const) {
      const root = CX + side * 22;
      const tip = CX + side * (22 + span);
      blocks.push({
        key: `wing-${index}-${side}`,
        partId: sample.id,
        partName: sample.name,
        category: "wing",
        kind: "wing",
        shape: "poly",
        x: Math.min(root, tip),
        y: spotY - chord / 2,
        w: span,
        h: chord,
        points: `${root},${spotY - thickness} ${tip},${spotY - chord / 2 + sweep} ${tip},${spotY + chord / 2 - sweep} ${root},${spotY + thickness}`,
        accent: accentOf("wing"),
        z: 2,
      });
    }
  });

  // ---- external plating --------------------------------------------------
  platings.forEach((plate, index) => {
    const spot = hullTop + ((index + 1) / (platings.length + 1)) * Math.max(24, hullBottom - hullTop);
    for (const side of [-1, 1] as const) {
      blocks.push({
        key: `plate-${index}-${side}`,
        partId: plate.id,
        partName: plate.name,
        category: "wing",
        kind: "plating",
        shape: "rect",
        x: CX + side * 30 - (side > 0 ? 0 : 12),
        y: spot - 6,
        w: 12,
        h: 13,
        rx: 2,
        accent: accentOf("wing"),
        z: 3,
      });
    }
  });

  // ---- weapons -----------------------------------------------------------
  weapons.forEach((weapon, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const row = Math.floor(index / 2);
    const outer = wingPairs.length > 0 ? 30 + 34 + 12 : 40;
    const spotY = hullTop + 0.35 * Math.max(30, hullBottom - hullTop) + row * 18;
    blocks.push({
      key: `weapon-${index}`,
      partId: weapon.id,
      partName: weapon.name,
      category: "weapon",
      kind: "weapon",
      shape: "poly",
      x: CX + side * outer - 9,
      y: spotY - 5,
      w: 16,
      h: 9,
      points: polyRect(CX + side * outer, spotY, 22, 7, side * 6),
      accent: accentOf("weapon"),
      z: 6,
    });
  });

  // ---- engines -----------------------------------------------------------
  const engineRowY = hullBottom + 16;
  const mainSpacing = Math.min(46, 150 / Math.max(1, mains.length));
  mains.forEach((engine, index) => {
    const offset = (index - (mains.length - 1) / 2) * mainSpacing;
    blocks.push({
      key: `main-${index}`,
      partId: engine.id,
      partName: engine.name,
      category: "engine-main",
      kind: "engine-main",
      shape: "rect",
      x: CX + offset - 15,
      y: engineRowY,
      w: 30,
      h: 30,
      rx: 8,
      accent: accentOf("engine-main"),
      z: 4,
    });
  });
  lights.forEach((engine, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const row = Math.floor(index / 2);
    const offset = side * (52 + row * 26 + Math.max(0, mains.length - 1) * mainSpacing * 0.5);
    blocks.push({
      key: `light-${index}`,
      partId: engine.id,
      partName: engine.name,
      category: "engine-light",
      kind: "engine-light",
      shape: "rect",
      x: CX + offset - 9,
      y: engineRowY + 6,
      w: 18,
      h: 18,
      rx: 5,
      accent: accentOf("engine-light"),
      z: 4,
    });
  });

  // ---- landing gear (ventral chevrons) -----------------------------------
  const gearY = Math.min(H - 16, engineRowY + 34);
  gears.forEach((gear, index) => {
    const spread = 60 + index * 26;
    const side = index % 2 === 0 ? -1 : 1;
    blocks.push({
      key: `gear-${index}`,
      partId: gear.id,
      partName: gear.name,
      category: "landing",
      kind: "gear",
      shape: "poly",
      x: CX + side * spread - 9,
      y: gearY,
      w: 18,
      h: 12,
      points: polyRect(CX + side * spread, gearY + 5, 18, 10, side * 18),
      accent: accentOf("landing"),
      z: 7,
    });
  });

  // ---- shield envelope ---------------------------------------------------
  if (shields.length > 0) {
    const radius = Math.max(hullBottom - hullTop, 70) / 2 + 34;
    blocks.push({
      key: "shield",
      partId: shields[0].id,
      partName: shields.map((s) => s.name).join(" + "),
      category: "shield",
      kind: "shield",
      shape: "ellipse",
      x: CX - 92,
      y: hullMidY - radius,
      w: 184,
      h: radius * 2,
      accent: accentOf("shield"),
      z: 0,
    });
  }

  return {
    width: W,
    height: H,
    blocks: blocks.sort((a, b) => a.z - b.z),
    hullCenterX: CX,
    hullTop,
    hullBottom,
    hasWings: wingPairs.length > 0,
  };
}

export function schematicSummary(build: Build): { label: string; value: string }[] {
  const layout = computeSchematic(build);
  const hullLength = Math.round(layout.hullBottom - layout.hullTop);
  const wings = layout.blocks.filter((b) => b.kind === "wing").length / 2;
  return [
    { label: "Hull length", value: `${hullLength} u` },
    { label: "Wing pairs", value: `${wings}` },
    {
      label: "Silhouette",
      value: wings >= 3 ? "Heavy gunship" : wings >= 1 ? "Winged cruiser" : "Cigar hull",
    },
  ];
}

export function partAccent(partId: string): string {
  const part = partById[partId];
  return part ? categoryById[part.category]?.accent ?? "#38bdf8" : "#38bdf8";
}
