# Real part models (optional, local only)

Drop extracted Corvette part meshes in this folder and the ship preview will use
them instead of the built-in generated geometry.

* One file per part, named after the part id from `data/parts.json`:
  `cockpit-titan.obj`, `wing-osprey.obj`, `engine-main-arcadia.obj`, ...
* Wavefront `.obj` (exported from Blender, Z-up imported models are fine).
* Meshes are normalised to the part's `geometry.span` from the database, and the
  socket positions still come from `parts.json`, so a loaded model keeps bolting
  to the right place on the hull.

These files are **not** committed: `.gitignore` excludes everything here except
this README. They are Hello Games' assets - keep them on your own machine.
