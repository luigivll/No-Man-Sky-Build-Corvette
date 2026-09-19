/**
 * Renders test PNGs of the 3D ship preview so the visuals can be reviewed
 * without a browser.
 *
 *   npx tsx scripts/render-preview.ts
 *
 * Output lands in scripts/out/*.png (git-ignored).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { buildFromBlueprint, computeStats, countParts } from "../src/lib/build";
import { blueprints, partById, parts } from "../src/lib/data";
import { buildPartMesh, buildShipMesh, projectScene, rgbCss, DEFAULT_VIEW, type ShipMesh, type ViewState } from "../src/lib/render3d";

const OUT = join(process.cwd(), "scripts", "out");
mkdirSync(OUT, { recursive: true });

const W = 1100;
const H = 800;

function svgFor(mesh: ShipMesh, view: ViewState, label: string) {
  const scene = projectScene(mesh, view, W, H);

  const deckLines = scene.deck
    .map((points) => `<polyline points="${points}" fill="none" stroke="rgba(56,189,248,0.18)" stroke-width="1"/>`)
    .join("");

  const shadow = scene.shadow
    ? `<ellipse cx="${scene.shadow.cx.toFixed(1)}" cy="${scene.shadow.cy.toFixed(1)}" rx="${scene.shadow.rx.toFixed(1)}" ry="${scene.shadow.ry.toFixed(1)}" fill="rgba(0,0,0,0.5)"/>`
    : "";

  const faces = scene.faces
    .map((face, index) => {
      const glowing = face.kind === "emissive" || face.kind === "trim";
      return `<polygon id="f${index}" points="${face.points}" fill="${face.fill}" opacity="${face.opacity}" stroke="${
        glowing ? face.fill : "rgba(4,8,16,0.55)"
      }" stroke-width="${glowing ? 2.2 : 0.4}" stroke-opacity="${glowing ? 0.45 : 1}"/>`;
    })
    .join("");

  const plumes =
    scene.plumes
      .map((plume) =>
        plume.segments
          .map((segment) => `<polygon points="${segment.points}" fill="${mesh.style.trail}" opacity="${segment.alpha}"/>`)
          .join(""),
      )
      .join("") +
    scene.plumes.map((plume) => `<polygon points="${plume.core}" fill="#fff2d8" opacity="0.7"/>`).join("");

  const shield = scene.shield
    .flat()
    .map((seg) => `<polyline points="${seg.points}" fill="none" stroke="rgba(103,232,249,0.5)" stroke-width="1.2"/>`)
    .join("");

  const backdrop =
    scene.environment === "space"
      ? `<rect width="${W}" height="${H}" fill="#04060d"/>` +
        scene.nebula
          .map(
            (cloud) =>
              `<ellipse cx="${cloud.x.toFixed(0)}" cy="${cloud.y.toFixed(0)}" rx="${cloud.rx.toFixed(0)}" ry="${cloud.ry.toFixed(0)}" fill="${cloud.color}" opacity="${cloud.alpha}" transform="rotate(${cloud.rotate.toFixed(0)} ${cloud.x.toFixed(0)} ${cloud.y.toFixed(0)})"/>`,
          )
          .join("") +
        scene.stars
          .map((star) => `<circle cx="${star.x.toFixed(0)}" cy="${star.y.toFixed(0)}" r="${star.r.toFixed(2)}" fill="#e8f4ff" opacity="${star.alpha.toFixed(2)}"/>`)
          .join("")
      : `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#0b1a2e"/>
      <stop offset="100%" stop-color="#03050a"/>
    </radialGradient>
  </defs>
  ${backdrop}
  ${deckLines}
  ${shadow}
  ${plumes}
  ${faces}
  ${shield}
  <text x="24" y="40" fill="#67e8f9" font-family="monospace" font-size="18">${label}</text>
  <text x="24" y="62" fill="#94a3b8" font-family="monospace" font-size="12">${mesh.moduleCount} modules · ${scene.faces.length} faces · yaw ${(view.yaw * 57.3).toFixed(0)}° pitch ${(view.pitch * 57.3).toFixed(0)}°</text>
</svg>`;
}

function raster(name: string, svg: string) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    background: "#03050a",
  });
  writeFileSync(join(OUT, `${name}.png`), resvg.render().asPng());
  console.log(`  wrote scripts/out/${name}.png`);
}

console.log("\nRendering ship previews…\n");

for (const slug of ["millennium-falcon", "x-wing-t65", "imperial-star-destroyer", "unsc-pelican", "uss-enterprise"]) {
  const blueprint = blueprints.find((b) => b.slug === slug);
  if (!blueprint) continue;
  const build = buildFromBlueprint(blueprint);
  const mesh = buildShipMesh(build, { style: (blueprint as { style?: string }).style ?? "corvette" });
  const stats = computeStats(build);
  console.log(
    `${blueprint.name}: ${countParts(build)} modules, ${mesh.parts.length} drawn groups, ${mesh.parts.reduce((n, p) => n + p.faces.length, 0)} faces`,
  );
  raster(slug, svgFor(mesh, DEFAULT_VIEW, `${blueprint.name} — 3/4 view`));
}

// a few angles of one ship to sanity-check the projection from every side
const falcon = blueprints.find((b) => b.slug === "millennium-falcon");
if (falcon) {
  const mesh = buildShipMesh(buildFromBlueprint(falcon));
  const views: { name: string; view: ViewState }[] = [
    { name: "falcon-side", view: { yaw: -Math.PI / 2, pitch: -0.08, zoom: 1 } },
    { name: "falcon-top", view: { yaw: 0, pitch: -Math.PI / 2 + 0.01, zoom: 1 } },
    { name: "falcon-rear", view: { yaw: Math.PI, pitch: -0.3, zoom: 1 } },
  ];
  for (const v of views) raster(v.name, svgFor(mesh, v.view, `Millennium Falcon — ${v.name.split("-")[1]}`));
}

// every part portrait in one contact sheet, to check each primitive reads well
{
  const cols = 10;
  const cell = 150;
  const rows = Math.ceil(parts.length / cols);
  const items = parts.map((part, index) => {
    const mesh = buildPartMesh(part);
    const scene = projectScene(mesh, { yaw: -0.8, pitch: -0.42, zoom: 1 }, cell, cell - 26);
    const cx = (index % cols) * cell;
    const cy = Math.floor(index / cols) * cell + 20;
    const faceSvg = scene.faces
      .map((f) => `<polygon points="${f.points}" fill="${f.fill}" stroke="rgba(4,8,16,0.5)" stroke-width="0.3"/>`)
      .join("");
    return `<g transform="translate(${cx},${cy})">${faceSvg}<text x="${cell / 2}" y="${cell - 20}" fill="#94a3b8" font-family="monospace" font-size="8" text-anchor="middle">${part.name.slice(0, 22)}</text></g>`;
  });
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell + 20}" viewBox="0 0 ${cols * cell} ${rows * cell + 20}">
  <rect width="100%" height="100%" fill="#060a13"/>
  ${items.join("")}
  </svg>`;
  raster("part-portraits", sheet);
}

// empty build must not explode
{
  const mesh = buildShipMesh({
    id: "empty",
    name: "Empty",
    createdAt: 0,
    slots: {},
    roles: [],
    origin: "manual",
  });
  console.log(`\nEmpty build handled: ${mesh.parts.length} parts, ground ${mesh.groundY}`);
}

console.log(`\nDone. ${parts.length} part portraits + blueprint renders in scripts/out/\n`);
console.log(`accent sample: ${rgbCss([34, 211, 238])} ${partById["reactor-zenith"]?.name}`);
