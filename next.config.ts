import type { NextConfig } from "next";

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
