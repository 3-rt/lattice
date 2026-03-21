import { describe, it, expect } from "vitest";
import { formatTable, statusIcon } from "../src/lib/format.js";

describe("formatTable", () => {
  it("should format rows into aligned columns", () => {
    const output = formatTable(
      ["Name", "Status"],
      [["claude-code", "online"], ["codex", "offline"]]
    );
    expect(output).toContain("Name");
    expect(output).toContain("claude-code");
    expect(output).toContain("codex");
  });

  it("should handle empty rows", () => {
    const output = formatTable(["Name"], []);
    expect(output).toContain("Name");
  });
});

describe("statusIcon", () => {
  it("should return green for online/completed", () => {
    expect(statusIcon("online")).toContain("\u25cf");
    expect(statusIcon("completed")).toContain("\u25cf");
  });

  it("should return red for offline/failed", () => {
    expect(statusIcon("offline")).toContain("\u25cf");
    expect(statusIcon("failed")).toContain("\u25cf");
  });
});
