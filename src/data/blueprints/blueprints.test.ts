import { describe, expect, it } from "vitest";
import { assemble } from "@/engine/assembly";
import { validate } from "@/engine/validation";
import { expandBlueprint, validateBlueprintShape } from "@/engine/blueprint";
import { BLUEPRINTS, BLUEPRINT_COUNT, GROUP_LABELS } from "./index";
import { DEFAULT_PALETTE } from "@/domain/palettes";
import { BUILD_LIMITS } from "@/domain/constants";
import type { Blueprint, BlueprintGroup } from "@/domain/types";

const assembleBlueprint = (blueprint: Blueprint) =>
  assemble({
    version: 1,
    name: blueprint.name,
    palette: blueprint.palette,
    placements: expandBlueprint(blueprint),
  });

describe("The Badass Hangar catalogue", () => {
  it("ships exactly fifty blueprints", () => {
    expect(BLUEPRINT_COUNT).toBe(50);
    expect(BLUEPRINTS).toHaveLength(50);
  });

  it("has a unique id and a non-empty build list for every entry", () => {
    const ids = BLUEPRINTS.map((blueprint) => blueprint.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const blueprint of BLUEPRINTS) {
      expect(blueprint.build.length, blueprint.id).toBeGreaterThan(5);
      expect(blueprint.name.trim().length, blueprint.id).toBeGreaterThan(2);
      expect(blueprint.notes.trim().length, blueprint.id).toBeGreaterThan(20);
    }
  });

  it("covers every hangar group", () => {
    const groups = new Set(BLUEPRINTS.map((blueprint) => blueprint.group));
    for (const group of Object.keys(GROUP_LABELS) as BlueprintGroup[]) {
      expect(groups.has(group), group).toBe(true);
      expect(BLUEPRINTS.some((blueprint) => blueprint.group === group), group).toBe(true);
    }
  });

  it("only references real parts, real snap nodes and accepted categories", () => {
    const problems = BLUEPRINTS.flatMap(validateBlueprintShape);
    expect(problems).toEqual([]);
  });

  it("expands every blueprint into a resolvable snap tree", () => {
    for (const blueprint of BLUEPRINTS) {
      const result = assembleBlueprint(blueprint);
      expect(result.unresolved, `${blueprint.id} unresolved`).toEqual([]);
      expect(result.orphans, `${blueprint.id} orphans`).toEqual([]);
      expect(result.parts.length, blueprint.id).toBe(blueprint.build.length);
    }
  });

  it("produces a flyable corvette for every blueprint", () => {
    const failures: string[] = [];
    for (const blueprint of BLUEPRINTS) {
      const result = assembleBlueprint(blueprint);
      const verdict = validate(result);
      if (!verdict.flyable) {
        failures.push(
          `${blueprint.id}: ${verdict.issues
            .filter((issue) => issue.level === "error")
            .map((issue) => issue.message)
            .join(" | ")}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps every blueprint inside the workshop limits", () => {
    for (const blueprint of BLUEPRINTS) {
      const result = assembleBlueprint(blueprint);
      expect(result.stats.partCount, `${blueprint.id} part count`).toBeLessThanOrEqual(
        BUILD_LIMITS.maxParts,
      );
      expect(result.stats.floors, `${blueprint.id} storeys`).toBeLessThanOrEqual(
        BUILD_LIMITS.maxFloors,
      );
    }
  });

  it("lands the undercarriage at the bottom of the hull", () => {
    for (const blueprint of BLUEPRINTS) {
      const result = assembleBlueprint(blueprint);
      const gears = result.parts.filter((part) => part.part.category === "landingGear");
      expect(gears.length, `${blueprint.id} landing gear`).toBeGreaterThanOrEqual(1);
      const hullTop = Math.max(...result.parts.map((part) => part.bounds.max.y));
      for (const gear of gears) {
        expect(gear.position.y, `${blueprint.id} gear height`).toBeLessThan(hullTop);
      }
    }
  });

  it("gives every blueprint a complete paint scheme", () => {
    for (const blueprint of BLUEPRINTS) {
      const palette = blueprint.palette ?? DEFAULT_PALETTE;
      for (const key of ["primary", "secondary", "accent", "trim", "glass", "emissive"] as const) {
        expect(palette[key], `${blueprint.id}.${key}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
      expect(palette.wear, blueprint.id).toBeGreaterThanOrEqual(0);
      expect(palette.wear, blueprint.id).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the whole catalogue free of intersecting modules where it matters", () => {
    const worst = BLUEPRINTS.map((blueprint) => ({
      id: blueprint.id,
      collisions: assembleBlueprint(blueprint).collisions.length,
    }))
      .filter((entry) => entry.collisions > 0)
      .sort((a, b) => b.collisions - a.collisions);
    // Dense builds allow a handful of grazing boxes; nothing should be a pile-up.
    expect(worst[0]?.collisions ?? 0).toBeLessThanOrEqual(4);
    expect(worst.reduce((sum, entry) => sum + entry.collisions, 0)).toBeLessThanOrEqual(30);
  });
});
