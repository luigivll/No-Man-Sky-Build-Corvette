# Importing real game data (optional)

The shipyard ships with a hand-authored dataset (`data/parts.json`) so it runs
with nothing installed. If you own No Man's Sky you can replace that dataset with
the real thing, and optionally feed the real meshes into the preview.

Nothing in this folder is required for the app to work. Everything below is a
local, personal-use workflow: **never commit extracted game assets** - see the
licence note at the bottom.

---

## 1. Unpack the game archives (you)

No Man's Sky stores its assets in `.pak` files (PSARC archives) under
`GAMEDATA/PCBANKS`. Community tools:

| Tool | Does | Where |
| --- | --- | --- |
| **PSArcTool** | extracts / repacks `.pak` | `github.com/periander/PSArcTool` |
| **MBINCompiler** | `.MBIN` ⇄ `.EXML` (binary ⇄ readable XML) | `github.com/monkeyman192/MBINCompiler` |

Usage is drag-and-drop: drop a `.pak` on `PSArcTool.exe` to unpack, then drop the
`.MBIN` files you care about on `MBINCompiler.exe` to get `.EXML` you can read.

A full unpack is ~30 GB, so extract one archive at a time and look for the
Corvette module entries rather than unpacking everything.

## 2. What to look for

* **Module definitions** - the Corvette build pieces are data objects. Their
  `.EXML` carries the real id, display name, price, category and the socket /
  attachment flags. **This is the file that matters most** and it is small.
* **Meshes** - model meshes live in `.GEOMETRY.MBIN` files (ship assets sit under
  `models/…`). Converting those to something renderable is the hard part; export
  them to `.obj` with Blender rather than trying to decode them by hand.

To find the module definitions, extract one archive and search the extracted tree
for `CORVETTE`, `SHIPMODULE`, `BUILDABLE` or plain `corvette` in the file names.
`.MBIN` files are binary until you drop them on MBINCompiler, which writes the
`.EXML` next to them.

## 3. How to hand the files over

The sandbox this app is developed in **cannot reach GitHub's release-asset
domain** (`release-assets.githubusercontent.com` is firewalled), so uploading the
raw `.pak` to a Release does not help: it can be uploaded but not downloaded
again. Git itself does work, and so do chat attachments. Two routes:

| Route | Best for | How |
| --- | --- | --- |
| **Chat attachment** | Anything up to a few MB - all the `.EXML` you need is small text | Attach the files (or a `.zip`) in the conversation |
| **Git branch** | Bigger sets, or anything you want to keep | Put the files in `game-data/` and push a branch; the folder is read from there |

Note that the raw `.pak` (250-300 MB) cannot go through git either: GitHub rejects
files over 100 MB. Convert to `.EXML` first - that is where all the readable data
lives, and it is what the import actually consumes.

## 4. Feeding the app

Two independent upgrades, either one is useful on its own:

### A. Real module data  → fixes wrong / invented parts

Send the module `.EXML` files (or a dump of them) and they get normalised into
`data/parts.json`:

```bash
npm run import:data -- <folder-with-exml>     # (script added when the format is known)
npm run verify                                # every blueprint must still be legal
```

This is what makes the parts list *correct*: no invented modules, real prices,
real categories, real mount types.

### B. Real meshes → fixes the blocky look

Put one mesh per part id in `public/models/`, named after the part:

```
public/models/cockpit-titan.obj
public/models/wing-osprey.obj
public/models/engine-main-arcadia.obj
```

Wavefront `.obj` is the recommended format - export from Blender (or any tool that
can import the extracted meshes) with the part in its own local space. The loader:

* normalises each model to that part's real size from `parts.json`,
* keeps the sockets defined in `parts.json`, so a real model still bolts to the
  correct place on the hull and cannot float,
* falls back to the built-in generated geometry for any part with no model.

Everything in `public/models/` except its README is git-ignored.

---

## Licence note

Extracted assets are Hello Games' property. Keep them on your own machine, do not
commit them and do not publish builds that contain them. Only the derived,
factual numbers (module names, prices, slot counts) belong in a public dataset,
and even that is a grey area worth respecting.
