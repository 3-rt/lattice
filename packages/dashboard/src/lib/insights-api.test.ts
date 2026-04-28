import { afterEach, describe, expect, it, vi } from "vitest";
import { insightsApi } from "./insights-api.ts";

describe("insightsApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches overview data from the insights service", async () => {
    const payload = {
      range: "24h",
      throughput: 12,
      success_rate: 0.75,
      p50_latency_ms: 120,
      p95_latency_ms: 400,
      total_cost: "1.250000",
      failed_count: 3,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(insightsApi.overview()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/insights/overview?range=24h"
    );
  });

  it("throws when the insights request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      })
    );

    await expect(insightsApi.overview()).rejects.toThrow("/overview?range=24h 503");
  });
});
