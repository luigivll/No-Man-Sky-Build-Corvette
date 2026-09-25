#!/usr/bin/env node
/**
 * Local launcher: serves the static export in `out/` on 127.0.0.1 and opens a
 * browser. No dependencies, no internet, no build step at run time - this is the
 * "double-click and it works" path for people who just want to use the shipyard.
 *
 *   npm run start:local
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

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

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".obj": "text/plain; charset=utf-8",
};

/** Resolve a request path to a real file inside out/, never escaping it. */
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const relative = normalize(clean).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const candidates = [
    join(root, relative),
    join(root, relative, "index.html"),
    `${join(root, relative)}.html`,
  ];
  for (const candidate of candidates) {
    if (!candidate.startsWith(root)) continue;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  const fallback = join(root, "404.html");
  return existsSync(fallback) ? fallback : null;
}

const server = createServer((req, res) => {
  const file = resolveFile(req.url ?? "/");
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404");
    return;
  }
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const status = file.endsWith("404.html") && req.url !== "/404/" ? 404 : 200;
  res.writeHead(status, {
    "content-type": type,
    // local tool: never serve a stale page after a rebuild
    "cache-control": "no-cache",
  });
  createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}/`;
  console.log(`\n  NMS Corvette Shipyard\n  running at ${url}\n  press Ctrl+C to stop\n`);
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  // spawn failures arrive as an async "error" event, not a throw, so the
  // handler is what keeps a headless box from taking the server down with it
  const child = spawn(opener, [url], {
    shell: process.platform === "win32",
    stdio: "ignore",
    detached: true,
  });
  child.on("error", () => {
    console.log("  (could not open a browser automatically - open the URL above)\n");
  });
  child.unref();
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\n  Port ${port} is busy. Try:  PORT=4180 npm run start:local\n`);
    process.exit(1);
  }
  throw error;
});
