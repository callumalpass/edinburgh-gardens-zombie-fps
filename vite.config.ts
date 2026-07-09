import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        "object-preview": "object-preview.html"
      }
    }
  },
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
    globals: false,
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.spec.ts", "**/*.bench.ts"]
  }
});
