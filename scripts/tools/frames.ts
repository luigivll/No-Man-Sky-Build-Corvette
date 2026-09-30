/**
 * Does the viewer actually DRAW anything?
 *
 *   npx tsx --tsconfig tsconfig.json scripts/tools/frames.ts
 *
 * Every other check in this repo works on data: recipes, boxes, meshes, counts.
 * None of them looked at what the viewer RENDERS, and that is how a ship with 61
 * modules of real geometry ended up showing "No hull to render": the lattice
 * hands `ShipPreview3D` a finished mesh while its `build` is deliberately empty,
 * the component counted modules from the build, got zero, and returned the empty
 * placeholder before touching the mesh.
 *
 * So this renders the actual component with react-dom/server and looks at the
 * markup: a drawable ship must produce polygons, and must NOT produce the
 * placeholder. Effects do not run under SSR and the component does not need them
 * for the geometry, so the output is exactly the faces the browser would get.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ShipPreview3D from "@/components/ShipPreview3D";
import { blueprints } from "@/lib/data";
import { blueprintToRecipe } from "@/lib/blueprintLattice";
import { latticeBuild } from "@/lib/fleet";
import { assembleCorvette, heroBudget } from "@/lib/lattice";
import { buildFromBlueprint } from "@/lib/build";
import { buildShipMesh } from "@/lib/render3d";

const PLACEHOLDER = "No hull to render";

let failures = 0;
let checks = 0;
let totalPolys = 0;

function render(node: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(node);
}

function inspect(label: string, html: string, minPolys: number) {
  checks++;
  const polys = (html.match(/<polygon/g) ?? []).length;
  totalPolys += polys;
  if (html.includes(PLACEHOLDER)) {
    // .toUpperCase() would also fire on the placeholder text itself, so match the
    // casing the component actually emits
    failures++;
    console.log(`  FALLO  ${label}: el visor pinta el cartel vacio con ${polys} poligonos disponibles`);
    return;
  }
  if (polys < minPolys) {
    failures++;
    console.log(`  FALLO  ${label}: solo ${polys} poligonos (esperaba >= ${minPolys})`);
  }
}

// ---------------------------------------------------------------------------
// 1. the 21 iconics, exactly as /lattice/<slug> and /assembly/<slug> mount them
// ---------------------------------------------------------------------------
console.log("1. las 21 iconicas en el visor");

for (const bp of blueprints) {
  const recipe = blueprintToRecipe(bp);
  const mesh = assembleCorvette(recipe, { maxTrisPerPart: heroBudget(recipe.parts.length) });
  if (!mesh) {
    failures++;
    checks++;
    console.log(`  FALLO  ${bp.slug}: assembleCorvette devolvio null`);
    continue;
  }
  const html = render(
    createElement(ShipPreview3D, {
      build: latticeBuild(recipe),
      mesh,
      height: 400,
      showStylePicker: false,
    }),
  );
  inspect(bp.slug, html, 40);
}

// ---------------------------------------------------------------------------
// 2. a catalogue build still renders from its slots (no mesh handed over)
// ---------------------------------------------------------------------------
console.log("2. un build del catalogo, sin malla inyectada");

const catalogue = blueprints[0];
const build = buildFromBlueprint(catalogue);
const fromSlots = render(createElement(ShipPreview3D, { build, height: 400, showStylePicker: false }));
inspect(`catalogo ${catalogue.slug}`, fromSlots, 40);

// ---------------------------------------------------------------------------
// 3. an empty build must still show the placeholder, not an empty frame
// ---------------------------------------------------------------------------
console.log("3. un build vacio sigue avisando");

const empty = render(
  createElement(ShipPreview3D, {
    build: { ...build, slots: {} },
    height: 400,
    showStylePicker: false,
  }),
);
checks++;
if (!empty.includes(PLACEHOLDER)) {
  failures++;
  console.log("  FALLO  un build sin modulos deberia mostrar el aviso de que no hay casco");
}

// ---------------------------------------------------------------------------
// 4. the buildShipMesh path agrees with the lattice path
// ---------------------------------------------------------------------------
console.log("4. coherencia entre los dos caminos de malla");

const viaBuilder = buildShipMesh(build, { style: catalogue.style });
checks++;
if (!viaBuilder.parts.length) {
  failures++;
  console.log("  FALLO  buildShipMesh no produce piezas para un blueprint del catalogo");
}

console.log(
  failures === 0
    ? `\nOK: ${checks} naves dibujadas, ${totalPolys} poligonos en total, 0 fallos`
    : `\n${failures} FALLOS de ${checks} comprobaciones`,
);
if (failures > 0) process.exit(1);
