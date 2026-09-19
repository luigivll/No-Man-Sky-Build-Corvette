import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The preview sandbox proxies the dev server under a dynamic host, so we
  // allow cross-origin dev requests instead of hard-failing the preview.
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  reactStrictMode: true,
};

export default nextConfig;
