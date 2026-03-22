import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRoutingStats } from "./api.ts";

describe("fetchRoutingStats", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches routing stats from the dashboard API", async () => {
    const payload = [
      {
        agent_name: "claude-code",
        category: "coding",
        successes: 9,
        failures: 1,
        total_latency_ms: 18000,
        total_cost: 1.25,
        updated_at: "2026-03-21T12:00:00.000Z",
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRoutingStats()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/routing/stats");
  });

  it("throws when the routing stats request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      })
    );

    await expect(fetchRoutingStats()).rejects.toThrow(
      "Failed to fetch routing stats: 503"
    );
  });
});
