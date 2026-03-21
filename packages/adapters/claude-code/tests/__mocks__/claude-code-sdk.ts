// Stub module for @anthropic-ai/claude-code SDK.
// The real SDK is a CLI package with no library exports.
// vi.mock() in tests replaces this with controlled mocks.
export async function query(_options: unknown): Promise<unknown[]> {
  throw new Error("query() stub — should be mocked in tests");
}
