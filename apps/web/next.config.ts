import type { NextConfig } from "next";

// Cache Components is intentionally off: nearly every page is per-user and
// RLS-scoped, so a static shell buys nothing. See CLAUDE.md.
const nextConfig: NextConfig = {
  transpilePackages: ["@vagtplan/rules-engine"],
  // The PDF guides are rendered on the server and include the screenshots.
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: { "/vejledninger/[slug]/pdf": ["./public/vejledninger/**"] },
  // Receipts (udlæg) are uploaded through a server action; the bucket allows 10 MiB.
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
