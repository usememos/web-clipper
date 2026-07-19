import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": resolve(__dirname, "src") };

export default defineConfig({
  test: {
    // Two projects so pure-logic tests run in Node and component/DOM tests run in
    // jsdom, without paying jsdom's cost for the lib suite.
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          globals: true,
          environment: "node",
          include: ["src/lib/**/*.test.ts", "src/**/*.node.test.ts"],
          exclude: ["src/**/*.dom.test.{ts,tsx}"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "dom",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.dom.test.{ts,tsx}"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/test/**", "src/**/__tests__/**", "src/**/main.tsx"],
      thresholds: { statements: 75, branches: 75, functions: 75, lines: 80 },
    },
  },
});
