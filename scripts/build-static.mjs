#!/usr/bin/env node
/**
 * Static export build, portable across shells.
 *
 * `STATIC_EXPORT=1 next build` only works in a POSIX shell. On Windows it is not
 * an assignment at all — cmd reads `STATIC_EXPORT` as a command, fails, and the
 * user is left staring at "no se reconoce como un comando interno". That broke
 * both `npm run build:static` and `iniciar.bat`, which is the double-click path
 * the whole offline story rests on.
 *
 * So the flag is set here, in Node, where every platform agrees on what an
 * environment variable is.
 *
 *   node scripts/build-static.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "out");

// A stale export can silently keep pages that no longer exist, so it goes first.
if (existsSync(out)) {
  rmSync(out, { recursive: true, force: true });
  console.log("  cleared out/");
}

const isWindows = process.platform === "win32";
const child = spawn(isWindows ? "npx.cmd" : "npx", ["next", "build"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, STATIC_EXPORT: "1" },
});

child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(`  could not run the build: ${error.message}`);
  process.exit(1);
});
