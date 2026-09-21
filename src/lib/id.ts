/** Deterministic + random id helpers. */

let counter = 0;

/** Monotonic, collision-free within a session. */
export function createId(prefix = "p"): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function resetIdCounter(): void {
  counter = 0;
}

/** Stable id derived from a blueprint key — keeps exports diff-friendly. */
export function stableId(...parts: readonly string[]): string {
  return parts.join("·");
}
