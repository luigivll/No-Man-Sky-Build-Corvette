import type { Blueprint, BlueprintGroup } from "@/domain/types";
import { STAR_WARS } from "./star-wars";
import { MARVEL } from "./marvel";
import { DC } from "./dc";
import { CLASSIC_SCIFI } from "./classic-scifi";
import { ANIME } from "./anime";
import { VIDEOGAMES } from "./videogames";

/**
 * The Badass Hangar — 50 pop-culture blueprints, each pre-assembled from real
 * Corvette Workshop modules with a paint scheme tuned to match.
 */
export const BLUEPRINTS: readonly Blueprint[] = [
  ...STAR_WARS,
  ...MARVEL,
  ...DC,
  ...CLASSIC_SCIFI,
  ...ANIME,
  ...VIDEOGAMES,
];

export const BLUEPRINT_BY_ID: ReadonlyMap<string, Blueprint> = new Map(
  BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint]),
);

export const getBlueprint = (id: string): Blueprint => {
  const blueprint = BLUEPRINT_BY_ID.get(id);
  if (!blueprint) throw new Error(`Unknown blueprint id: "${id}"`);
  return blueprint;
};

export const blueprintsByGroup = (group: BlueprintGroup): Blueprint[] =>
  BLUEPRINTS.filter((blueprint) => blueprint.group === group);

export const GROUP_LABELS: Record<BlueprintGroup, string> = {
  "star-wars": "Star Wars & The Mandalorian",
  marvel: "Marvel Comics & MCU",
  dc: "DC Comics",
  "classic-scifi": "Classic Sci-Fi, Film & TV",
  anime: "Anime & Animation",
  videogames: "Video Games",
};

export const BLUEPRINT_COUNT = BLUEPRINTS.length;

export { STAR_WARS, MARVEL, DC, CLASSIC_SCIFI, ANIME, VIDEOGAMES };
