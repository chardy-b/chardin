import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(rootDir, "src"),
      "server-only": path.join(rootDir, "tests/unit/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    maxWorkers: 1,
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
    exclude: [
      "node_modules",
      ".next",
      "tests/e2e",
      "tests/performance",
      "tests/production",
      "test-results",
      "playwright-report",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json", "json-summary"],
      reportsDirectory: "coverage",
      include: [
        "src/engine/**/*.ts",
        "src/components/experience/**/*.tsx",
        "src/lib/env.ts",
        "src/lib/errors.ts",
        "src/components/empty-state.tsx",
        "src/components/error-state.tsx",
        "src/components/theme-toggle.tsx",
        "src/components/mood-board.tsx",
        "src/components/ambient-scene.tsx",
        "src/data/projects.ts",
        "src/app/api/health/route.ts",
      ],
      exclude: [
        "src/components/ui/**",
        "**/*.d.ts",
        "**/*.{test,spec}.{ts,tsx}",
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 60,
        // Runtime regressions must not be diluted by legacy component coverage.
        "src/engine/**/*.ts": {
          lines: 85,
          statements: 85,
          functions: 85,
          branches: 75,
        },
      },
    },
  },
})
