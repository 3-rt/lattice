import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/relay",
      "packages/adapters/claude-code",
      "packages/adapters/openclaw",
      "packages/adapters/codex",
    ],
  },
});
