import Link from "next/link";
import { Chip, HudLabel, Panel, PanelHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { projectScene } from "@/lib/render3d";
import {
  CATEGORY_LABEL,
  loadPartPack,
  meshToFaces,
  realPartMesh,
  type PackedPart,
  type PartShading,
} from "@/lib/partModels";

/**
 * The real part library.
 *
 * Everything on this page is drawn from `public/models/corvette.bin`: the actual
 * corvette meshes extracted from the game assets, rendered with the shipyard's
 * own software renderer at build time, so the static export ships finished SVG
 * with no runtime cost.
 */

export const metadata = {
  title: "Real Part Library · NMS Corvette Shipyard",
  description:
    "Every corvette part mesh extracted from the game, rendered from the real geometry.",
};

const SHADING: Record<string, PartShading> = {
  cockpit: { hull: [132, 190, 232], hullDark: [22, 38, 56], emissive: [150, 226, 255], glow: 0.9 },
  habitation: { hull: [176, 184, 196], hullDark: [30, 36, 46], emissive: [255, 196, 124], glow: 0.7 },
  landing: { hull: [152, 160, 172], hullDark: [26, 30, 38], emissive: [255, 150, 70], glow: 0.5 },
  thruster: { hull: [160, 170, 186], hullDark: [24, 30, 40], emissive: [255, 128, 48], glow: 1.0 },
  weapon: { hull: [138, 146, 158], hullDark: [22, 26, 34], emissive: [255, 92, 74], glow: 0.6 },
  shield: { hull: [128, 172, 220], hullDark: [20, 32, 52], emissive: [126, 214, 255], glow: 0.9 },
  reactor: { hull: [158, 166, 180], hullDark: [26, 30, 40], emissive: [150, 255, 196], glow: 1.0 },
  wing: { hull: [146, 156, 174], hullDark: [22, 28, 40], emissive: [120, 190, 255], glow: 0.45 },
  connector: { hull: [150, 156, 168], hullDark: [26, 30, 38], emissive: [255, 190, 120], glow: 0.4 },
  access: { hull: [154, 160, 172], hullDark: [28, 32, 42], emissive: [255, 200, 130], glow: 0.45 },
  interior: { hull: [168, 158, 142], hullDark: [32, 30, 28], emissive: [255, 214, 160], glow: 0.5 },
  structural: { hull: [140, 150, 166], hullDark: [22, 27, 37], emissive: [96, 176, 255], glow: 0.35 },
  decor: { hull: [176, 146, 112], hullDark: [36, 30, 24], emissive: [255, 182, 96], glow: 0.6 },
};

const FALLBACK: PartShading = {
  hull: [140, 150, 166],
  hullDark: [24, 28, 38],
  emissive: [120, 190, 255],
  glow: 0.4,
};

/** Curated picks so the page shows every family without shipping 589 renders. */
const HERO_IDS = [
  "B_COK_A", "B_COK_B", "B_COK_D",
  "B_HAB_A", "B_HAB_B", "B_HAB1_A",
  "B_LND_A", "B_LND_B", "B_LND_C",
  "B_TRU_A", "B_TRU_C", "B_TRU_E", "B_TRU_G",
  "B_TUR_A", "B_TUR_C", "B_TUR_E",
  "B_SHL_A", "B_SHL_B", "B_SHL_C",
  "B_GEN_0", "B_GEN_1", "B_GEN_2",
  "B_WNG_A", "B_WNG_C", "B_WNG_E", "B_WNG_G", "B_WNG_I", "B_WNG_K",
  "B_WNG_M", "B_WNG_O_0", "B_WNG_Q", "B_WNG_R",
  "B_ALK_A", "B_ALK_C", "B_CON_5", "B_CON_10", "B_CON_L_0", "B_CON2_0",
  "B_WALL_CARG0", "B_WALL_WIND0", "B_WALL_BUNK0", "B_WALL_TECH0",
  "B_STR_A_N", "B_STR_C_N", "B_STR_F_N", "B_STR_I_N", "B_STR_L_N",
  "B_DECO_C", "B_DECO_G", "B_DECO_K",
];

function PartCard({ part, size = 168, tris = 220 }: { part: PackedPart; size?: number; tris?: number }) {
  const shading = SHADING[part.category] ?? FALLBACK;
  const mesh = realPartMesh(part, shading, tris);
  if (!mesh) return null;
  const scene = projectScene(mesh, { yaw: -0.72, pitch: -0.36, zoom: 0.94 }, size, size, {
    padding: 1.28,
  });

  return (
    <div className="flex flex-col border border-white/10 bg-[#060b13]">
      <div
        className="relative"
        style={{
          background:
            "radial-gradient(ellipse at 50% 34%, #112435 0%, #070d17 58%, #04070d 100%)",
        }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" className="block" aria-hidden="true">
          {scene.faces.map((face, index) => (
            <polygon
              key={index}
              points={face.points}
              fill={face.fill}
              opacity={face.opacity}
              stroke={face.kind === "emissive" ? face.fill : "rgba(3,6,12,0.4)"}
              strokeWidth={face.kind === "emissive" ? 1.2 : 0.25}
            />
          ))}
        </svg>
        <span className="absolute left-2 top-2 font-mono text-[9px] uppercase tracking-[0.18em] text-sky-300/70">
          {CATEGORY_LABEL[part.category] ?? part.category}
        </span>
        <span className="absolute right-2 top-2 font-mono text-[9px] text-white/35">
          {part.tris} tris
        </span>
      </div>
      <div className="flex flex-col gap-1 px-3 py-2.5">
        <p className="truncate text-[13px] font-medium text-slate-100" title={part.name}>
          {part.name}
        </p>
        <p className="font-mono text-[10px] text-sky-300/80">{part.id}</p>
        <p className="font-mono text-[10px] text-white/40">
          {part.size[0].toFixed(2)} × {part.size[1].toFixed(2)} × {part.size[2].toFixed(2)} u
        </p>
      </div>
    </div>
  );
}

export default function ModelsPage() {
  const loaded = loadPartPack();

  if (!loaded) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <Panel>
          <PanelHeader icon="Info" title="Real part library unavailable" />
          <p className="px-5 py-4 text-sm text-slate-300">
            <code className="font-mono text-sky-300">public/models/corvette.bin</code> is missing.
            Rebuild it with:
          </p>
          <pre className="mx-5 mb-5 overflow-x-auto border border-white/10 bg-black/50 p-3 font-mono text-[11px] text-sky-200">
{`python3 scripts/unreal/build-part-models.py \\
  <path-to>/nms-base-builder/src/addons/no_mans_sky_base_builder/models/corvette`}
          </pre>
        </Panel>
      </div>
    );
  }

  const pack = loaded.manifest;
  const byId = new Map(pack.parts.map((p) => [p.id, p]));
  const heroes = HERO_IDS.map((id) => byId.get(id)).filter(Boolean) as PackedPart[];

  const counts: Record<string, number> = {};
  for (const p of pack.parts) counts[p.category] = (counts[p.category] ?? 0) + 1;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-sky-400/80">
          <Icon name="Layers" className="h-3.5 w-3.5" />
          <span>Real asset library</span>
        </div>
        <h1 className="text-3xl font-semibold text-slate-50 sm:text-4xl">
          {pack.count} corvette parts, straight from the game files
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
          These are the <strong className="text-slate-100">actual meshes</strong>, not
          stand-ins. Each one was converted from the corvette model set that ships with the
          No Man&apos;s Sky Base Builder add-on and keeps its real proportions — one snap cell
          measures <span className="font-mono text-sky-300">1.00 × 0.50 × 1.00</span> in
          shipyard units, so <span className="text-slate-100">every part lines up with every
          other part</span> the way it does in the Workshop.
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, n]) => (
              <Chip key={cat} accent="#38bdf8">
                <span className="font-mono text-[10px]">
                  {CATEGORY_LABEL[cat] ?? cat} · {n}
                </span>
              </Chip>
            ))}
        </div>
      </header>

      <Panel>
        <PanelHeader icon="Boxes" title={`Part families · showing ${heroes.length} of ${pack.count}`} />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {heroes.map((part) => (
            <PartCard key={part.id} part={part} />
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader icon="Ruler" title="Why parts now fit together" />
          <div className="flex flex-col gap-3 px-5 py-4 text-sm leading-relaxed text-slate-300">
            <p>
              Every corvette module is built on a fixed lattice. Measuring the real meshes shows
              one cell is{" "}
              <span className="font-mono text-sky-300">6.0 × 3.0 × 6.0</span> source units —
              a plain hull block (<span className="font-mono">B_STR_A_N</span>) is exactly
              6.00 × 3.00 × 6.14, and a habitation module (
              <span className="font-mono">B_HAB_A</span>) is 6.02 × 2.95 × 12.00, i.e. precisely
              two cells long.
            </p>
            <p>
              Parts also carry their facing in the asset name:{" "}
              <span className="font-mono text-sky-300">_N _S _E _W _NE _NW</span> mean the block
              opens towards north/south/east/west, and the engine-side components use the same
              codes, so a run of modules can only be assembled in directions the game allows.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader icon="Wrench" title="Rebuild the pack" />
          <div className="flex flex-col gap-3 px-5 py-4">
            <p className="text-sm text-slate-300">
              The converters are in the repo and take about six seconds:
            </p>
            <pre className="overflow-x-auto border border-white/10 bg-black/50 p-3 font-mono text-[10px] leading-relaxed text-sky-200">
{`python3 scripts/unreal/fbx.py           # FBX reader
python3 scripts/unreal/build-part-models.py \\
  ../nms-base-builder/src/addons/\\
no_mans_sky_base_builder/models/corvette

# -> public/models/corvette.{bin,json}`}
            </pre>
            <p className="font-mono text-[10px] text-white/45">
              {pack.bytes.toLocaleString()} bytes packed · source: {pack.source}
            </p>
          </div>
        </Panel>
      </div>

      <HudLabel>
        Converted from FBX · {pack.count} parts · {pack.bytes.toLocaleString()} bytes ·{" "}
        <Link href="/parts" className="text-sky-300 underline decoration-dotted">
          see the buyable catalogue
        </Link>
      </HudLabel>
    </div>
  );
}

// keep the tree-shaker honest about the helper we deliberately do not call here
void meshToFaces;
