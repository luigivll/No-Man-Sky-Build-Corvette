# NMS Corvette Shipyard

A companion web app for the **No Man's Sky "Corvette Workshop"** (Voyagers update, v6.0).
Browse every Corvette module, price a build before you spend a Unit, roll
role-weighted random hulls, and replicate iconic pop-culture ships with parts that
actually exist in the game.

Built with **Next.js (App Router) + React 19 + TypeScript + Tailwind CSS v4** and
**lucide-react** icons. Dark, neon, space-terminal aesthetic. No backend, no
database — everything runs client-side off two local JSON files.

---

## Quick start

```bash
# 1. install dependencies
npm install

# 2. start the dev server
npm run dev            # http://localhost:3000

# 3. production build + run
npm run build
npm start
```

Extra scripts:

```bash
npm run typecheck      # tsc --noEmit
npm run verify         # headless sanity check of the data + generator logic
```

> `npm run verify` proves the important stuff without a browser: every iconic
> blueprint compiles into a **legal** Corvette (all Workshop minimums met, under
> the 160-module cap), seeds are deterministic, salvage-first mode really cuts the
> vendor bill, and combat hulls out-gun minimalist ones.

---

## What's inside

### 1. Home dashboard (`/`)
Mode selector, Corvette Workshop briefing (where the terminal is, how salvage
works, part limits) and the live flight-certification checklist. Also shows the
build you currently have in progress.

### 2. Manual Builder (`/builder`)
A step-by-step form that follows the order the Workshop expects:
Cockpit → Reactor → Habitation → Access Bay → Wings → Weapons → Shields →
Main Engine → Light Thrusters → Landing Gear → **Review & Shopping List**.

Every module you place updates in real time:
* a procedural **top-down hull schematic** (built from your actual parts)
* a 5-axis **stat radar** (damage / shield / manoeuvrability / hyperdrive / cargo)
* the **part budget** meter (x/160) and flight-certification checks
* the **shopping list** — buyable-at-vendor vs salvage-only, with costs

### 3. Randomizer & Role Generator (`/randomizer`)
Toggle role filters — **Combat**, **Exploration**, **Massive/Freighter-lite**,
**Minimalist** — plus hull size, salvage-first sourcing and symmetry lock.

Role logic is deliberate, not cosmetic:
* **Combat** hard-locks a Deadeye Cannon + High-Energy Shield, pushes 3-6 hardpoints and 2+ shield generators
* **Exploration** forces the Zenith-Class reactor (best warp range) and adds Hab/Walkway slots while capping weapons
* **Massive** forces multiple Habitation modules and Heavy Landing Gear, adds main engines/landing bays and pads toward the cap
* **Minimalist** clamps the hull (≤ 24 modules at any size preset), strips plating and favours light parts

Rolls are **seeded and deterministic**, and the options are written into the URL
(`/randomizer?roles=combat,exploration&size=heavy&seed=12345`), so a link
reproduces the exact same ship for anyone who opens it. Generated hulls get a
procedural name ("The Void Leviathan", "MSV Warhammer M-5427") plus a written
rationale for the part choices.

### 4. Iconic Ship Blueprints — the "Badass Hangar" (`/blueprints`)
Eleven pre-made blueprint sheets: Millennium Falcon, T-65 X-Wing, Imperial Star
Destroyer, UNSC Pelican, The Rocinante, USS Enterprise, Serenity, Viper Mk II,
SSV Normandy SR-2, USCSS Nostromo and Thunderbird 2.

Each sheet lists every module with quantities and notes, marks optional cosmetic
parts, prices the vendor-buyable against the salvage-only modules, adds the
C → S Nanite bill, projects the silhouette and stat radar, and gives build tips
for making the shape read in-game. Load any blueprint into the builder and remix it.

### 5. Parts Codex (`/parts`)
The whole database, searchable/filterable/sortable, with prices, sourcing, mass
and per-stat contributions. One click drops a module into your active build.

### 6. My Hangar (`/hangar`)
Builds saved to `localStorage` (up to 40). Load them back into the builder, export
their shopping lists, or pin one as the active build.

---

## Data

Everything is driven by two files — edit them and the whole app re-prices and
re-renders itself:

| File | Contents |
| --- | --- |
| `data/parts.json` | 50 Corvette modules across 10 categories, with prices, sourcing, rarity, mass, cargo slots and stat weights |
| `data/blueprints.json` | The 11 pop-culture recipes, referencing part ids from `parts.json` |

`data/parts.json` also carries game rules used throughout the UI: the 160-module
cap, the 100-module soft cap, the 3-floor height recommendation, the 11 reactor
tech module limit, the ~7,630,000 Unit starter set and the ~85,000 Nanite
C → S-class upgrade.

**Workshop minimums encoded in the app** (from the referenced guides):
1 Cockpit, 1 Reactor, 1 Habitation Module, 1 Landing Bay (Access Module),
1 Main Engine, 2 Light Thrusters, 2 Landing Gear and 1 Weapon System.
Older/pre-6.0 builds only needed 1 thruster and 1 landing gear, so the UI shows
both values where they differ.

> Prices for vendor-buyable modules are the in-game Workshop prices. Salvage-only
> modules (e.g. Arcadia Heavy Booster, Aeron Powershield, Heavy Landing Gear)
> are not purchasable, so they show an estimated market value instead — that is
> flagged in the UI and in the data file's `meta.priceDisclaimer`.

---

## Project structure

```
data/
  parts.json              # module database + game rules
  blueprints.json         # pop-culture ship recipes
scripts/
  verify-logic.ts         # headless data + generator tests (npm run verify)
src/
  app/
    layout.tsx            # shell: fonts, navbar, footer, build context
    page.tsx              # home dashboard / mode selector
    builder/page.tsx      # manual step-by-step builder
    randomizer/page.tsx   # role-weighted generator
    blueprints/page.tsx   # blueprint grid
    blueprints/[slug]/    # blueprint sheet
    parts/page.tsx        # searchable parts codex
    hangar/page.tsx       # saved builds
  components/
    BuildProvider.tsx     # React Context + localStorage persistence
    HullSchematic.tsx     # procedural top-down SVG ship preview
    StatRadar.tsx         # 5-axis performance radar
    ShoppingList.tsx      # buy/salvage list with tracker + export/print
    RequirementTracker.tsx# flight certification + part budget
    PartPicker.tsx / PartRow.tsx
    BlueprintSheet.tsx    # full blueprint sheet UI
    Navbar.tsx / Footer.tsx / ui.tsx / Icon.tsx
  lib/
    build.ts              # build math: stats, costs, requirements, markdown export
    randomizer.ts         # role weighting, sizing, guarantees
    schematic.ts          # hull layout geometry
    names.ts              # seeded RNG + procedural ship names
    data.ts / types.ts    # typed access to the JSON databases
```

## Notes

* Fonts (Orbitron / Rajdhani / JetBrains Mono) are self-hosted via Fontsource,
  so no network access is needed at build or run time.
* The dev server binds to `0.0.0.0` when started with `next dev -H 0.0.0.0`, and
  `next.config.ts` allows the sandbox/preview origins.
* This is an unofficial fan tool. No Man's Sky is a trademark of Hello Games Ltd;
  pop-culture ship names belong to their respective rights holders.
