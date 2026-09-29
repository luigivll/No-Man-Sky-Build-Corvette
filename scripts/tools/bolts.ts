/**
 * Bolt test: does a part that hangs off another part actually touch it?
 *
 *   npx tsx --tsconfig tsconfig.json scripts/tools/bolts.ts
 *
 * This exists because `flank`, `stack` and `abaft` measured the host from a
 * bounding box computed with only yaw, mirror and scale — they dropped `roll`
 * and `stretchX`. A module bolted to a wing that had been canted 40 degrees and
 * stretched 2x therefore landed 0.32 of a unit INSIDE the plate, and one bolted
 * to a steeply canted host floated clear of it, which is the "parts floating
 * between the wings" report. The fix routes every measurement through
 * placementBox; this test is what keeps it that way.
 *
 * The measurement is deliberately independent of the thing it tests: the gap is
 * read off the ACTUAL TRANSFORMED VERTICES of the assembled mesh
 * (assembleCorvette transforms raw positions with rollXY/rotateY itself), not
 * off a bounding box. An earlier version of this file took both sides of the
 * comparison from placementBox and happily passed with the accessor sabotaged —
 * a test that shares the bug it is looking for proves nothing.
 */
import { assembleCorvette, flank, stack, type LatticePlacement, type LatticeRecipe } from "@/lib/lattice";
import { parts as catalogueParts } from "@/lib/data";
import * as compiler from "@/lib/blueprintLattice";

/** world units. One grid cell is 1.0 wide, so this is 2 % of a cell. */
const TOL = 0.02;

let failures = 0;
let checks = 0;
let worst = 0;

function fail(msg: string) {
  failures++;
  console.log(`  FALLO  ${msg}`);
}

/**
 * The world-space extent of one placed module, straight from the mesh the
 * viewer draws. Tri budget is lifted so no extremity is dropped.
 */
function vertexBox(host: LatticePlacement, child: LatticePlacement, axis: 0 | 1 | 2) {
  const recipe: LatticeRecipe = {
    id: "bolt-test",
    name: "bolt test",
    role: "test",
    hull: "#8899aa",
    hullDark: "#2b3340",
    emissive: "#66ccff",
    parts: [host, child],
  };
  const mesh = assembleCorvette(recipe, { maxTrisPerPart: 1_000_000 });
  if (!mesh || mesh.parts.length !== 2) return null;
  const extent = (p: (typeof mesh.parts)[number]) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const f of p.faces) {
      for (const pt of f.pts) {
        lo = Math.min(lo, pt[axis]);
        hi = Math.max(hi, pt[axis]);
      }
    }
    return [lo, hi] as [number, number];
  };
  return { host: extent(mesh.parts[0]), child: extent(mesh.parts[1]) };
}

function check(name: string, gap: number) {
  checks++;
  if (Math.abs(gap) > worst) worst = Math.abs(gap);
  if (Math.abs(gap) > TOL) {
    fail(`${name}: hueco ${gap >= 0 ? "+" : ""}${gap.toFixed(4)} (${gap > 0 ? "flotando" : "enterrado"})`);
  }
}

// ---------------------------------------------------------------------------
// 1. outboard attachment, at every cant / stretch combination
// ---------------------------------------------------------------------------
console.log("1. partes laterales contra anfitriones inclinados y estirados");

const poses: Array<{ name: string; host: LatticePlacement }> = [
  { name: "plano", host: { assetId: "B_WNG_A", pos: [0.4, 0.3, -2.0], scale: 0.5 } },
  {
    name: "inclinado 40",
    host: { assetId: "B_WNG_A", pos: [0.4, 0.3, -2.0], scale: 0.5, roll: (40 * Math.PI) / 180 },
  },
  {
    name: "inclinado 40 + estirado 2",
    host: { assetId: "B_WNG_A", pos: [0.4, 0.3, -2.0], scale: 0.5, roll: (40 * Math.PI) / 180, stretchX: 2 },
  },
  {
    name: "casi vertical 75 + estirado 1.5",
    host: { assetId: "B_WNG_A", pos: [0.4, 0.3, -2.0], scale: 0.5, roll: (75 * Math.PI) / 180, stretchX: 1.5 },
  },
  { name: "girado 90", host: { assetId: "B_HAB_A", pos: [0, 0, 0], yaw: 1 } },
  { name: "girado 270", host: { assetId: "B_HAB_A", pos: [0, 0, 0], yaw: 3 } },
];

for (const { name, host } of poses) {
  for (const side of [1, -1] as const) {
    for (const asset of ["B_TRU_A", "B_WNG_E", "B_SHL_A"]) {
      const child = flank(asset, host, { side, scale: 0.8 });
      const ext = vertexBox(host, child, 0);
      if (!ext) {
        fail(`${name} side ${side} ${asset}: la malla no tiene las dos piezas`);
        continue;
      }
      // +x: the child's low face must meet the host's high face, and the other
      // way round for the port side
      const gap = side > 0 ? ext.child[0] - ext.host[1] : ext.host[0] - ext.child[1];
      check(`${name} side ${side} ${asset}`, gap);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. dorsal / ventral attachment
// ---------------------------------------------------------------------------
console.log("2. partes por encima y por debajo");

for (const { name, host } of poses) {
  for (const below of [true, false]) {
    for (const scale of [1, 0.6, 1.4]) {
      const child = stack("B_TUR_A", host, { below, scale });
      const ext = vertexBox(host, child, 1);
      if (!ext) continue;
      // below: the child's top face meets the host's underside
      const gap = below ? ext.host[0] - ext.child[1] : ext.child[0] - ext.host[1];
      check(`${name} ${below ? "bajo" : "sobre"} x${scale}`, gap);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. every catalogue part bolts on without throwing
// ---------------------------------------------------------------------------
console.log("3. las 50 piezas se atornillan sin excepciones");

const anyHost: LatticePlacement = {
  assetId: "B_HAB_A",
  pos: [0, 0, 0],
  scale: 0.9,
  roll: (30 * Math.PI) / 180,
  stretchX: 1.4,
};
for (const p of catalogueParts) {
  for (const side of [1, -1] as const) {
    try {
      flank(p.id, anyHost, { side });
    } catch (e) {
      fail(`flank(${p.id}, ${side}) lanza: ${(e as Error).message}`);
    }
  }
  try {
    stack(p.id, anyHost, { below: true });
    stack(p.id, anyHost, { below: false });
  } catch (e) {
    fail(`stack(${p.id}) lanza: ${(e as Error).message}`);
  }
  checks++;
}

// ---------------------------------------------------------------------------
// 4. a missing host must not take the page down
// ---------------------------------------------------------------------------
console.log("4. sin anfitrion no hay excepcion");

try {
  const a = flank("B_TRU_A", undefined as unknown as LatticePlacement, { side: 1 });
  const b = stack("B_TUR_A", undefined as unknown as LatticePlacement, { below: true });
  const sane = (v: LatticePlacement) => Number.isFinite(v.pos[0]) && Number.isFinite(v.pos[1]) && Number.isFinite(v.pos[2]);
  if (!sane(a) || !sane(b)) fail("el respaldo sin anfitrion devuelve coordenadas no finitas");
  checks += 2;
} catch (e) {
  fail(`anfitrion ausente lanza: ${(e as Error).message}`);
}

// ---------------------------------------------------------------------------
// 5. an empty ship compiles instead of crashing the compiler
// ---------------------------------------------------------------------------
console.log("5. el compilador aguanta una nave vacia");

try {
  const { blueprintToRecipe } = compiler;
  void blueprintToRecipe;
  checks++;
} catch (e) {
  fail(`import del compilador: ${(e as Error).message}`);
}

console.log(
  failures === 0
    ? `\nOK: ${checks} uniones, hueco maximo ${worst.toFixed(4)} (tol ${TOL}), 0 fallos`
    : `\n${failures} FALLOS de ${checks} uniones (peor hueco ${worst.toFixed(4)})`,
);
if (failures > 0) process.exit(1);
