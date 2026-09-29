/**
 * The packless test: the state the browser is in before its meshes arrive.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/tools/packless.ts
 *
 * Every lattice helper resolves an asset id through the mesh pack. On the server
 * the pack is read synchronously at import, so nothing ever notices; in the
 * browser it is FETCHED, which happens long after the bundle has been evaluated.
 * A recipe compiled at module scope therefore resolved nothing, skipped every
 * module and handed `flank` an undefined host — /builder died with "Cannot read
 * properties of undefined (reading 'assetId')" before drawing a pixel, and the
 * whole page fell over with it.
 *
 * Defining `window` makes `isServer` false, which is exactly the browser
 * condition: no synchronous pack load. This runs the module graph in that state
 * and asserts it degrades instead of exploding.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// --- before anything is imported: pretend to be a browser -------------------
(globalThis as Record<string, unknown>).window = globalThis;

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail = "") {
  checks++;
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

async function main() {
  const { packSync } = await import("@/lib/realMeshes");
  const fleet = await import("@/lib/fleet");
  const { blueprintToRecipe } = await import("@/lib/blueprintLattice");
  const { blueprints } = await import("@/lib/data");
  const { assembleCorvette, placementBox } = await import("@/lib/lattice");

  check("sin pack: packSync() es null", packSync() === null);

  // 1. the entry point that used to crash the page at import time
  let recipes: unknown[] | null = null;
  try {
    recipes = fleet.latticeRecipes();
  } catch (e) {
    check("latticeRecipes() sin pack no lanza", false, `-> ${(e as Error).message}`);
  }
  if (recipes) check("latticeRecipes() sin pack devuelve [] y no una nave rota", recipes.length === 0, `-> ${recipes.length}`);
  check("recipeById() sin pack devuelve undefined", fleet.recipeById("lattice-probe") === undefined);

  // 2. every iconic must compile without the pack: the part LIST is pure data,
  //    so it still describes the ship, but none of it may have geometry — and
  //    none of it may throw, which is what took /builder down
  let threw: string | null = null;
  for (const bp of blueprints) {
    try {
      blueprintToRecipe(bp);
    } catch (e) {
      threw ??= `${bp.slug}: ${(e as Error).message}`;
      break;
    }
  }
  check(`las ${blueprints.length} iconicas compilan sin pack sin lanzar`, threw === null, threw ? `-> ${threw}` : "");
  const probePart = blueprintToRecipe(blueprints[0]).parts[0];
  check(
    "sin pack ninguna pieza tiene caja, asi que no se puede dibujar una nave a medias",
    placementBox(probePart) === null,
  );

  // 3. assembling a packless recipe is a no-op, not a crash
  try {
    const r = blueprintToRecipe(blueprints[0]);
    const mesh = assembleCorvette(r);
    check("assembleCorvette() sin pack devuelve null", mesh === null || mesh.parts.length === 0);
  } catch (e) {
    check("assembleCorvette() sin pack no lanza", false, `-> ${(e as Error).message}`);
  }

  // 4. the shape of the bug itself, scanned in the source: a recipe compiled
  //    while the module is being evaluated is always a bug, pack or no pack
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      const lines = readFileSync(full, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (
          /^(export )?const \w+[^=]*=\s*\[?\s*[^[({]*\b(chainZ|flank|stack|firstNavyProbe|blueprintToRecipe|iconicRecipe|assembleCorvette|placedBox|placementBox|boxOf)\(/.test(
            line,
          )
        ) {
          offenders.push(`${full}:${i + 1}  ${line.trim().slice(0, 70)}`);
        }
      });
    }
  };
  walk("src");
  check(
    "ninguna receta se compila durante la evaluacion del modulo",
    offenders.length === 0,
    offenders.length ? `->\n    ${offenders.join("\n    ")}` : "",
  );

  console.log(
    failures === 0
      ? `\nOK: ${checks} comprobaciones sin pack, 0 fallos`
      : `\n${failures} FALLOS de ${checks} comprobaciones`,
  );
  if (failures > 0) process.exitCode = 1;
}

void main();
