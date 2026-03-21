import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // The SDK is a CLI package with no main/exports entry.
      // We mock it entirely in tests, so alias to a stub to satisfy Vite resolution.
      "@anthropic-ai/claude-code": new URL(
        "./tests/__mocks__/claude-code-sdk.ts",
        import.meta.url
      ).pathname,
    },
  },
});
