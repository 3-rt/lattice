/**
 * Creates a seeded pseudo-random number generator (Mulberry32 algorithm).
 * Returns a function that produces values in [0, 1) deterministically.
 */
export function createSeededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sample from a Beta(alpha, beta) distribution using the Joehnk algorithm.
 * For production use, alpha = successes + 1, beta = failures + 1.
 *
 * @param alpha - Shape parameter (> 0)
 * @param beta - Shape parameter (> 0)
 * @param rng - Random number generator returning values in [0, 1)
 * @returns A sample in [0, 1]
 */
export function betaSample(
  alpha: number,
  beta: number,
  rng: () => number = Math.random
): number {
  // Use the gamma-based method for general alpha/beta:
  // Sample X ~ Gamma(alpha), Y ~ Gamma(beta), then X/(X+Y) ~ Beta(alpha, beta)
  const x = gammaSample(alpha, rng);
  const y = gammaSample(beta, rng);
  if (x + y === 0) return 0.5; // Degenerate case
  return x / (x + y);
}

/**
 * Sample from a Gamma(shape, 1) distribution using Marsaglia and Tsang's method.
 * For shape < 1, uses the shape+1 trick: Gamma(a) = Gamma(a+1) * U^(1/a).
 */
function gammaSample(shape: number, rng: () => number): number {
  if (shape < 1) {
    // Gamma(shape) = Gamma(shape+1) * U^(1/shape)
    const u = rng();
    return gammaSample(shape + 1, rng) * Math.pow(u, 1 / shape);
  }

  // Marsaglia and Tsang's method for shape >= 1
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x: number;
    let v: number;

    do {
      // Generate standard normal using Box-Muller
      x = boxMullerNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = rng();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Generate a standard normal random variable using the Box-Muller transform.
 */
function boxMullerNormal(rng: () => number): number {
  const u1 = rng() || 1e-10; // Avoid log(0)
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
