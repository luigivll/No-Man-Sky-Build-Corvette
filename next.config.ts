import type { NextConfig } from "next";

/**
 * Hosts allowed to load dev assets. The sandbox previews the app behind a
 * `*.e2b.app` proxy, so without this Next logs a cross-origin warning and will
 * eventually refuse the request outright.
 */
const devOrigins = [
  "*.e2b.app",
  ...(process.env.ALLOWED_DEV_ORIGINS?.split(",").filter(Boolean) ?? []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: devOrigins,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  webpack: (config) => {
    // three.js ships ESM builds; keep source maps cheap and silence the
    // "Critical dependency" noise coming from its dynamic shader imports.
    config.externals = [...(config.externals ?? [])];
    return config;
  },
};

export default nextConfig;
