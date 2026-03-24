import { describe, it, expect } from "vitest";
import { translateError } from "../src/error-messages.js";

describe("translateError", () => {
  it("should translate 'missing scope' errors", () => {
    const result = translateError("missing scope: operator.write");
    expect(result.message).toContain("doesn't have permission");
    expect(result.message).toContain("operator.write");
    expect(result.detail).toBe("missing scope: operator.write");
  });

  it("should translate ENOENT errors", () => {
    const result = translateError("spawn claude ENOENT");
    expect(result.message).toContain("CLI tool isn't installed");
    expect(result.detail).toBe("spawn claude ENOENT");
  });

  it("should translate connection timeout errors", () => {
    const result = translateError("OpenClaw gateway connection timeout");
    expect(result.message).toContain("Couldn't reach");
    expect(result.detail).toBe("OpenClaw gateway connection timeout");
  });

  it("should translate ECONNREFUSED errors", () => {
    const result = translateError("connect ECONNREFUSED 127.0.0.1:18789");
    expect(result.message).toContain("Connection refused");
    expect(result.detail).toBe("connect ECONNREFUSED 127.0.0.1:18789");
  });

  it("should translate rate limit errors", () => {
    const result = translateError("rate limit exceeded");
    expect(result.message).toContain("rate limit");
    expect(result.detail).toBe("rate limit exceeded");
  });

  it("should translate auth errors", () => {
    const result = translateError("unauthorized: invalid token");
    expect(result.message).toContain("Authentication failed");
    expect(result.detail).toBe("unauthorized: invalid token");
  });

  it("should translate openclaw response timeout", () => {
    const result = translateError("OpenClaw response timed out");
    expect(result.message).toContain("too long to respond");
    expect(result.detail).toBe("OpenClaw response timed out");
  });

  it("should translate openclaw not connected", () => {
    const result = translateError("OpenClaw gateway not connected");
    expect(result.message).toContain("Lost connection");
    expect(result.detail).toBe("OpenClaw gateway not connected");
  });

  it("should translate claude exit code errors", () => {
    const result = translateError("claude exited with code 1");
    expect(result.message).toContain("Claude encountered an error");
    expect(result.detail).toBe("claude exited with code 1");
  });

  it("should pass through unknown errors unchanged", () => {
    const result = translateError("something completely unknown");
    expect(result.message).toBe("something completely unknown");
    expect(result.detail).toBeUndefined();
  });

  it("should handle empty string", () => {
    const result = translateError("");
    expect(result.message).toBe("");
    expect(result.detail).toBeUndefined();
  });
});
