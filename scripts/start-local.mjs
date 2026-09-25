#!/usr/bin/env node
/**
 * Local launcher: serves the static export in `out/` on 127.0.0.1 and opens a
 * browser. No dependencies, no internet, no build step at run time - this is the
 * "double-click and it works" path for people who just want to use the shipyard.
 *
 *   npm run start:local
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { startStaticServer } from "./static-server.mjs";

const root = resolve(fileURLToPath(new URL("../out", import.meta.url)));
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "127.0.0.1";

if (!existsSync(root)) {
  console.error(
    "\n  No static build found in out/.\n" +
      "  Run:  npm install && npm run build:static\n",
  );
  process.exit(1);
}

let started;
try {
  started = await startStaticServer(root, { port, host });
} catch (error) {
  if (error && error.code === "EADDRINUSE") {
    console.error(`\n  Port ${port} is busy. Try:  PORT=4180 npm run start:local\n`);
    process.exit(1);
  }
  throw error;
}

const url = `http://${host}:${started.port}/`;
console.log(`\n  NMS Corvette Shipyard\n  running at ${url}\n  press Ctrl+C to stop\n`);

const opener =
  process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
// spawn failures arrive as an async "error" event, not a throw, so the handler
// is what keeps a headless machine from taking the server down with it
const child = spawn(opener, [url], {
  shell: process.platform === "win32",
  stdio: "ignore",
  detached: true,
});
child.on("error", () => {
  console.log("  (could not open a browser automatically - open the URL above)\n");
});
child.unref();
