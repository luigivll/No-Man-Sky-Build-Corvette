/**
 * Ship styles ("familias") for the shipyard.
 *
 * In No Man's Sky a Corvette is the same set of Workshop modules every time -
 * what changes is the hull finish, the glow colour and the exotic trim you get
 * from Sentinel / Solar / Exotic / Pirate hardware. These styles drive the 3D
 * render (materials, emissive colour, engine trail, flourishes) and also bias
 * which modules the randomizer prefers.
 */

import type { PartCategoryId } from "./types";

export type ShipFamily =
  | "corvette"
  | "sentinel"
  | "solar"
  | "exotic"
  | "pirate"
  | "organic"
  | "stealth";

export type FlourishId =
  | "ring-engines"
  | "blade-wings"
  | "solar-sails"
  | "exotic-fin"
  | "pirate-spikes"
  | "organic-veins"
  | "hull-rim-glow"
  | "dorsal-towers";

export interface ShipStyle {
  id: string;
  label: string;
  family: ShipFamily;
  blurb: string;
  /** main hull plating colour */
  hullBase: string;
  /** recessed / shadowed hull colour */
  hullDark: string;
  /** glow colour for trim, windows and rings */
  emissive: string;
  /** brighter glow used for engine cores */
  emissiveHot: string;
  /** engine trail colour */
  trail: string;
  environment: "space" | "hangar";
  flourishes: FlourishId[];
  /** part tags this family likes */
  prefers: string[];
  /** categories this family leans into */
  boost: PartCategoryId[];
}

export const SHIP_STYLES: ShipStyle[] = [
  {
    id: "corvette",
    label: "Standard Corvette",
    family: "corvette",
    blurb:
      "Workshop-stock gunmetal with cyan trim. The default Voyagers look, straight out of the Space Station bay.",
    hullBase: "#8b95a3",
    hullDark: "#2f3846",
    emissive: "#67e8f9",
    emissiveHot: "#bdf1ff",
    trail: "#7fd4ff",
    environment: "hangar",
    flourishes: ["hull-rim-glow"],
    prefers: ["stabiliser", "plating", "balanced"],
    boost: [],
  },
  {
    id: "sentinel",
    label: "Sentinel Interceptor",
    family: "sentinel",
    blurb:
      "Corrupted black plating, crimson ring engines and bladed wings. Built from salvaged Sentinel hardware - fast, angular and hostile.",
    hullBase: "#191c23",
    hullDark: "#08090d",
    emissive: "#ff3427",
    emissiveHot: "#ffd7a8",
    trail: "#ffb03a",
    environment: "space",
    flourishes: ["ring-engines", "blade-wings", "hull-rim-glow"],
    prefers: ["s-foil", "aggressive", "hardpoint", "high-dps", "tanky"],
    boost: ["weapon", "wing", "engine-main"],
  },
  {
    id: "solar",
    label: "Solar Sail",
    family: "solar",
    blurb:
      "Pale composite hull with light-blue emissive trim and deployable sail panels. The pulse-drive long-hauler of the stars.",
    hullBase: "#cfdde3",
    hullDark: "#4d6b7a",
    emissive: "#7ef0ff",
    emissiveHot: "#e6feff",
    trail: "#8fe9ff",
    environment: "space",
    flourishes: ["solar-sails", "hull-rim-glow"],
    prefers: ["clean", "slim", "warp-friendly", "pylon"],
    boost: ["wing", "habitation"],
  },
  {
    id: "exotic",
    label: "Exotic Royal",
    family: "exotic",
    blurb:
      "Chrome-and-ivory plating with a gold-lit fin and wing cluster. Exotic hardware - the showroom model.",
    hullBase: "#ded8c6",
    hullDark: "#6d6450",
    emissive: "#ffcf6e",
    emissiveHot: "#fff3cf",
    trail: "#ffd98a",
    environment: "hangar",
    flourishes: ["exotic-fin", "hull-rim-glow", "dorsal-towers"],
    prefers: ["bonus-part", "best-in-class", "exotic", "clean"],
    boost: ["reactor", "shield"],
  },
  {
    id: "pirate",
    label: "Pirate Raider",
    family: "pirate",
    blurb:
      "Rusted plating, welded spikes and burning orange trim. Salvaged from a pirate wreck and pointed at a convoy.",
    hullBase: "#6d3b2c",
    hullDark: "#241410",
    emissive: "#ff8a1f",
    emissiveHot: "#ffd9a0",
    trail: "#ff9a3c",
    environment: "space",
    flourishes: ["pirate-spikes", "hull-rim-glow", "blade-wings"],
    prefers: ["armour", "turreted", "ordnance", "gun", "heavy"],
    boost: ["weapon", "landing"],
  },
  {
    id: "organic",
    label: "Living Ship",
    family: "organic",
    blurb:
      "Grown rather than welded: violet carapace, glowing veins and a pulsing core. The void mother's own design.",
    hullBase: "#5b4a6b",
    hullDark: "#261b33",
    emissive: "#ff7ad9",
    emissiveHot: "#ffd6f4",
    trail: "#ff9ae4",
    environment: "space",
    flourishes: ["organic-veins", "hull-rim-glow"],
    prefers: ["bubble", "exotic", "slots", "corridor"],
    boost: ["habitation", "shield", "reactor"],
  },
  {
    id: "stealth",
    label: "Stealth Prototype",
    family: "stealth",
    blurb:
      "Matte black radar-absorbent plating with cool blue-white trim, twin tail fins instead of blades and a long glowing rim. Built for the X-Men's hangar.",
    hullBase: "#14181f",
    hullDark: "#05070a",
    emissive: "#5fb6ff",
    emissiveHot: "#dcefff",
    trail: "#79c2ff",
    environment: "space",
    flourishes: ["dorsal-towers", "hull-rim-glow"],
    prefers: ["stealth", "black", "wing", "diffuser"],
    boost: ["wing", "engine-main"],
  },
];

/**
 * Resolves a style id. Composite ids ("sentinel+exotic") are fused on the fly so
 * a URL, a saved build or a blueprint can name a hybrid hull directly.
 */
export function styleById(id: string | undefined, seed = 1): ShipStyle {
  if (!id) return SHIP_STYLES[0];
  const parts = id.split("+").filter(Boolean);
  if (parts.length > 1) return fuseStyles(parts, seed);
  return SHIP_STYLES.find((style) => style.id === id) ?? SHIP_STYLES[0];
}

export const familyLabel: Record<ShipFamily, string> = {
  corvette: "Corvette",
  sentinel: "Sentinel",
  solar: "Solar",
  exotic: "Exotic",
  pirate: "Pirate",
  organic: "Living",
  stealth: "Stealth",
};

/**
 * Fusion: take a primary style and blend in the traits of the others the player
 * selected. The hull colour and environment come from the primary; the glow,
 * trail and flourishes are mixed so a "Sentinel + Exotic" build really reads as
 * both.
 */
export function fuseStyles(ids: string[], seed = 1): ShipStyle {
  const styles = ids.map(styleById).filter(Boolean);
  if (styles.length === 0) return SHIP_STYLES[0];
  if (styles.length === 1) return styles[0];

  const [primary, ...rest] = styles;
  const flourishes = [...new Set([...primary.flourishes, ...rest.flatMap((s) => s.flourishes)])].slice(0, 4);
  const secondary = rest[Math.floor(seed) % rest.length] ?? rest[0];

  return {
    ...primary,
    id: `${styles.map((s) => s.id).join("+")}`,
    label: `Fused: ${primary.label} + ${secondary.label}`,
    blurb: `Fusion hull: ${primary.blurb} Blended with ${rest.map((s) => s.label).join(", ")} hardware.`,
    emissive: blendHex(primary.emissive, secondary.emissive, 0.35),
    emissiveHot: blendHex(primary.emissiveHot, secondary.emissiveHot, 0.35),
    trail: blendHex(primary.trail, secondary.trail, 0.3),
    flourishes: flourishes as FlourishId[],
    prefers: [...new Set([...primary.prefers, ...rest.flatMap((s) => s.prefers)])],
    boost: [...new Set([...primary.boost, ...rest.flatMap((s) => s.boost)])],
  };
}

function blendHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const mix = pa.map((channel, index) => Math.round(channel + (pb[index] - channel) * t));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** Hull paints in-game are per-ship; these let the preview switch finish quickly. */
export const HULL_PAINTS = SHIP_STYLES.map((style) => ({
  id: style.id,
  label: style.label,
  swatch: style.hullBase,
  emissive: style.emissive,
}));
