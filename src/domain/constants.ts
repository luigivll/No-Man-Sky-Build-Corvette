import type { PartCategory } from "./types";

/** Hard engineering limits of the Corvette Workshop. */
export const BUILD_LIMITS = {
  /** Absolute maximum number of modules a single corvette can hold. */
  maxParts: 160,
  /** Recommended maximum vertical storeys before handling collapses. */
  maxFloors: 3,
  /** Recommended soft cap on deck area (module cells per storey). */
  softDeckArea: 24,
  /** Only one cockpit may exist per corvette. */
  maxCockpits: 1,
  /** Practical ceiling on the number of reactors that actually register. */
  effectiveReactors: 3,
} as const;

/** Minimum inventory required before the game lets you finalise a design. */
export const FLIGHT_MINIMUM: Readonly<Record<string, number>> = Object.freeze({
  cockpit: 1,
  habitation: 1,
  landingBay: 1,
  landingGear: 1,
  reactor: 1,
  thruster: 1,
  weapon: 1,
});

export const CATEGORY_META: Readonly<
  Record<PartCategory, { label: string; short: string; accent: string; blurb: string }>
> = {
  cockpit: {
    label: "Cockpits",
    short: "COK",
    accent: "#4ee1ff",
    blurb: "The bridge. Exactly one per corvette, always at the front.",
  },
  habitation: {
    label: "Habitation Modules",
    short: "HAB",
    accent: "#a98bff",
    blurb: "Pressurised decks. Each one adds +3 cargo slots.",
  },
  walkway: {
    label: "Access Modules",
    short: "WY",
    accent: "#7fd1ff",
    blurb: "Corridors and walkways. +1 cargo slot each.",
  },
  landingBay: {
    label: "Landing Bays",
    short: "BAY",
    accent: "#3ddc97",
    blurb: "The docking ramp. Required to board and finalise the hull.",
  },
  landingGear: {
    label: "Landing Gears",
    short: "LND",
    accent: "#ffb547",
    blurb: "Undercarriage. One works, two looks right.",
  },
  reactor: {
    label: "Reactors",
    short: "PWR",
    accent: "#ffd166",
    blurb: "Drives launch, pulse, defence and warp tech slots.",
  },
  thruster: {
    label: "Thrusters",
    short: "THR",
    accent: "#ff9f6e",
    blurb: "Sublight propulsion. More thrust, more speed.",
  },
  engine: {
    label: "Main Engines",
    short: "ENG",
    accent: "#ff6e9c",
    blurb: "Heavy boosters mounted behind the reactor.",
  },
  shield: {
    label: "Shield Generators",
    short: "SHD",
    accent: "#6ea8ff",
    blurb: "Deflector emitters that soak incoming fire.",
  },
  weapon: {
    label: "Weapon Systems",
    short: "WPN",
    accent: "#ff4d6d",
    blurb: "Turret arrays and cannons. At least one is mandatory.",
  },
  wing: {
    label: "Wings & Foils",
    short: "WNG",
    accent: "#4ee1ff",
    blurb: "Flight stabilisers: S-foils, aerofoils, fins and blades.",
  },
  plating: {
    label: "Hull Plating",
    short: "PLT",
    accent: "#9fb2cc",
    blurb: "Cowling, sidepods and armour that defines the silhouette.",
  },
  cargo: {
    label: "Cargo Attachments",
    short: "CRG",
    accent: "#c8a06a",
    blurb: "External tanks, pods and capsules.",
  },
  decoration: {
    label: "Structural Detail",
    short: "DEC",
    accent: "#8ea0b8",
    blurb: "Sensor masts, antennas and greebles.",
  },
} as const;

export const CATEGORY_ORDER: readonly PartCategory[] = [
  "cockpit",
  "habitation",
  "walkway",
  "landingBay",
  "landingGear",
  "reactor",
  "thruster",
  "engine",
  "shield",
  "weapon",
  "wing",
  "plating",
  "cargo",
  "decoration",
] as const;

/** One build unit is roughly 1.5 metres of hull in-game. */
export const UNIT_TO_METRES = 1.5;

export const TAG_META = {
  "combat-heavy": {
    label: "Combat Heavy",
    blurb: "Turrets, deflectors and armour plating everywhere.",
    accent: "#ff4d6d",
  },
  "sleek-explorer": {
    label: "Sleek Explorer",
    blurb: "Long nose, thin decks, aerofoils and big engines.",
    accent: "#4ee1ff",
  },
  gunship: {
    label: "Gunship",
    blurb: "Wide hull, dorsal turrets, heavy landing gear.",
    accent: "#ffb547",
  },
  "cargo-hauler": {
    label: "Cargo Hauler",
    blurb: "Stacked habitations, tanks and landing bays.",
    accent: "#c8a06a",
  },
  interceptor: {
    label: "Interceptor",
    blurb: "Minimal mass, maximum thrust and manoeuvrability.",
    accent: "#a98bff",
  },
  industrial: {
    label: "Industrial",
    blurb: "Exposed structure, cargo pods and utilitarian plating.",
    accent: "#3ddc97",
  },
} as const;

export const BASE_META = {
  sentinel: {
    label: "Sentinel Base",
    blurb: "Angular drone hulls, faceted plating, cold blue emissives.",
    accent: "#6ea8ff",
  },
  exotic: {
    label: "Exotic Base",
    blurb: "Squid-like organic curves, domes and asymmetric sails.",
    accent: "#a98bff",
  },
  normal: {
    label: "Normal Base",
    blurb: "Classic Titan / Ambassador / Thunderbird workshop geometry.",
    accent: "#9fb2cc",
  },
  hybrid: {
    label: "Hybrid Fusion",
    blurb: "Mixes every design language into one improbable machine.",
    accent: "#ffb547",
  },
} as const;

/**
 * Categories that may hang off a hardpoint. Everything else — habitation,
 * walkways, landing gear, docking bays, reactors — chains through module faces
 * only. Letting a habitation module snap to a wingtip hardpoint produces ships
 * that pass validation but look (and play) nothing like a corvette.
 */
export const HARDPOINT_CATEGORIES: readonly PartCategory[] = [
  "weapon",
  "thruster",
  "wing",
  "shield",
  "plating",
  "decoration",
  "cargo",
];
