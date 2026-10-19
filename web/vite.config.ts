import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [
        ".",
        fileURLToPath(new URL("../docs/design/design-system", import.meta.url)),
        fileURLToPath(new URL("../fixtures/backtest", import.meta.url)),
      ],
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
  },
});
