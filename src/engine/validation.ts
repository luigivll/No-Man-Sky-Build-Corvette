import type {
  AssemblyResult,
  PartCategory,
  ValidationIssue,
  ValidationResult,
} from "@/domain/types";
import { FLIGHT_CRITICAL } from "@/domain/types";
import { BUILD_LIMITS, CATEGORY_META, FLIGHT_MINIMUM } from "@/domain/constants";

/**
 * Rules engine.
 *
 * Everything the Corvette Workshop refuses to finalise is expressed here as an
 * `error`; everything that flies but flies badly is a `warning`.
 */
export function validate(result: AssemblyResult): ValidationResult {
  const issues: ValidationIssue[] = [];
  const counts: Partial<Record<PartCategory, number>> = {};

  for (const part of result.parts) {
    counts[part.part.category] = (counts[part.part.category] ?? 0) + 1;
  }

  if (result.parts.length === 0) {
    issues.push({
      level: "error",
      code: "empty",
      message: "The bay is empty. Place a landing gear to start the hull.",
    });
    return { flyable: false, issues, missing: [...FLIGHT_CRITICAL], counts };
  }

  const missing: PartCategory[] = [];
  for (const category of FLIGHT_CRITICAL) {
    // The workshop accepts either a light thruster or a main engine as the
    // propulsion requirement — both are "engines" to the finalise check.
    const have =
      category === "thruster"
        ? (counts.thruster ?? 0) + (counts.engine ?? 0)
        : (counts[category] ?? 0);
    const required = FLIGHT_MINIMUM[category] ?? 1;
    if (have < required) {
      missing.push(category);
      issues.push({
        level: "error",
        code: `missing-${category}`,
        message:
          category === "thruster"
            ? "Missing propulsion — at least one thruster or main engine is required to finalise."
            : `Missing ${CATEGORY_META[category].label.replace(/s$/, "")} — at least ${required} required to finalise.`,
      });
    }
  }

  const cockpits = counts.cockpit ?? 0;
  if (cockpits > BUILD_LIMITS.maxCockpits) {
    issues.push({
      level: "error",
      code: "too-many-cockpits",
      message: `A corvette can only carry one cockpit (found ${cockpits}).`,
      placementIds: result.parts
        .filter((part) => part.part.category === "cockpit")
        .slice(1)
        .map((part) => part.placement.id),
    });
  }

  if (result.parts.length > BUILD_LIMITS.maxParts) {
    issues.push({
      level: "error",
      code: "over-part-limit",
      message: `${result.parts.length} parts exceeds the hard limit of ${BUILD_LIMITS.maxParts}.`,
    });
  }

  if (result.orphans.length > 0) {
    issues.push({
      level: "error",
      code: "detached-parts",
      message: `${result.orphans.length} part${result.orphans.length === 1 ? "" : "s"} are not attached to the hull.`,
      placementIds: result.orphans,
    });
  }

  if (result.unresolved.length > 0) {
    issues.push({
      level: "error",
      code: "unresolved-parts",
      message: `${result.unresolved.length} part${result.unresolved.length === 1 ? "" : "s"} reference an unknown module or snap node.`,
      placementIds: result.unresolved,
    });
  }

  if (result.stats.floors > BUILD_LIMITS.maxFloors) {
    issues.push({
      level: "warning",
      code: "too-tall",
      message: `${result.stats.floors} storeys exceeds the recommended maximum of ${BUILD_LIMITS.maxFloors} — handling will suffer and you will need ladders.`,
    });
  }

  if (result.collisions.length > 0) {
    issues.push({
      level: "warning",
      code: "intersections",
      message: `${result.collisions.length} module${result.collisions.length === 1 ? "" : "s"} intersect another part. The game will still finalise it, but the hull will clip.`,
      placementIds: [...new Set(result.collisions.flatMap((pair) => [pair.a, pair.b]))],
    });
  }

  if (result.stats.powerDraw > result.stats.powerSupply && result.stats.powerSupply > 0) {
    issues.push({
      level: "warning",
      code: "power-deficit",
      message: `Systems draw ${Math.round(result.stats.powerDraw)} against ${Math.round(result.stats.powerSupply)} supplied. Add another reactor.`,
    });
  }

  const reactors = counts.reactor ?? 0;
  if (reactors > BUILD_LIMITS.effectiveReactors) {
    issues.push({
      level: "info",
      code: "extra-reactors",
      message: `Only the first ${BUILD_LIMITS.effectiveReactors} reactors register in the technology slots.`,
    });
  }

  const gears = counts.landingGear ?? 0;
  if (gears === 1) {
    issues.push({
      level: "info",
      code: "single-gear",
      message: "One landing gear works, but two keeps the hull level on uneven ground.",
    });
  }

  if (result.parts.length > 0 && result.parts.length < 8) {
    issues.push({
      level: "info",
      code: "minimal-hull",
      message: "This is a very small corvette. Add habitation modules for more cargo slots.",
    });
  }

  const flyable = !issues.some((issue) => issue.level === "error");
  return { flyable, issues, missing, counts };
}

export const hasErrors = (result: ValidationResult): boolean =>
  result.issues.some((issue) => issue.level === "error");

export const errorsOnly = (result: ValidationResult): ValidationIssue[] =>
  result.issues.filter((issue) => issue.level === "error");

export const warningsOnly = (result: ValidationResult): ValidationIssue[] =>
  result.issues.filter((issue) => issue.level === "warning");
