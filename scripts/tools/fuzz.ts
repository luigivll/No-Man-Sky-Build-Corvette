/**
 * Fuzz the Build → lattice compiler.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/tools/fuzz.ts [rounds]
 *
 * The randomizer can roll any combination the catalogue allows, including the
 * awkward ones: a ship with no wings, one with six reactors and no habitation,
 * one with nothing but landing gear. This rolls a few hundred of them, compiles
 * each to a recipe, assembles it from the real pack, and fails on anything a
 * player would see: a missing asset, aNaN bound, an empty projection, or a
 * module floating clear of the ship.
 */
import { createBuild } from "@/lib/build";
import { parts, categories, categoryById } from "@/lib/data";
import { buildToRecipe } from "@/lib/buildLattice";
import { assembleCorvette, placedBox } from "@/lib/lattice";
import { packSync } from "@/lib/realMeshes";
import { projectScene } from "@/lib/render3d";
import type { Build, PartCategoryId } from "@/lib/types";

const rounds = Number(process.argv[2] ?? 200);
const pack = packSync();
if (!pack) throw new Error("mesh pack missing");
const seed = (n: number) => Math.floor(Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1 * 1e6);

let failures = 0;
let worstOrphan = 0;
const shapes = { fighter: 0, gunship: 0, freighter: 0, corvette: 0 };

for (let round = 0; round < rounds; round++) {
  const slots: Build["slots"] = {};
  for (const category of categories) {
    const pool = parts.filter((p) => p.category === (category.id as PartCategoryId));
    if (!pool.length) continue;
    // roll 0..4 of each category, biased so most builds are legal-ish
    const n = seed(round * 31 + category.id.length) % 5;
    const picked = Array.from({ length: n }, (_, i) => pool[seed(round * 7 + i) % pool.length].id);
    if (picked.length) slots[category.id as PartCategoryId] = picked;
  }
  const build = createBuild({ id: `fuzz-${round}`, name: `Fuzz ${round}`, origin: "randomizer", slots });
  const recipe = buildToRecipe(build);
  const mesh = assembleCorvette(recipe, { maxTrisPerPart: 300 });

  if (!mesh) {
    failures++;
    console.log(`ronda ${round}: sin malla`);
    continue;
  }
  const missing = recipe.parts.filter((p) => !pack.byId.has(p.assetId));
  const finite = [mesh.bounds.min, mesh.bounds.max].every((v) => v.every(Number.isFinite));
  const scene = projectScene(mesh, recipe.view ?? { yaw: 0.5, pitch: -0.3, zoom: 1 }, 800, 560, {});
  const boxes = recipe.parts
    .map((p) => placedBox(p.assetId, p.pos, p.yaw ?? 0, p.mirror ?? false, p.scale ?? 1, p.roll ?? 0, p.stretchX ?? 1))
    .filter((b): b is NonNullable<typeof b> => Boolean(b));
  let orphans = 0;
  boxes.forEach((b, i) => {
    let best = -Infinity;
    boxes.forEach((c, j) => {
      if (j === i) return;
      best = Math.max(
        best,
        Math.min(
          Math.min(b.max[0], c.max[0]) - Math.max(b.min[0], c.min[0]),
          Math.min(b.max[1], c.max[1]) - Math.max(b.min[1], c.min[1]),
          Math.min(b.max[2], c.max[2]) - Math.max(b.min[2], c.min[2]),
        ),
      );
    });
    if (best < -0.1) orphans++;
  });
  worstOrphan = Math.max(worstOrphan, orphans);

  const role = recipe.role.includes("strike")
    ? "fighter"
    : recipe.role.includes("gunship")
      ? "gunship"
      : recipe.role.includes("freighter")
        ? "freighter"
        : "corvette";
  shapes[role as keyof typeof shapes]++;

  if (missing.length || !finite || !scene.faces.length || orphans) {
    failures++;
    console.log(
      `ronda ${round}: ${missing.length} assets, finite=${finite}, poligonos=${scene.faces.length}, huerfanos=${orphans}`,
    );
  }
}

console.log(`\n${rounds} builds aleatorios, ${failures} fallos, peor caso ${worstOrphan} huerfanos`);
console.log(`formas: ${JSON.stringify(shapes)}`);
console.log(`categorias: ${categories.map((c) => c.id).join(", ")}`);
void categoryById;
process.exit(failures ? 1 : 0);
