import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5480,
    strictPort: true,
    watch: {
      ignored: ["**/test-results/**", "**/playwright-report/**", "**/dist/**"]
    }
  },
  test: {
    environment: "node",
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.spec.ts", "**/*.bench.ts"]
  }
});
