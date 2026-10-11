import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The repo root, so Next does not guess a parent folder with a stray lockfile.
  outputFileTracingRoot: path.join(here, "..", ".."),
  // The workspace packages ship TypeScript source.
  transpilePackages: ["@logwizard/plan-schema", "@logwizard/engine-logic"],
  webpack(config) {
    // plan-schema imports "./file.js" for "./file.ts".
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
