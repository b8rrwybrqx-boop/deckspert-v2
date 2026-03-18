import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: path.join(process.cwd(), "../..")
};

export default nextConfig;
