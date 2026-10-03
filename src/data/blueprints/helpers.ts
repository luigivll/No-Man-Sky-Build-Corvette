import type { Palette } from "@/domain/types";

/** Compact palette constructor so each hangar entry stays readable. */
export const pal = (
  name: string,
  primary: string,
  secondary: string,
  accent: string,
  trim: string,
  glass: string,
  emissive: string,
  wear = 0.25,
): Palette => ({ name, primary, secondary, accent, trim, glass, emissive, wear });

/** The default paint role used by the renderer for each part category. */
export const DEFAULT_ROLE = {
  cockpit: "primary",
  habitation: "primary",
  walkway: "primary",
  landingBay: "secondary",
  landingGear: "trim",
  reactor: "secondary",
  thruster: "trim",
  engine: "trim",
  shield: "trim",
  weapon: "trim",
  wing: "secondary",
  plating: "secondary",
  cargo: "secondary",
  decoration: "trim",
} as const;
