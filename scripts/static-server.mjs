/**
 * Zero-dependency static file server for the built app (`out/`).
 *
 * Shared by the CLI launcher (`scripts/start-local.mjs`) and the Electron shell
 * (`electron/main.cjs`), so both serve the exactly same bundle the same way.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".obj": "text/plain; charset=utf-8",
};

/** Resolve a URL path to a real file inside root, never escaping it. */
export function resolveFile(root, urlPath) {
  const clean = decodeURIComponent(String(urlPath).split("?")[0].split("#")[0]);
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

/** Starts the server and resolves with the port it actually bound to. */
export function startStaticServer(root, { port = 4173, host = "127.0.0.1" } = {}) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const file = resolveFile(root, req.url ?? "/");
      if (!file) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("404");
        return;
      }
      const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
      const status = file.endsWith("404.html") && req.url !== "/404/" ? 404 : 200;
      res.writeHead(status, { "content-type": type, "cache-control": "no-cache" });
      createReadStream(file).pipe(res);
    });
    server.on("error", reject);
    server.listen(port, host, () => resolve({ server, port: server.address().port }));
  });
}
