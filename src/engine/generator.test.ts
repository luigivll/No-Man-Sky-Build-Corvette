import { describe, expect, it } from "vitest";
import { generate, mulberry32, randomSeed } from "./generator";
import { assemble } from "./assembly";
import { validate } from "./validation";
import { DEFAULT_PALETTE } from "@/domain/palettes";
import { BUILD_LIMITS } from "@/domain/constants";
import type { DesignBase, DesignTag, GeneratorOptions } from "@/domain/types";

const TAGS: DesignTag[] = [
  "combat-heavy",
  "sleek-explorer",
  "gunship",
  "cargo-hauler",
  "interceptor",
  "industrial",
];
const BASES: DesignBase[] = ["sentinel", "exotic", "normal", "hybrid"];

const options = (tag: DesignTag, base: DesignBase, seed = 1234, complexity = 40): GeneratorOptions => ({
  tag,
  base,
  seed,
  complexity,
  symmetrical: true,
  palette: DEFAULT_PALETTE,
});

describe("fusion generator", () => {
  it("is deterministic for a given seed", () => {
    const a = generate(options("combat-heavy", "sentinel", 999));
    const b = generate(options("combat-heavy", "sentinel", 999));
    expect(a.placements.map((p) => p.partId)).toEqual(b.placements.map((p) => p.partId));
    expect(a.placements.map((p) => p.node)).toEqual(b.placements.map((p) => p.node));
  });

  it("produces different hulls for different seeds", () => {
    const a = generate(options("combat-heavy", "sentinel", 1)).placements.map((p) => p.partId).join(",");
    const b = generate(options("combat-heavy", "sentinel", 2)).placements.map((p) => p.partId).join(",");
    expect(a).not.toBe(b);
  });

  it("generates a flyable corvette for every tag/base combination", () => {
    const failures: string[] = [];
    for (const tag of TAGS) {
      for (const base of BASES) {
        for (const seed of [7, 4242, 90210]) {
          const result = generate(options(tag, base, seed));
          const assembly = assemble({
            version: 1,
            name: "gen",
            palette: DEFAULT_PALETTE,
            placements: result.placements,
          });
          const verdict = validate(assembly);
          if (!verdict.flyable) {
            failures.push(
              `${tag}/${base}/${seed}: ${verdict.issues
                .filter((issue) => issue.level === "error")
                .map((issue) => issue.message)
                .join(" | ")}`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("never breaks the 160-module cap", () => {
    for (const seed of [1, 5, 11, 23, 77]) {
      const result = generate(options("cargo-hauler", "hybrid", seed, BUILD_LIMITS.maxParts + 40));
      expect(result.placements.length).toBeLessThanOrEqual(BUILD_LIMITS.maxParts);
      const assembly = assemble({
        version: 1,
        name: "gen",
        palette: DEFAULT_PALETTE,
        placements: result.placements,
      });
      expect(assembly.orphans).toEqual([]);
      expect(assembly.unresolved).toEqual([]);
    }
  });

  it("keeps the hull inside the recommended storey count", () => {
    for (const seed of [3, 33, 333]) {
      const result = generate(options("cargo-hauler", "normal", seed, 120));
      const assembly = assemble({
        version: 1,
        name: "gen",
        palette: DEFAULT_PALETTE,
        placements: result.placements,
      });
      expect(assembly.stats.floors).toBeLessThanOrEqual(BUILD_LIMITS.maxFloors);
    }
  });

  it("grows towards the requested complexity", () => {
    const small = generate(options("gunship", "normal", 5, 16));
    const large = generate(options("gunship", "normal", 5, 90));
    expect(large.placements.length).toBeGreaterThan(small.placements.length);
    expect(small.placements.length).toBeGreaterThanOrEqual(10);
  });

  it("always contains exactly one cockpit", () => {
    for (const tag of TAGS) {
      const result = generate(options(tag, "hybrid", 808));
      const cockpits = result.placements.filter((placement) => placement.partId.includes("cockpit"));
      expect(cockpits).toHaveLength(1);
    }
  });

  it("mirrors flank-mounted hardware when symmetry is on", () => {
    const result = generate({ ...options("sleek-explorer", "arcadia" as unknown as DesignBase, 2024), base: "exotic" });
    const wings = result.placements.filter((placement) => placement.node === "hp-port" || placement.node === "hp-starboard");
    const port = wings.filter((placement) => placement.node === "hp-port").length;
    const starboard = wings.filter((placement) => placement.node === "hp-starboard").length;
    expect(Math.abs(port - starboard)).toBeLessThanOrEqual(1);
  });

  it("exposes a well-behaved seeded PRNG", () => {
    const rng = mulberry32(42);
    const values = Array.from({ length: 500 }, () => rng());
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(values.map((value) => Math.floor(value * 10))).size).toBeGreaterThan(5);
    expect(mulberry32(42)()).toBe(mulberry32(42)());
  });

  it("returns a shareable random seed", () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });
});
