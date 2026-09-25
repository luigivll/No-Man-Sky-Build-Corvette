/**
 * Smoke test: run exactly what the pages run, for every blueprint.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/tools/smoke.ts
 *
 * This is the check that answers "is it all working": compile every blueprint to
 * a recipe, assemble it from the real mesh pack the way /lattice does, project it
 * the way the viewer does, and assert the things a user would notice — the ship
 * has geometry, it fits a sane envelope, the budget keeps the DOM fed, every part
 * maps to a real asset, and no ship is missing its engine trails.
 */
import { blueprints, parts as catalogue } from "@/lib/data";
import { blueprintToRecipe } from "@/lib/blueprintLattice";
import { assembleCorvette } from "@/lib/lattice";
import { packSync } from "@/lib/realMeshes";
import { projectScene } from "@/lib/render3d";
import { heroBudget } from "@/lib/lattice";

const pack = packSync();
if (!pack) throw new Error("mesh pack missing — public/models/corvette.bin");
console.log(`pack: ${pack.parts.length} assets\n`);

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) {
    failures++;
    console.log(`  FALLO ${label} ${detail}`);
  }
  return ok;
};

for (const bp of blueprints) {
  const recipe = blueprintToRecipe(bp);
  const mesh = assembleCorvette(recipe, { maxTrisPerPart: heroBudget(recipe.parts.length) })!;
  const tris = mesh.parts.reduce((n, p) => n + p.faces.length, 0);
  const w = mesh.bounds.max[0] - mesh.bounds.min[0];
  const h = mesh.bounds.max[1] - mesh.bounds.min[1];
  const l = mesh.bounds.max[2] - mesh.bounds.min[2];

  const scene = projectScene(mesh, recipe.view ?? { yaw: 0.6, pitch: -0.32, zoom: 1 }, 900, 640, {});
  const missingAssets = recipe.parts.filter((p) => !pack.byId.has(p.assetId)).map((p) => p.assetId);

  check(mesh.parts.length === recipe.parts.length, `${bp.slug} piezas`, `${mesh.parts.length}/${recipe.parts.length}`);
  check(missingAssets.length === 0, `${bp.slug} assets`, missingAssets.join(","));
  check(tris > 0 && tris <= 32000, `${bp.slug} tris`, String(tris));
  check(l > 0.8 && l < 40 && w > 0.8 && w < 40 && h > 0.2 && h < 20, `${bp.slug} envolvente`, `${l.toFixed(1)}x${w.toFixed(1)}x${h.toFixed(1)}`);
  check(scene.faces.length > 0 && scene.faces.every((f) => f.points.length > 0), `${bp.slug} proyeccion`);
  check(mesh.plumes.length > 0, `${bp.slug} estelas`, String(mesh.plumes.length));
  check(
    Object.values(mesh.bounds.min).every(Number.isFinite) && Object.values(mesh.bounds.max).every(Number.isFinite),
    `${bp.slug} bounds`,
  );

  console.log(
    `${bp.slug.padEnd(24)} ${String(recipe.parts.length).padStart(3)} mod  ${String(tris).padStart(6)} tris  ` +
      `${l.toFixed(1).padStart(5)}x${w.toFixed(1).padStart(5)}  plumas ${mesh.plumes.length}  poligonos ${scene.faces.length}`,
  );
}

// the catalogue has to be complete, or the shopping list lies to the player
const badAssets = catalogue.filter((p) => !p.assetId || !pack.byId.has(p.assetId));
check(badAssets.length === 0, "catalogo", badAssets.map((p) => p.id).join(","));

console.log(
  failures === 0
    ? `\nOK: ${blueprints.length} naves, ${catalogue.length} piezas del catalogo, todo compila y proyecta`
    : `\n${failures} FALLOS`,
);
process.exit(failures === 0 ? 0 : 1);
