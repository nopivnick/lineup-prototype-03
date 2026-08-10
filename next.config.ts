import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["mantine-datatable"],

  turbopack: {
    // Pin the workspace root. Without it Turbopack walks up looking for a
    // lockfile and can settle on one outside the repository entirely.
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
