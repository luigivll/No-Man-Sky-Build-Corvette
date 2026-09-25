/**
 * Contact audit for the hand-drawn ships.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/tools/audit.ts [tol]
 *
 * Every module's world box must overlap at least one neighbour's on all three
 * axes by `tol` (default 0.10). Butt-joined spine modules touch at exactly 0.00
 * on z and are fine — what this catches is the other case: a cannon parked beside
 * a wing, a pod hovering over a hull, a strut that reaches for a surface and
 * misses. Those are the "floating module between the wings" defects, and this is
 * how they get caught without eyeballing 21 ships.
 */
import { blueprints } from "@/lib/data";
import { blueprintToRecipe } from "@/lib/blueprintLattice";
import { placedBox } from "@/lib/lattice";

const tol = Number(process.argv[2] ?? 0.1);
let bad = 0;

for (const bp of blueprints) {
  const recipe = blueprintToRecipe(bp);
  const boxes = recipe.parts.map((p) =>
    placedBox(p.assetId, p.pos, p.yaw ?? 0, p.mirror ?? false, p.scale ?? 1, p.roll ?? 0, p.stretchX ?? 1),
  );
  const orphans: string[] = [];
  const weak: string[] = [];
  boxes.forEach((b, i) => {
    if (!b) return;
    let best = -Infinity;
    boxes.forEach((c, j) => {
      if (!c || j === i) return;
      const m = Math.min(
        Math.min(b.max[0], c.max[0]) - Math.max(b.min[0], c.min[0]),
        Math.min(b.max[1], c.max[1]) - Math.max(b.min[1], c.min[1]),
        Math.min(b.max[2], c.max[2]) - Math.max(b.min[2], c.min[2]),
      );
      best = Math.max(best, m);
    });
    if (best < -tol) orphans.push(recipe.parts[i].assetId);
    else if (best < 0.02) weak.push(recipe.parts[i].assetId);
  });
  const missing = recipe.parts.filter((p) => !boxes.some((_, i) => recipe.parts[i] === p)).length;
  bad += orphans.length;
  console.log(
    `${bp.slug.padEnd(24)} ${String(recipe.parts.length).padStart(3)} mod  ` +
      (orphans.length ? `${orphans.length} HUERFANOS ${orphans.slice(0, 3).join(",")}` : "ok") +
      (weak.length ? `  (${weak.length} al ras)` : "") +
      (missing ? `  ${missing} sin asset` : ""),
  );
}
console.log(bad ? `\n${bad} modulos sin contacto` : "\nningun modulo huerfano");
