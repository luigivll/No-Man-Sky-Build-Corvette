/**
 * Style gallery: renders every blueprint in its own hull family to
 * scripts/out/, so the 3D look can be reviewed without opening a browser.
 *
 *   npm run render:gallery                 # one shot per blueprint
 *   npx tsx scripts/style-gallery.ts <slug> <style> <out-name>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { buildFromBlueprint } from "../src/lib/build";
import { blueprints } from "../src/lib/data";
import { buildShipMesh, projectScene, DEFAULT_VIEW, type ShipMesh } from "../src/lib/render3d";

const OUT = join(process.cwd(), "scripts", "out");
mkdirSync(OUT, { recursive: true });
const W = 1200, H = 820;

export function shot(slug: string, style: string, name: string, view = DEFAULT_VIEW) {
  const bp = blueprints.find((b) => b.slug === slug || b.id === slug);
  if (!bp) { console.error(`no blueprint ${slug}`); return; }
  const build = buildFromBlueprint(bp);
  const mesh: ShipMesh = buildShipMesh(build, { style });
  const scene = projectScene(mesh, view, W, H, { padding: 1.35 });

  const backdrop = scene.environment === "space"
    ? `<rect width="${W}" height="${H}" fill="#04060d"/>` +
      scene.nebula.map((c) => `<ellipse cx="${c.x}" cy="${c.y}" rx="${c.rx}" ry="${c.ry}" fill="${c.color}" opacity="${c.alpha}" transform="rotate(${c.rotate} ${c.x} ${c.y})"/>`).join("") +
      scene.stars.map((s) => `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="#e8f4ff" opacity="${s.alpha}"/>`).join("")
    : `<rect width="${W}" height="${H}" fill="#060d18"/>` +
      scene.deck.map((p) => `<polyline points="${p}" fill="none" stroke="rgba(56,189,248,0.16)" stroke-width="1"/>`).join("");
  const shadow = scene.shadow ? `<ellipse cx="${scene.shadow.cx}" cy="${scene.shadow.cy}" rx="${scene.shadow.rx}" ry="${scene.shadow.ry}" fill="rgba(0,0,0,0.5)"/>` : "";
  const trails = scene.plumes.map((p) =>
    p.segments.map((seg) => `<polygon points="${seg.points}" fill="${mesh.style.trail}" opacity="${seg.alpha}"/>`).join("")).join("");
  const cores = scene.plumes.map((p) => `<polygon points="${p.core}" fill="#fff2d8" opacity="0.7"/>`).join("");
  const faces = scene.faces.map((f) => {
    const glow = f.kind === "emissive" || f.kind === "trim";
    return `<polygon points="${f.points}" fill="${f.fill}" opacity="${f.opacity}" stroke="${glow ? f.fill : "rgba(4,8,16,0.5)"}" stroke-width="${glow ? 2.2 : 0.35}" stroke-opacity="${glow ? 0.45 : 1}"/>`;
  }).join("");
  const maxGap = mesh.attachments.length ? Math.max(...mesh.attachments.map((a) => a.gap)) : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${backdrop}${shadow}${trails}${faces}${cores}
  <text x="22" y="36" fill="#67e8f9" font-family="monospace" font-size="17">${bp.name} — ${mesh.style.label}</text>
  <text x="22" y="58" fill="#8fa3b8" font-family="monospace" font-size="11">${mesh.parts.length} parts · ${mesh.attachments.length} socket joins · max gap ${maxGap.toFixed(3)}u</text></svg>`;
  writeFileSync(join(OUT, `${name}.png`), new Resvg(svg, { fitTo: { mode: "width", value: W }, background: "#04060d" }).render().asPng());
  console.log(`wrote ${name}.png (${mesh.parts.length} parts, max gap ${maxGap.toFixed(3)})`);
}

const [slug, style, name] = process.argv.slice(2);
if (slug) shot(slug, style ?? "corvette", name ?? `shot-${slug}-${style}`);
else {
  for (const blueprint of blueprints) {
    shot(blueprint.slug, blueprint.style ?? "corvette", `gallery-${blueprint.slug}`);
  }
}
