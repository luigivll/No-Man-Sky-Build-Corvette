import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
