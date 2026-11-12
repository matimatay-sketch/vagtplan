import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.test.ts"],
      // Floor, not target: raise when coverage improves, never lower.
      thresholds: { lines: 97, branches: 88, functions: 95, statements: 95 },
    },
  },
});
