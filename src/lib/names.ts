import type { RoleId } from "./types";

export type Rng = () => number;

/** Small deterministic PRNG so a seed always reproduces the same Corvette. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, list: T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

export function pickWeighted<T>(
  rng: Rng,
  list: T[],
  weightOf: (item: T) => number,
): T {
  const weights = list.map((item) => Math.max(0.0001, weightOf(item)));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < list.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return list[i];
  }
  return list[list.length - 1];
}

export function intBetween(rng: Rng, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function shuffle<T>(rng: Rng, list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const FIRST_WORDS = [
  "The Void",
  "The Iron",
  "The Crimson",
  "The Ashen",
  "The Gilded",
  "The Hollow",
  "The Ebon",
  "The Sunless",
  "The Last",
  "The Quiet",
];

const NOUNS = [
  "Leviathan",
  "Reaver",
  "Seraph",
  "Warden",
  "Nomad",
  "Halcyon",
  "Tempest",
  "Bastion",
  "Vagrant",
  "Spectre",
  "Harbinger",
  "Nightjar",
  "Kestrel",
  "Obsidian",
  "Solstice",
  "Cinder",
  "Aurora",
  "Bulwark",
  "Rook",
  "Corsair",
  "Vigil",
  "Praxis",
];

const SUFFIXES = [
  "of the Deep",
  "of the Rim",
  "of the Ninth Fleet",
  "Mark VII",
  "Incarnate",
  "Protocol",
  "Ascendant",
  "Unbound",
];

const PREFIX_CODES = ["ISV", "SSV", "MSV", "HSV", "NCV", "GX"];

const ROLE_EPITHETS: Record<RoleId, string[]> = {
  combat: ["Warhammer", "Lance", "Vengeance", "Redline", "Fury"],
  exploration: ["Pilgrim", "Wayfarer", "Longshot", "Meridian", "Cartographer"],
  massive: ["Colossus", "Foundry", "Monolith", "Bastion", "Anvil"],
  minimalist: ["Dart", "Shrike", "Sliver", "Needle", "Wisp"],
};

function code(rng: Rng): string {
  const letters = "ABCDEFGHJKLMNPRSTVXZ";
  const l = letters[Math.floor(rng() * letters.length)];
  const digits = Math.floor(rng() * 9000 + 1000);
  return `${l}-${digits}`;
}

export function generateShipName(rng: Rng, roles: RoleId[] = []): string {
  const noun =
    roles.length > 0 && rng() < 0.45
      ? pick(rng, ROLE_EPITHETS[roles[Math.floor(rng() * roles.length)]])
      : pick(rng, NOUNS);
  const style = rng();
  if (style < 0.34) {
    return `${pick(rng, FIRST_WORDS)} ${noun}`;
  }
  if (style < 0.6) {
    return `${pick(rng, PREFIX_CODES)} ${noun} ${code(rng)}`;
  }
  if (style < 0.82) {
    return `The ${noun} ${pick(rng, SUFFIXES)}`;
  }
  return `${noun}-Class ${pick(rng, ["Corsair", "Runner", "Gunship", "Freighter", "Interceptor"])}`;
}

export const ROLE_DESIGNATIONS: Record<RoleId, string[]> = {
  combat: [
    "Gunship Configuration",
    "Assault Loadout",
    "Strike Package",
    "Line Breaker",
  ],
  exploration: [
    "Long-Range Survey Rig",
    "Deep-Space Explorer",
    "Pilgrim Configuration",
    "Cartography Platform",
  ],
  massive: [
    "Freighter-Lite Platform",
    "Heavy Hull Configuration",
    "Titan Chassis",
    "Mobile Base",
  ],
  minimalist: [
    "Skeleton Frame",
    "Featherweight Fit-Out",
    "Courier Trim",
    "Bare Hull",
  ],
};

export function generateDesignation(rng: Rng, roles: RoleId[]): string {
  if (roles.length === 0) return "Custom Configuration";
  return pick(rng, ROLE_DESIGNATIONS[roles[Math.floor(rng() * roles.length)]]);
}
