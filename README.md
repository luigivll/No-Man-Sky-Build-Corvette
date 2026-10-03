# NMS Corvette Shipyard

An interactive 3D blueprint studio for the **No Man's Sky Corvette Workshop**
(Voyagers). Design a corvette visually, validate it against the real build
rules, then export a printable PDF blueprint or a JSON blob for
[GoatFungus's NMSSaveEditor](https://github.com/goatfungus/NMSSaveEditor).

```
npm install
npm run dev        # http://localhost:3000
npm run verify     # typecheck + 47 tests + production build
```

---

## Architecture

Clean layering: **domain** describes the game, **engine** decides what is
legal, **three** draws it, **app/components** is the interface. Nothing imports
upwards.

```
src/
├── domain/          Pure data + maths. No React, no three.js.
│   ├── types.ts         Shared vocabulary (PartDef, SnapNode, Placement, Vec3…)
│   ├── constants.ts     Hard rules: 160 modules, 3 decks, flight minimum,
│   │                    categories, design tags, design bases
│   ├── vec.ts           Vec3, Mat3, Basis, AABB/OBB maths (projectHalf, eulerToBasis)
│   ├── snap-nodes.ts    Snap-node factory: module faces + hardpoints
│   ├── parts.ts         72-module catalogue, each with size, nodes, sceneId
│   └── palettes.ts      12 paint schemes
│
├── engine/          Deterministic, side-effect free.
│   ├── assembly.ts      Snaps placements into world transforms, computes stats
│   ├── validation.ts    Flight minimum, one cockpit, deck advice, collisions
│   ├── generator.ts     Seeded random fusion generator (tag × base × seed)
│   └── blueprint.ts     Expands the 50 Hangar ships into placements
│
├── data/blueprints/ The Badass Hangar — 50 pop-culture corvettes
│   ├── star-wars.ts (10) · marvel.ts (4) · dc.ts (4)
│   ├── classic-scifi.ts (18) · anime.ts (10) · videogames.ts (4)
│
├── three/           Rendering. Extracted meshes first, procedural fallback.
│   ├── ModelRegistry.ts  /models/manifest.json → GLB cache
│   ├── geometry.ts       ~50 procedural recipes → merged hull/detail/glass/glow
│   ├── PartMesh.tsx      4 material buffers, selection outline, exploded offset
│   └── Scene.tsx         ShipCanvas, camera rig, lighting, PNG capture
│
├── export/
│   ├── part-ids.ts    UI name → internal ObjectId/ItemId mapping
│   ├── nms-save.ts    Save-editor payloads + paste instructions
│   └── pdf/           @react-pdf/renderer document + payload builder
│
├── lib/             store.ts (zustand), useAssembly, download, cx
├── components/      LibraryPanel · InspectorPanel · ExportMenu · ui
└── app/             page.tsx shell + /api/blueprint (server-side PDF)
```

---

## The snap system

Nothing floats, because nothing is ever positioned by hand. Every part exposes
two families of **snap nodes**, each carrying a position, an `outward` normal,
a spread axis, a slot count and a category filter.

| Family | Ids | Behaviour |
| --- | --- | --- |
| Module faces | `front` `rear` `port` `starboard` `top` `bottom` | The child keeps the parent's orientation — this is how the game chains habitation modules, walkways and cockpits. |
| Hardpoints | `hp-front` `hp-rear` `hp-port` `hp-starboard` `hp-top` `hp-bottom` | The child is rotated so its local `+Z` points along the surface normal — weapons, thrusters, foils, plating. |

The assembler resolves a placement like this:

```
extent          = projectHalf(child.size / 2, unrotateByBasis(outward, R_childLocal))
childCenterLocal = node.position
                 + outward * extent
                 + spread * (i - (n - 1) / 2) * spacing     // sibling i of n
                 + placement.offset
worldPos        = parentWorldPos + R_parent · childCenterLocal
```

Two details that cost real debugging time and are now covered by tests:

- **Module nodes never rotate the child.** Adding a direction-dependent
  rotation made every `rear → rear` chain flip 180°, which produced the
  ship-wide collisions the test suite originally reported.
- **Sibling spacing adapts to the child's size.** Two boosters on the same
  rear hardpoint are spread by `max(node.spacing, spreadExtent * 2 + 0.2)`, so
  a wide part cannot overlap its neighbour.

Collision detection is snap-chain aware: parts that share a parent/child
lineage are exempt, everything else is tested as oriented bounding boxes with a
`COLLISION_TOLERANCE` of 0.45 units.

---

## Build rules

| Rule | Value |
| --- | --- |
| Hard module cap | **160** |
| Recommended storeys | **3** (counted as habitation decks) |
| Flight minimum | Landing Gear + Cockpit + Landing Bay + Habitation + Reactor + Thruster + Weapon |
| Cockpits | exactly **1** |
| Engines | unlimited, and mixing types is legal |
| Landing gears | unlimited, mixed types legal, minimum 1 |

`validation.ts` returns structured issues (`error` / `warning` / `info`) that
drive the Inspector, the PDF and the Hangar's flyable badge.

---

## The Badass Hangar

50 hand-tuned ships: **Star Wars 10 · Marvel 4 · DC 4 · Classic Sci-Fi/Cinema/TV 18 ·
Anime 10 · Videogames 4**. Each entry declares an archetype, a module list with
explicit snap targets, and a paint scheme.

`blueprints.test.ts` asserts that all 50 expand, resolve, and come back
`flyable: true`. Cross-branch intersections are reported as warnings rather than
errors — currently 22 across the whole set, worst offender 4.

---

## Exports

**PDF** — `POST /api/blueprint` renders server-side with `@react-pdf/renderer`:
rendered view, exact shopping list with Unit costs, and a breadth-first,
step-by-step assembly order ("attach *Titan Sublight Thruster* to the rear face
of the reactor"). The payload builder is pure and unit-tested.

**NMSSaveEditor** — two modes:

- *Exportar Nave Completa* → `shipOwnershipEntry` + the base `Objects` array.
  Paste `Objects` into `BaseContext > PlayerStateData > PersistentPlayerBases[i] >
  Objects` (**Objects only** — UIDs differ between saves) plus the matching
  `ShipOwnership[i]`. The ship-origin base part is `^U_PARAGON` and must sit at
  `0,0,0`.
- *Exportar Piezas al Inventario* → the `Inventory.Slots` array for
  `BaseContext > PlayerStateData > Inventory`, or `CorvetteStorageInventory` for
  the workshop cache. Expedition saves start at `ExpeditionContext`.

> **Honest caveat.** Only the *shape* of in-game ObjectIds is publicly
> documented (`S_CANOPY_WALL0`, `BIG_COK1X2_A`…). Every entry in
> `src/export/part-ids.ts` carries a `verified` boolean, and the UI surfaces the
> unverified ones so you can correct them against your own save. The mapping is
> editable in-app and persists to `localStorage`.

---

## Using real in-game meshes

The shipyard ships with procedural meshes that approximate each module. To use
the actual game models:

1. **PSARCTool** (Periander) — unpack the game `.pak` into loose files.
2. **MBINCompiler / libMBIN** (monkeyman192) — decompile `.MODEL.MBIN` / `.GEOM.MBIN`.
3. **NMSDK** Blender add-on (monkeyman192 / gregkwaste) — import the module.
4. Blender ▸ Export ▸ **glTF 2.0 (.glb)**, one file per module, named after its
   scene node: `BIG_COK1X2_A.glb`, `BIG_HAB1X2_B.glb`, …
5. Drop the `.glb` files in `public/models/` and run:

   ```bash
   npx tsx scripts/prepare-models.ts public/models
   ```

   That writes `public/models/manifest.json`. Anything not present keeps the
   procedural fallback, so you can convert a handful of modules at a time.

The extracted assets are Hello Games' intellectual property and are deliberately
**not** committed to this repository.

---

## Conventions

- **Axes:** `+Z` forward, `+Y` up, `+X` starboard. **1 build unit ≈ 1.5 m.**
- **Rotations:** euler in YXZ order, radians internally, degrees in the UI.
- **UI copy:** English. **Replies to you:** Spanish.
- **Tests:** `npm test` — 47 tests across assembly, blueprints, the generator
  and both exporters.
