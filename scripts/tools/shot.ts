/**
 * Dump one ship as projected 2D faces, for offline renders.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/tools/shot.ts <slug> [view] [out.json] [tris]
 *
 * `view` is hero (the ship's own camera), bow, plan, side or stern. W/H env vars
 * set the canvas. The output feeds scripts/tools/lat2png.py.
 */
import fs from "node:fs";
import { blueprints } from "@/lib/data";
import { blueprintToRecipe } from "@/lib/blueprintLattice";
import { assembleCorvette } from "@/lib/lattice";
import { projectScene, type ViewState } from "@/lib/render3d";

const [slug, viewName = "hero", outPath, trisArg] = process.argv.slice(2);
const bp = blueprints.find((b) => b.slug === slug);
if (!bp) throw new Error(`no blueprint ${slug}`);

const recipe = blueprintToRecipe(bp);
const mesh = assembleCorvette(recipe, { maxTrisPerPart: Number(trisArg ?? 0) })!;
const W = Number(process.env.W ?? 1100);
const H = Number(process.env.H ?? 760);

const VIEWS: Record<string, ViewState> = {
  bow: { yaw: 0, pitch: -0.08, zoom: 1 },
  plan: { yaw: 0, pitch: -1.4, zoom: 1 },
  side: { yaw: -Math.PI / 2, pitch: -0.06, zoom: 1 },
  stern: { yaw: Math.PI, pitch: -0.2, zoom: 1 },
};
const view = VIEWS[viewName] ?? recipe.view ?? { yaw: 0.6, pitch: -0.32, zoom: 1 };
const scene = projectScene(mesh, view, W, H, { padding: 1.08 });
const target = outPath ?? `/tmp/shot-${slug}-${viewName}.json`;
fs.writeFileSync(
  target,
  JSON.stringify({
    w: W,
    h: H,
    slug,
    view: viewName,
    faces: scene.faces.map((f) => ({ p: f.points, c: f.fill, o: f.opacity })),
  }),
);
console.log(
  `${slug} ${viewName}: ${recipe.parts.length} modules, ${mesh.parts.reduce((n, p) => n + p.faces.length, 0)} tris -> ${target}`,
);
