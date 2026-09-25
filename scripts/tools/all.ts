/**
 * Project every blueprint and write one JSON per ship, then render them to PNG.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/tools/all.ts [jsonDir] [trisPerPart]
 *   python3 scripts/tools/render-all.py [jsonDir] [pngDir]
 *
 * Each hand-drawn ship is shot from its own camera, so a TIE opens on the bow
 * (where its blade cross reads) and a Falcon from above (where its saucer does).
 */
import fs from "node:fs";
import path from "node:path";
import { blueprints } from "@/lib/data";
import { blueprintToRecipe } from "@/lib/blueprintLattice";
import { assembleCorvette } from "@/lib/lattice";
import { projectScene } from "@/lib/render3d";

const outdir = process.argv[2] ?? "scripts/out";
const tris = Number(process.argv[3] ?? 260);
fs.mkdirSync(outdir, { recursive: true });

for (const bp of blueprints) {
  const recipe = blueprintToRecipe(bp);
  const mesh = assembleCorvette(recipe, { maxTrisPerPart: tris })!;
  const scene = projectScene(mesh, recipe.view ?? { yaw: 0.6, pitch: -0.32, zoom: 1 }, 1100, 760, {
    padding: 1.08,
  });
  fs.writeFileSync(
    path.join(outdir, `${bp.slug}.json`),
    JSON.stringify({
      w: 1100,
      h: 760,
      slug: bp.slug,
      faces: scene.faces.map((f) => ({ p: f.points, c: f.fill, o: f.opacity })),
    }),
  );
  console.log(
    `${bp.slug.padEnd(24)} ${String(recipe.parts.length).padStart(3)} mod  ${mesh.parts.reduce((n, p) => n + p.faces.length, 0)} tris`,
  );
}
console.log(`\nJSON en ${outdir}`);
