/**
 * Model manifest builder.
 *
 * Scans a folder of extracted/converted `.glb` files and writes
 * `public/models/manifest.json`, wiring each file to the catalogue entry whose
 * `sceneId` matches the filename (case-insensitive, `_`/`-`/spaces ignored).
 *
 * Usage:
 *   npx tsx scripts/prepare-models.ts ./extracted-glb
 *
 * Extraction pipeline (Windows, run locally — the assets are not redistributed):
 *   1. PSARCTool (Periander)  → unpack the game `.pak` into loose files.
 *   2. MBINCompiler/libMBIN (monkeyman192) → decompile `.MODEL.MBIN` / `.GEOM.MBIN`.
 *   3. NMSDK Blender add-on (monkeyman192 / gregkwaste) → import the module.
 *   4. Blender ▸ File ▸ Export ▸ glTF 2.0 (.glb), one file per module, named
 *      after its scene node: BIG_COK1X2_A.glb, BIG_HAB1X2_B.glb, ...
 *   5. Run this script and reload the shipyard — extracted meshes automatically
 *      replace the procedural fallbacks.
 */
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const CATALOGUE = [
  "BIG_COK1X2_A", "BIG_COK1X2_B", "BIG_COK1X2_D",
  "BIG_HAB1X2_A", "BIG_HAB1X2_B", "BIG_HAB1X2_C",
  "BIG_HAB1X1_A", "BIG_HAB1X1_B", "BIG_HAB1X1_C",
  "BIG_ALK1X1_A", "BIG_ALK1X1_B", "BIG_ALK1X1_C",
  "BIG_LND1X1_A", "BIG_LND1X1_B", "BIG_LND1X1_C",
  "BIG_WNG1X2_A", "BIG_WNG1X2_B", "BIG_WNG1X2_C", "BIG_WNG1X2_D", "BIG_WNG1X2_E",
  "BIG_WNG1X2_F", "BIG_WNG1X2_G", "BIG_WNG1X2_H", "BIG_WNG1X2_I", "BIG_WNG1X2_J",
  "BIG_WNG1X2_K", "BIG_WNG1X2_L", "BIG_WNG1X2_M", "BIG_WNG1X2_N",
  "BIG_WNG1X2_O_0", "BIG_WNG1X2_O_1", "BIG_WNG1X2_O_2",
  "BIG_TRU1X1_A", "BIG_TRU1X1_B", "BIG_TRU1X1_C", "BIG_TRU1X1_D", "BIG_TRU1X1_E",
  "BIG_TRU1X1_F", "BIG_TRU1X1_G", "BIG_TRU1X1_H",
  "BIG_SHL1X1_A", "BIG_SHL1X1_B", "BIG_SHL1X1_C", "BIG_SHL1X1_D",
  "BIG_TUR1X1_A", "BIG_TUR1X1_B", "BIG_TUR1X1_C", "BIG_TUR1X1_D", "BIG_TUR1X1_E",
  "BIG_GEN1X1_0", "BIG_GEN1X1_1", "BIG_GEN1X1_2", "BIG_GEN1X1_3",
  "BIG_STR1X1_A", "BIG_STR1X1_B", "BIG_STR1X1_C", "BIG_STR1X1_D", "BIG_STR1X1_E",
  "BIG_STR1X1_F", "BIG_STR1X1_G", "BIG_STR1X1_H", "BIG_STR1X1_I", "BIG_STR1X1_J",
  "BIG_STR1X1_K_N", "BIG_STR1X1_L_N", "BIG_STR1X1_K_NE", "BIG_STR1X1_M",
  "BIG_DECO1X1_A", "BIG_DECO1X1_B", "BIG_DECO1X1_C", "BIG_DECO1X1_D", "BIG_DECO1X1_I",
];

const normalise = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const source = process.argv[2];
if (!source) {
  console.error("Usage: npx tsx scripts/prepare-models.ts <folder-with-glb-files>");
  process.exit(1);
}

const folder = resolve(source);
if (!existsSync(folder)) {
  console.error(`Folder not found: ${folder}`);
  process.exit(1);
}

const files = readdirSync(folder).filter((file) => file.toLowerCase().endsWith(".glb"));
const manifest: Record<string, { file: string; scale: number }> = {};
const unmatched: string[] = [];

for (const file of files) {
  const stem = normalise(file.replace(/\.glb$/i, ""));
  const hit = CATALOGUE.find((id) => normalise(id) === stem);
  if (hit) manifest[hit] = { file, scale: 1 };
  else unmatched.push(file);
}

const target = join(process.cwd(), "public", "models");
writeFileSync(join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Matched ${Object.keys(manifest).length}/${CATALOGUE.length} catalogue modules.`);
if (unmatched.length > 0) {
  console.log(`Ignored ${unmatched.length} file(s) with no catalogue match: ${unmatched.join(", ")}`);
}
console.log(`Wrote public/models/manifest.json`);
