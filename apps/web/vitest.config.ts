import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { environment: "node", include: ["test/**/*.test.ts"], testTimeout: 20000 },
  resolve: { alias: [{ find: /^@\//, replacement: fileURLToPath(new URL(".", import.meta.url)) }] },
});
