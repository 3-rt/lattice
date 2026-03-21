// packages/relay/tests/categorizer.test.ts
import { describe, it, expect } from "vitest";
import { categorize, CATEGORY_MAP } from "../src/categorizer.js";

describe("categorize", () => {
  it("should classify debugging keywords", () => {
    expect(categorize("fix the bug in auth module")).toBe("debugging");
    expect(categorize("debug this error")).toBe("debugging");
  });

  it("should classify code-review keywords", () => {
    expect(categorize("review the PR for payments")).toBe("code-review");
    expect(categorize("check this pull request")).toBe("code-review");
  });

  it("should classify code-generation keywords", () => {
    expect(categorize("write a new endpoint")).toBe("code-generation");
    expect(categorize("implement user authentication")).toBe("code-generation");
    expect(categorize("create a REST API")).toBe("code-generation");
    expect(categorize("add a test for the router")).toBe("code-generation");
  });

  it("should classify refactoring keywords", () => {
    expect(categorize("refactor the database module")).toBe("refactoring");
    expect(categorize("clean up the utils")).toBe("refactoring");
    expect(categorize("restructure the project layout")).toBe("refactoring");
  });

  it("should classify messaging keywords", () => {
    expect(categorize("send a notification to the team")).toBe("messaging");
    expect(categorize("notify the user via email")).toBe("messaging");
    expect(categorize("post a message in slack")).toBe("messaging");
  });

  it("should return 'general' when no keywords match", () => {
    expect(categorize("do something random")).toBe("general");
    expect(categorize("")).toBe("general");
  });

  it("should be case-insensitive", () => {
    expect(categorize("FIX the BUG")).toBe("debugging");
    expect(categorize("WRITE a new service")).toBe("code-generation");
  });

  it("should pick the category with the most keyword hits", () => {
    // "fix" = debugging, "write" + "create" = code-generation (2 hits wins)
    expect(categorize("write and create something, also fix a typo")).toBe("code-generation");
  });

  it("should export the CATEGORY_MAP for introspection", () => {
    expect(CATEGORY_MAP).toBeDefined();
    expect(typeof CATEGORY_MAP).toBe("object");
    expect(Object.keys(CATEGORY_MAP).length).toBeGreaterThanOrEqual(5);
  });
});
