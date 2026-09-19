/**
 * Headless verification of the shipyard logic (no React required).
 *
 *   npm run verify
 *
 * Checks that:
 *  - every generated hull is spaceworthy (meets all Workshop minimums)
 *  - generated hulls never exceed the 160-module cap
 *  - seeded rolls are deterministic
 *  - salvage-first mode really favours salvage-only modules
 *  - every iconic blueprint compiles into a legal build with real part ids
 */
import { buildFromBlueprint, computeStats, costBreakdown, countParts, expandParts, isSpaceworthy, requirementStatus, inventorySlots } from "../src/lib/build";
import { buildPartMesh, buildShipMesh, projectScene, DEFAULT_VIEW } from "../src/lib/render3d";
import { SHIP_STYLES, fuseStyles } from "../src/lib/shipStyles";
import { blueprints, categories, meta, parts } from "../src/lib/data";
import { ROLE_DEFS, generateBuild, type GeneratorOptions } from "../src/lib/randomizer";
import type { RoleId } from "../src/lib/types";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

const knownIds = new Set(parts.map((p) => p.id));

console.log(`\n== Data integrity ==`);
check(`${parts.length} parts loaded`, parts.length > 0);
check(
  "every part belongs to a known category",
  parts.every((p) => categories.some((c) => c.id === p.category)),
  parts.filter((p) => !categories.some((c) => c.id === p.category)).map((p) => p.id).join(","),
);
check(
  "part ids unique",
  knownIds.size === parts.length,
);
check(
  "every part has at least one stat contribution",
  parts.every((p) => Object.values(p.stats).some((v) => v > 0)),
);
check(
  "every part is obtainable (buyable or has a salvage source)",
  parts.every((p) => p.buyable || p.sources.length > 0),
);

console.log(`\n== Blueprints ==`);
for (const blueprint of blueprints) {
  const build = buildFromBlueprint(blueprint);
  const total = countParts(build);
  const cost = costBreakdown(build);
  const unknown = blueprint.parts.filter((ref) => !knownIds.has(ref.id));
  check(
    `${blueprint.name.padEnd(26)} ${String(total).padStart(3)} modules  ${(cost.total / 1_000_000).toFixed(2)}M U  +${inventorySlots(build)} slots`,
    unknown.length === 0 && total > 0 && total <= meta.maxParts && isSpaceworthy(build),
    unknown.length ? `unknown ids: ${unknown.map((u) => u.id).join(",")}` : "not spaceworthy or over cap",
  );
}

console.log(`\n== Randomizer ==`);
const sizes = ["minimal", "light", "standard", "heavy", "auto"] as const;
const combos: RoleId[][] = [
  [],
  ["combat"],
  ["exploration"],
  ["massive"],
  ["minimalist"],
  ["combat", "massive"],
  ["exploration", "minimalist"],
  ["combat", "exploration", "massive", "minimalist"],
];

for (const roles of combos) {
  for (const size of sizes) {
    const options: GeneratorOptions = {
      roles,
      size,
      salvageOnly: false,
      symmetry: true,
      seed: 4242,
    };
    const build = generateBuild(options);
    const statuses = requirementStatus(build);
    const total = countParts(build);
    const label = `${(roles.join("+") || "balanced").padEnd(30)} ${size.padEnd(8)} ${String(total).padStart(3)} modules  ${build.name}`;
    check(
      label,
      total > 0 && total <= meta.maxParts && statuses.every((s) => s.met),
      `unsatisfied: ${statuses.filter((s) => !s.met).map((s) => s.category.id).join(",")}`,
    );
  }
}

// determinism
const a = generateBuild({ roles: ["combat"], size: "standard", salvageOnly: false, symmetry: true, seed: 777 });
const b = generateBuild({ roles: ["combat"], size: "standard", salvageOnly: false, symmetry: true, seed: 777 });
const c = generateBuild({ roles: ["combat"], size: "standard", salvageOnly: false, symmetry: true, seed: 778 });
check(
  "same seed reproduces the identical hull",
  JSON.stringify(a.slots) === JSON.stringify(b.slots) && a.name === b.name,
);
check("different seed produces a different hull", JSON.stringify(a.slots) !== JSON.stringify(c.slots));

// salvage-first: compare the vendor share of a salvage run against a normal run.
// Habitation modules and walkways are vendor-only in the real game, so a 100%
// salvage list is impossible - the point is that the vendor bill shrinks a lot.
const salvageBuilds = Array.from({ length: 25 }, (_, index) =>
  generateBuild({
    roles: ["combat", "exploration"],
    size: "standard",
    salvageOnly: true,
    symmetry: false,
    seed: 1000 + index,
  }),
);
const normalBuilds = Array.from({ length: 25 }, (_, index) =>
  generateBuild({
    roles: ["combat", "exploration"],
    size: "standard",
    salvageOnly: false,
    symmetry: false,
    seed: 1000 + index,
  }),
);
const vendorShare = (builds: typeof salvageBuilds) => {
  const all = builds.flatMap((build) => expandParts(build));
  const vendor = all.filter((part) => part.buyable).length;
  return vendor / Math.max(1, all.length);
};
const salvageVendorShare = vendorShare(salvageBuilds);
const normalVendorShare = vendorShare(normalBuilds);
check(
  `salvage-first cuts vendor share from ${(normalVendorShare * 100).toFixed(0)}% to ${(salvageVendorShare * 100).toFixed(0)}%`,
  salvageVendorShare < normalVendorShare - 0.15,
);

// stat sanity: a combat hull should out-damage a minimalist hull on average
const combatAvg =
  Array.from({ length: 20 }, (_, i) =>
    computeStats(generateBuild({ roles: ["combat"], size: "standard", salvageOnly: false, symmetry: true, seed: 50 + i })).ratings.damage,
  ).reduce((x, y) => x + y, 0) / 20;
const minimalAvg =
  Array.from({ length: 20 }, (_, i) =>
    computeStats(generateBuild({ roles: ["minimalist"], size: "minimal", salvageOnly: false, symmetry: true, seed: 50 + i })).ratings.damage,
  ).reduce((x, y) => x + y, 0) / 20;
check(
  `combat hulls out-gun minimalist hulls (${combatAvg.toFixed(0)} vs ${minimalAvg.toFixed(0)})`,
  combatAvg > minimalAvg,
);

// minimalist discipline: the role should keep hulls lean at every size preset
const minimalistCounts = sizes.map(
  (size) =>
    countParts(
      generateBuild({ roles: ["minimalist"], size, salvageOnly: false, symmetry: true, seed: 909 }),
    ),
);
check(
  `minimalist hulls stay lean across all size presets (${minimalistCounts.join(", ")})`,
  minimalistCounts.every((count) => count <= 26),
);

console.log(`\n== 3D ship renderer ==`);
{
  const canvasW = 900;
  const canvasH = 600;

  // every blueprint must produce drawable geometry that stays inside frame
  for (const blueprint of blueprints) {
    const build = buildFromBlueprint(blueprint);
    const mesh = buildShipMesh(build);
    const scene = projectScene(mesh, DEFAULT_VIEW, canvasW, canvasH, { padding: 1.24 });
    const faceCount = mesh.parts.reduce((n, part) => n + part.faces.length, 0);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let bad = 0;
    for (const face of scene.faces) {
      for (const pair of face.points.split(" ")) {
        const [x, y] = pair.split(",").map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) bad += 1;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    // engine trails are intentionally long and run off-frame, so only the
    // hull + style flourishes are checked for framing
    const fillsFrame = (maxX - minX) / canvasW > 0.55 && (maxY - minY) / canvasH > 0.4;
    const inFrame = minX >= -2 && maxX <= canvasW + 2 && minY >= -2 && maxY <= canvasH + 2;
    const trailsRunAft = scene.plumes.every((plume) => {
      const xs = plume.core.split(" ").map((pair) => Number(pair.split(",")[0]));
      const ys = plume.core.split(" ").map((pair) => Number(pair.split(",")[1]));
      return xs.every((x) => Number.isFinite(x)) && ys.every((y) => Number.isFinite(y));
    });
    check(
      `${blueprint.name.padEnd(26)} ${String(faceCount).padStart(4)} faces  x[${minX.toFixed(0)},${maxX.toFixed(0)}] y[${minY.toFixed(0)},${maxY.toFixed(0)}]`,
      bad === 0 && faceCount > 100 && inFrame && fillsFrame && trailsRunAft,
      bad > 0
        ? `${bad} non-finite points`
        : !inFrame
          ? "hull clipped outside the viewport"
          : !fillsFrame
            ? "ship too small in frame"
            : "engine trail has non-finite points",
    );
  }

  // the renderer must survive an empty build and single-module builds
  const empty = buildShipMesh({ id: "e", name: "e", createdAt: 0, slots: {}, roles: [], origin: "manual" });
  const emptyScene = projectScene(empty, DEFAULT_VIEW, canvasW, canvasH);
  check("empty build renders without geometry", empty.parts.length === 0 && emptyScene.faces.length === 0);

  // every module must have its own portrait geometry
  let portraitFailures = 0;
  for (const part of parts) {
    const mesh = buildPartMesh(part, { style: "corvette" });
    const faces = mesh.parts[0]?.faces.length ?? 0;
    if (faces < 2) portraitFailures += 1;
  }
  check(`all ${parts.length} modules have portrait geometry`, portraitFailures === 0, `${portraitFailures} too simple`);

  // every ship family must render, and every module must CONNECT to something
  for (const style of SHIP_STYLES) {
    const build = buildFromBlueprint(blueprints[0]);
    const mesh = buildShipMesh(build, { style: style.id });
    const gaps = mesh.attachments.map((a) => a.gap);
    const worst = gaps.length ? Math.max(...gaps) : 0;
    const unconnected = mesh.attachments.length === 0;
    check(
      `${style.label.padEnd(20)} ${String(mesh.parts.length).padStart(3)} parts  ${String(mesh.attachments.length).padStart(3)} joins  max gap ${worst.toFixed(3)}u`,
      !unconnected && worst < 0.02,
      unconnected ? "nothing attached to the hull" : "a module is floating away from its socket",
    );
  }

  // no floating parts: every module in every blueprint must be socketed
  for (const blueprint of blueprints) {
    const build = buildFromBlueprint(blueprint);
    const mesh = buildShipMesh(build, { style: "sentinel" });
    const worst = mesh.attachments.length ? Math.max(...mesh.attachments.map((a) => a.gap)) : 999;
    check(
      `no floating parts: ${blueprint.name.padEnd(26)} ${String(mesh.attachments.length).padStart(3)} socket joins`,
      mesh.attachments.length > 0 && worst < 0.02,
      `worst gap ${worst.toFixed(3)}u`,
    );
  }

  // --- Sentinel doctrine + hull fusion ---------------------------------
  const sentinelBuild = generateBuild({
    roles: ["combat"],
    size: "standard",
    salvageOnly: false,
    symmetry: true,
    seed: 4242,
    sentinel: true,
    hullStyles: ["sentinel"],
  });
  const sentinelPicks = Object.values(sentinelBuild.slots).flat() as string[];
  const corruptPicks = sentinelPicks.filter(
    (id) => id.includes("sfoil") || id.includes("hardframe") || id.includes("arcadia") || id.includes("thunderbird") || id.includes("magfield"),
  ).length;
  check(
    `sentinel mode biases module picks (${corruptPicks}/${sentinelPicks.length} corrupted-pattern hardware, ${sentinelBuild.name})`,
    sentinelBuild.styleIds?.[0] === "sentinel" && corruptPicks / sentinelPicks.length > 0.25,
    "sentinel doctrine did not change the loadout",
  );

  const fusionOptions: GeneratorOptions = {
    roles: ["combat"],
    size: "standard",
    salvageOnly: false,
    symmetry: true,
    seed: 99,
    hullStyles: ["sentinel", "exotic"],
  };
  const fusionA = generateBuild(fusionOptions);
  const fusionB = generateBuild(fusionOptions);
  const styleA = buildShipMesh(fusionA, { style: (fusionA.styleIds ?? []).join("+") });
  const styleB = buildShipMesh(fusionB, { style: (fusionB.styleIds ?? []).join("+") });
  check(
    `fused hull is deterministic (${styleA.style.label}, ${styleA.parts.length} parts, ${styleA.parts.reduce((n, p) => n + p.faces.length, 0)} faces)`,
    JSON.stringify(fusionA.slots) === JSON.stringify(fusionB.slots) &&
      styleA.style.emissive === styleB.style.emissive,
    "same seed produced a different fusion",
  );
  const blended = fuseStyles(["sentinel", "exotic"], 7);
  check(
    `fusion blends two palettes (${blended.emissive} vs ${fuseStyles(["sentinel"], 7).emissive})`,
    blended.emissive !== fuseStyles(["sentinel"], 7).emissive &&
      blended.emissive !== fuseStyles(["exotic"], 7).emissive &&
      blended.flourishes.length >= 2,
    "fusion returned one of the parents unchanged",
  );

  // a maximum-size hull still renders (performance guard)
  const maxBuild = generateBuild({ roles: ["massive"], size: "heavy", salvageOnly: false, symmetry: true, seed: 4242 });
  const maxMesh = buildShipMesh(maxBuild, { style: "sentinel" });
  const maxFaces = maxMesh.parts.reduce((n, part) => n + part.faces.length, 0);
  const t0 = Date.now();
  for (let i = 0; i < 12; i += 1) {
    projectScene(maxMesh, { yaw: i * 0.4, pitch: -0.34, zoom: 1 }, canvasW, canvasH);
  }
  const perFrame = (Date.now() - t0) / 12;
  check(
    `heaviest hull (${countParts(maxBuild)} modules, ${maxFaces} faces) projects in ${perFrame.toFixed(1)}ms/frame`,
    perFrame < 40,
    "too slow to orbit smoothly",
  );
}

console.log(
  failureSummary(),
);

function failureSummary() {
  return failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check(s) failed.\n`;
}

if (failures > 0) process.exitCode = 1;
