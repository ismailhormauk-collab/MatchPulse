import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Original articles are read from content/news at request time; ship them
  // with every server function (e.g. on Vercel).
  outputFileTracingIncludes: {
    "/**": ["./content/news/**/*.md"],
  },
  images: {
    // Club crests supplied in API-Football responses (validated by safeLogoUrl).
    remotePatterns: [
      { protocol: "https", hostname: "media.api-sports.io", pathname: "/football/**", search: "" },
      { protocol: "https", hostname: "*.api-sports.io", pathname: "/football/**", search: "" },
    ],
    // Crests rarely change; keep optimised copies for a week.
    minimumCacheTTL: 604800,
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
