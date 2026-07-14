import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "istanbul",
      reporter: ["json-summary", "text"],
      include: ["src/plugin/**/*.ts", "src/push/**/*.ts", "src/scanner/**/*.ts"],
      exclude: ["src/plugin/**/*.test.ts", "src/push/**/*.test.ts", "src/scanner/**/*.test.ts"],
    },
  },
});
