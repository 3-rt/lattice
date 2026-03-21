// packages/relay/tests/beta-sample.test.ts
import { describe, it, expect } from "vitest";
import { betaSample, createSeededRandom } from "../src/beta-sample.js";

describe("createSeededRandom", () => {
  it("should produce deterministic values from the same seed", () => {
    const rng1 = createSeededRandom(42);
    const rng2 = createSeededRandom(42);
    const vals1 = [rng1(), rng1(), rng1()];
    const vals2 = [rng2(), rng2(), rng2()];
    expect(vals1).toEqual(vals2);
  });

  it("should produce values in [0, 1)", () => {
    const rng = createSeededRandom(123);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("should produce different values from different seeds", () => {
    const rng1 = createSeededRandom(1);
    const rng2 = createSeededRandom(2);
    // Extremely unlikely to match
    expect(rng1()).not.toBe(rng2());
  });
});

describe("betaSample", () => {
  it("should return a value between 0 and 1", () => {
    const rng = createSeededRandom(99);
    for (let i = 0; i < 100; i++) {
      const v = betaSample(1, 1, rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("should be deterministic with the same RNG state", () => {
    const rng1 = createSeededRandom(7);
    const rng2 = createSeededRandom(7);
    expect(betaSample(3, 2, rng1)).toBe(betaSample(3, 2, rng2));
  });

  it("should skew higher when alpha >> beta (many successes)", () => {
    const rng = createSeededRandom(42);
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      samples.push(betaSample(50, 2, rng));
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    // Beta(50,2) has mean = 50/52 ~ 0.96
    expect(mean).toBeGreaterThan(0.85);
  });

  it("should skew lower when beta >> alpha (many failures)", () => {
    const rng = createSeededRandom(42);
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      samples.push(betaSample(2, 50, rng));
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    // Beta(2,50) has mean = 2/52 ~ 0.04
    expect(mean).toBeLessThan(0.15);
  });

  it("should center around 0.5 for Beta(1,1) (uniform prior)", () => {
    const rng = createSeededRandom(42);
    const samples: number[] = [];
    for (let i = 0; i < 500; i++) {
      samples.push(betaSample(1, 1, rng));
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.3);
    expect(mean).toBeLessThan(0.7);
  });
});
