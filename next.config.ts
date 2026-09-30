import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

/**
 * A stamp the UI can show, so "am I looking at the current build?" stops being a
 * guess.
 *
 * The preview iframe kept serving a cached bundle after a fix and the only way
 * to tell was to recognise a step label from memory. This bakes the version and
 * the commit that the server actually started from into the client bundle;
 * NEXT_PUBLIC_* is inlined at compile time, so whatever the footer prints is
 * what this process is running.
 */
function buildStamp(): string {
  let version = "?";
  try {
    version = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version;
  } catch {
    /* a missing package.json is not worth failing a build over */
  }
  let commit = "nogit";
  try {
    commit = execSync("git rev-parse --short HEAD", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    /* the packaged app has no git checkout */
  }
  const dirty = (() => {
    try {
      return execSync("git status --porcelain", { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim().length
        ? "+"
        : "";
    } catch {
      return "";
    }
  })();
  return `v${version} · ${commit}${dirty}`;
}

/**
 * Two build modes:
 *
 *  - default (`next dev` / `next build`): normal server build, used by the
 *    sandbox preview and by `npm start`.
 *  - `STATIC_EXPORT=1`: emits a folder of plain files into `out/` that can be
 *    served by any static host - or by the bundled launcher
 *    (`npm run start:local`) for a fully offline, zero-dependency local app.
 */
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD: buildStamp() },
  // The preview sandbox proxies the dev server under a dynamic host, so we
  // allow cross-origin dev requests instead of hard-failing the preview.
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  reactStrictMode: true,
  ...(staticExport
    ? {
        output: "export" as const,
        // the launcher serves the folder itself, so no image optimiser needed
        images: { unoptimized: true },
        // "route/index.html" instead of "route.html" - survives every static
        // host, including ones that do not rewrite extensionless paths
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
