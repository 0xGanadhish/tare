import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server code reads fixtures/ with fs at runtime; make sure Vercel bundles them.
  outputFileTracingIncludes: {
    "/**": ["./fixtures/**/*"],
  },
};

export default nextConfig;
