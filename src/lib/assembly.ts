import { buildShipMesh, type ModuleInstance, type ShipMesh } from "./render3d";
import { partById } from "./data";
import type { Build, PartCategoryId } from "./types";

/**
 * Assembly manual compiler.
 *
 * Turns a finished ship into the numbered sections of a Workshop assembly
 * booklet: which module goes on, in what order, bolted to which socket, and
 * where on the hull that socket sits. Every module in the build appears in
 * exactly one step, so a manual always ends with the complete ship.
 */

export interface ManualPlacement {
  key: string;
  partId: string;
  partName: string;
  category: PartCategoryId;
  /** where it bolts to, phrased the way the hull reads it */
  attach: string;
  /** coarse position: "forward third, port flank, deck level" */
  position: string;
  /** "1/4 offset" style hint used by the real Workshop guides */
  offset: string;
  mirrored: boolean;
  price: number;
  buyable: boolean;
}

export interface ManualStep {
  id: string;
  /** 1-based "step 3 of 5" inside the section */
  index: number;
  of: number;
  sectionId: SectionId;
  title: string;
  body: string[];
  placements: ManualPlacement[];
  /** every key installed up to and including this step, in build order */
  cumulative: string[];
  stepCost: number;
}

export interface ManualSection {
  id: SectionId;
  index: number;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  steps: ManualStep[];
  /** the section's final state: what the ship looks like once it is done */
  completed: string[];
}

export type SectionId =
  | "gear"
  | "reactor"
  | "habitation"
  | "access"
  | "cockpit"
  | "engines"
  | "wings"
  | "weapons";

interface SectionDef {
  id: SectionId;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  categories: PartCategoryId[];
}

/**
 * The order the Workshop actually wants: gear first so the hull has something
 * to stand on, then the core systems, then engines and finally the sharp bits.
 */
export const SECTION_DEFS: SectionDef[] = [
  {
    id: "gear",
    title: "Landing gear",
    subtitle: "Plant the legs first - everything else is built on top of them",
    icon: "Anchor",
    accent: "#a855f7",
    categories: ["landing"],
  },
  {
    id: "reactor",
    title: "Reactor core",
    subtitle: "Drop the reactor into the dorsal cradle and lock the housing",
    icon: "Atom",
    accent: "#22d3ee",
    categories: ["reactor"],
  },
  {
    id: "habitation",
    title: "Habitation deck",
    subtitle: "Habs and walkways - the liveaboard volume of the hull",
    icon: "Layers",
    accent: "#38bdf8",
    categories: ["habitation"],
  },
  {
    id: "access",
    title: "Access bay",
    subtitle: "Landing bay on the underside; this is the Workshop requirement",
    icon: "DoorOpen",
    accent: "#f59e0b",
    categories: ["access"],
  },
  {
    id: "cockpit",
    title: "Cockpit",
    subtitle: "Bolt the bridge onto the fore socket and align the canopy",
    icon: "Radar",
    accent: "#67e8f9",
    categories: ["cockpit"],
  },
  {
    id: "engines",
    title: "Propulsion",
    subtitle: "Main boosters on the stern grid, thrusters on the flank pods",
    icon: "Rocket",
    accent: "#fb923c",
    categories: ["engine-main", "engine-light"],
  },
  {
    id: "wings",
    title: "Wings & plating",
    subtitle: "Flight stabilisers on the flank mounts, plating over the frame",
    icon: "Feather",
    accent: "#a78bfa",
    categories: ["wing"],
  },
  {
    id: "weapons",
    title: "Weapons & shields",
    subtitle: "Guns ride the wing hardpoints; shields close the loop",
    icon: "Crosshair",
    accent: "#f43f5e",
    categories: ["weapon", "shield"],
  },
];

export interface AssemblyManual {
  sections: ManualSection[];
  steps: ManualStep[];
  moduleCount: number;
  /** modules the sequence failed to cover - must always be empty */
  uncovered: string[];
  mesh: ShipMesh;
  totalCost: number;
}

const CATEGORY_LABEL: Record<PartCategoryId, string> = {
  cockpit: "cockpit",
  reactor: "reactor",
  habitation: "habitation module",
  access: "access module",
  wing: "flight stabiliser",
  weapon: "weapon system",
  shield: "shield generator",
  "engine-main": "main engine",
  "engine-light": "thruster",
  landing: "landing gear",
};

function ordinal(n: number): string {
  return ["nose", "forward", "midships", "aft", "stern"][Math.max(0, Math.min(4, n))];
}

/** Reads a ship-space anchor the way a manual would describe it. */
function describePosition(
  anchor: readonly number[],
  bounds: { min: readonly number[]; max: readonly number[] },
): { position: string; offset: string } {
  const spanZ = Math.max(0.001, bounds.max[2] - bounds.min[2]);
  const spanX = Math.max(0.001, bounds.max[0] - bounds.min[0]);
  const spanY = Math.max(0.001, bounds.max[1] - bounds.min[1]);
  // -Z is the nose, so invert: long fraction = further aft
  const along = 1 - (anchor[2] - bounds.min[2]) / spanZ;
  const quarter = Math.max(0, Math.min(4, Math.round(along * 4)));
  const lateral = (anchor[0] - (bounds.min[0] + bounds.max[0]) / 2) / (spanX / 2);
  const side = Math.abs(lateral) < 0.14 ? "centreline" : lateral > 0 ? "starboard flank" : "port flank";
  const vertical = (anchor[1] - (bounds.min[1] + bounds.max[1]) / 2) / (spanY / 2);
  const level = vertical > 0.25 ? "dorsal deck" : vertical < -0.25 ? "ventral mount" : "deck level";
  const fractions = ["1/4", "2/4", "3/4", "4/4"];
  const shift = quarter === 0 ? "full forward (0 offset)" : `${fractions[Math.min(3, quarter - 1)]} offset aft`;
  return {
    position: `${ordinal(quarter)} section, ${side}, ${level}`,
    offset: shift,
  };
}

const SOCKET_PHRASE: Record<string, string> = {
  fore: "the nose socket",
  aft: "the stern engine grid",
  top: "the dorsal cradle",
  bottom: "a ventral hardpoint",
  sideL: "the port flank mount",
  sideR: "the starboard flank mount",
  hardpoint: "a hardpoint",
  mount: "the deck mount",
  root: "the flank root",
};

/** Hull sockets are named "hull-<kind>-<n>"; wing sockets "hardpoint-<n>". */
function socketKind(id: string): string {
  if (id.startsWith("hull-")) {
    const parts = id.split("-");
    return parts.length >= 3 ? parts.slice(1, -1).join("-") : "mount";
  }
  if (id.startsWith("hardpoint")) return "hardpoint";
  return id;
}

function attachLine(instance: ModuleInstance): string {
  if (instance.parent === "hull") {
    const kind = socketKind(instance.socket);
    return `Bolt it to ${SOCKET_PHRASE[kind] ?? "the hull mount"}.`;
  }
  const parent = partById[instance.parent];
  const label = parent ? parent.name : instance.parent.replace(/-/g, " ");
  if (instance.socket.startsWith("hardpoint")) {
    return `Slide it onto the ${label} hardpoint - no extra pylon needed.`;
  }
  return `Mate it to the ${label} (${instance.socket} socket).`;
}

export function compileManual(
  build: Build,
  options: { style?: string } = {},
): AssemblyManual {
  const mesh = buildShipMesh(build, options);
  const bounds = mesh.bounds;
  const modules = mesh.modules;

  // group modules by section category, keeping build order inside each group
  const groups = new Map<SectionId, ModuleInstance[]>();
  for (const def of SECTION_DEFS) groups.set(def.id, []);
  for (const instance of modules) {
    const def = SECTION_DEFS.find((d) => d.categories.includes(instance.category));
    if (def) groups.get(def.id)?.push(instance);
  }

  const steps: ManualStep[] = [];
  const sections: ManualSection[] = [];
  const placed: string[] = [];
  let stepSeq = 0;

  for (const def of SECTION_DEFS) {
    const list = groups.get(def.id) ?? [];
    if (list.length === 0) continue;

    // pack mirrored pairs into a single step, everything else one per step
    const chunks: ModuleInstance[][] = [];
    for (let i = 0; i < list.length; i += 1) {
      const current = list[i];
      const next = list[i + 1];
      if (next && next.partId === current.partId) {
        chunks.push([current, next]);
        i += 1;
      } else {
        chunks.push([current]);
      }
    }

    const sectionSteps: ManualStep[] = [];
    chunks.forEach((chunk, chunkIndex) => {
      const placements = chunk.map((instance) => {
        const geo = describePosition(instance.anchor, bounds);
        const part = partById[instance.partId];
        return {
          key: instance.key,
          partId: instance.partId,
          partName: instance.partName,
          category: instance.category,
          attach: attachLine(instance),
          position: geo.position,
          offset: geo.offset,
          mirrored: chunk.length > 1,
          price: part?.price ?? 0,
          buyable: part?.buyable ?? false,
        } satisfies ManualPlacement;
      });

      const first = chunk[0];
      const count = chunk.length;
      const part = partById[first.partId];
      const mirrored = count > 1;
      const title = mirrored
        ? `Install ${count} x ${first.partName} (mirrored pair)`
        : `Install the ${first.partName}`;
      const sameAttachment = placements.every((p) => p.attach === placements[0].attach);
      const body: string[] = [];
      if (mirrored && sameAttachment) {
        body.push(placements[0].attach.replace("Bolt it", "Bolt both units"));
      } else {
        placements.forEach((p, i) => {
          body.push(mirrored ? `Unit ${i + 1}: ${p.attach}` : p.attach);
        });
      }
      body.push(
        mirrored
          ? `Bracket positions: ${placements.map((p) => p.position).join(" / ")} - ${placements[0].offset}. Mirror the second unit across the centreline.`
          : `Bracket position: ${placements[0].position} - ${placements[0].offset}.`,
      );
      if (part && !part.buyable) {
        body.push("Salvage-only module: no Workshop vendor sells this one.");
      }
      if (def.id === "gear" && chunkIndex === 0) {
        body.push("Place landing gear before anything else - the Workshop judges the hull from the pads up.");
      }
      if (def.id === "habitation") {
        body.push(`Habitation adds +3 inventory slots (walkways +1). Hull slot total after this section is checked at the end.`);
      }

      chunk.forEach((instance) => placed.push(instance.key));
      stepSeq += 1;
      sectionSteps.push({
        id: `step-${stepSeq}`,
        index: chunkIndex + 1,
        of: chunks.length,
        sectionId: def.id,
        title,
        body,
        placements,
        cumulative: [...placed],
        stepCost: placements.reduce((sum, p) => sum + p.price, 0),
      });
    });

    sectionSteps.forEach((step) => steps.push(step));
    sections.push({
      ...def,
      index: sections.length + 1,
      steps: sectionSteps,
      completed: [...placed],
    });
  }

  const covered = new Set(steps.flatMap((step) => step.placements.map((p) => p.key)));
  const uncovered = modules.filter((instance) => !covered.has(instance.key)).map((instance) => instance.key);

  return {
    sections,
    steps,
    moduleCount: modules.length,
    uncovered,
    mesh,
    totalCost: steps.reduce((sum, step) => sum + step.stepCost, 0),
  };
}

/** The step that installs a given module, for deep links like /assembly?step=12. */
export function stepIndexForKey(manual: AssemblyManual, key: string): number {
  return manual.steps.findIndex((step) => step.placements.some((p) => p.key === key));
}
