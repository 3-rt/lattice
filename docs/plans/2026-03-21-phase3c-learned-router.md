# Phase 3c: Learned Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer Thompson Sampling on top of the existing skill-matching router so the relay learns which agent performs best for each task category over time.

**Architecture:** A task categorizer classifies incoming task text into categories (debugging, code-review, code-generation, etc.) via keyword matching. A learned router filters candidates to agents whose registered skill IDs match the task category (falling back to all online agents if none match), then samples from Beta distributions built from per-(agent, category) success/failure counts stored in SQLite. The existing simple router and the learned router both implement the `LatticeRouter` interface; `lattice.config.json`'s `routing.strategy` field selects which one is active.

> **Bug fix (2026-03-24):** The learned router originally sampled from all online agents regardless of their skills, meaning agents with no relevant skills could win the sampling (e.g., OpenClaw winning a "code-review" task despite having only messaging/scheduling skills). Fixed by filtering candidates to agents whose `skills[].id` matches the task category before sampling.

**Tech Stack:** TypeScript, Vitest, better-sqlite3 (existing), Beta distribution sampling via `Math.random()` (seedable for tests)

**Spec:** `docs/specs/2026-03-21-lattice-design.md` (section: Learned Router)

---

## File Structure

```
packages/relay/
  src/
    categorizer.ts          # NEW - keyword-to-category classifier
    beta-sample.ts          # NEW - Beta distribution sampling (pure function)
    learned-router.ts       # NEW - Thompson Sampling router
    router.ts               # MODIFY - re-export, add createRouterFromConfig factory
    task-manager.ts         # MODIFY - use categorizer for updateRoutingStats calls
    index.ts                # MODIFY - export new modules
    main.ts                 # MODIFY - pass config to router factory
  tests/
    categorizer.test.ts     # NEW
    beta-sample.test.ts     # NEW
    learned-router.test.ts  # NEW
    router.test.ts          # MODIFY - add strategy selection tests
    task-manager.test.ts    # MODIFY - verify categorized stats
```

---

### Task 1: Task Categorizer

**Files:**
- Create: `packages/relay/src/categorizer.ts`
- Create: `packages/relay/tests/categorizer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run packages/relay/tests/categorizer.test.ts`
Expected: FAIL with "Cannot find module" or "categorize is not a function"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/relay/src/categorizer.ts

/**
 * Predefined keyword-to-category mapping.
 * Keys are category names; values are arrays of keywords that indicate that category.
 */
export const CATEGORY_MAP: Record<string, string[]> = {
  debugging: ["fix", "bug", "error", "debug", "crash", "issue", "broken"],
  "code-review": ["review", "pr", "pull request", "check", "approve", "feedback"],
  "code-generation": ["write", "create", "implement", "add", "build", "generate", "scaffold"],
  refactoring: ["refactor", "clean", "restructure", "reorganize", "simplify", "extract"],
  messaging: ["send", "notify", "message", "email", "post", "alert", "slack", "telegram"],
};

/**
 * Classify task text into a category by counting keyword hits per category.
 * Returns the category with the most keyword matches, or "general" if none match.
 */
export function categorize(text: string): string {
  const lower = text.toLowerCase();
  let bestCategory = "general";
  let bestCount = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
    let count = 0;
    for (const keyword of keywords) {
      // Use word-boundary-aware matching for multi-word keywords,
      // simple includes for single words
      if (keyword.includes(" ")) {
        if (lower.includes(keyword)) count++;
      } else {
        // Match as a substring (same approach as existing skill-tag matching)
        const words = lower.split(/\s+/);
        for (const word of words) {
          if (word === keyword || word.includes(keyword)) count++;
        }
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestCategory = category;
    }
  }

  return bestCategory;
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run packages/relay/tests/categorizer.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**
```bash
git add packages/relay/src/categorizer.ts packages/relay/tests/categorizer.test.ts
git commit -m "feat(relay): add task categorizer with keyword-to-category mapping"
```

---

### Task 2: Beta Distribution Sampling

**Files:**
- Create: `packages/relay/src/beta-sample.ts`
- Create: `packages/relay/tests/beta-sample.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run packages/relay/tests/beta-sample.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/relay/src/beta-sample.ts

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
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run packages/relay/tests/beta-sample.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**
```bash
git add packages/relay/src/beta-sample.ts packages/relay/tests/beta-sample.test.ts
git commit -m "feat(relay): add Beta distribution sampling with seeded RNG"
```

---

### Task 3: Learned Router Core

**Files:**
- Create: `packages/relay/src/learned-router.ts`
- Create: `packages/relay/tests/learned-router.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/learned-router.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLearnedRouter } from "../src/learned-router.js";
import { createRegistry } from "../src/registry.js";
import { createDatabase, type LatticeDB } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import type { LatticeAdapter, AgentCard } from "@lattice/adapter-base";

function createMockAdapter(name: string, skillTags: string[]): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "skill-1", name: "Skill", description: "A skill", tags: skillTags }],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn(),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("LearnedRouter", () => {
  let db: LatticeDB;
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    db = createDatabase(":memory:");
    const bus = createEventBus();
    registry = createRegistry(db, bus);
  });

  afterEach(() => {
    db.close();
  });

  it("should still respect explicit agent override", () => {
    registry.register(createMockAdapter("agent-a", ["code"]));
    registry.register(createMockAdapter("agent-b", ["code"]));
    const router = createLearnedRouter(registry, db, { seed: 42 });
    const result = router.route("fix the code", "agent-b");
    expect(result.agentName).toBe("agent-b");
    expect(result.reason).toContain("explicit");
  });

  it("should throw when no agents are online", () => {
    const router = createLearnedRouter(registry, db, { seed: 42 });
    expect(() => router.route("do something")).toThrow("No agents available");
  });

  it("should use round-robin when no stats exist (cold start)", () => {
    registry.register(createMockAdapter("agent-a", ["code"]));
    registry.register(createMockAdapter("agent-b", ["code"]));
    const router = createLearnedRouter(registry, db, { seed: 42 });
    const result = router.route("do something with no category match and no stats");
    expect(["agent-a", "agent-b"]).toContain(result.agentName);
    // With no stats at all, it should fall back
    expect(result.reason).toContain("thompson sampling");
  });

  it("should favor the agent with more successes in a category", () => {
    registry.register(createMockAdapter("good-agent", ["code"]));
    registry.register(createMockAdapter("bad-agent", ["code"]));

    // Seed good-agent with 50 successes in "debugging"
    for (let i = 0; i < 50; i++) {
      db.updateRoutingStats("good-agent", "debugging", true, 100, 0);
    }
    // Seed bad-agent with 50 failures in "debugging"
    for (let i = 0; i < 50; i++) {
      db.updateRoutingStats("bad-agent", "debugging", false, 100, 0);
    }

    // Route many debugging tasks and check the good agent wins most
    let goodCount = 0;
    for (let s = 0; s < 100; s++) {
      const router = createLearnedRouter(registry, db, { seed: s });
      const result = router.route("fix the bug");
      if (result.agentName === "good-agent") goodCount++;
    }
    // good-agent should win the vast majority (Beta(51,1) vs Beta(1,51))
    expect(goodCount).toBeGreaterThan(90);
  });

  it("should include category in the routing reason", () => {
    registry.register(createMockAdapter("agent-a", ["code"]));
    db.updateRoutingStats("agent-a", "debugging", true, 100, 0);
    const router = createLearnedRouter(registry, db, { seed: 42 });
    const result = router.route("fix the bug");
    expect(result.reason).toContain("debugging");
    expect(result.reason).toContain("thompson sampling");
  });

  it("should handle single agent gracefully", () => {
    registry.register(createMockAdapter("only-agent", ["code"]));
    const router = createLearnedRouter(registry, db, { seed: 42 });
    const result = router.route("fix the bug");
    expect(result.agentName).toBe("only-agent");
  });

  it("should use different categories for different task types", () => {
    registry.register(createMockAdapter("debugger", ["code"]));
    registry.register(createMockAdapter("writer", ["code"]));

    // debugger is great at debugging, writer is great at code-generation
    for (let i = 0; i < 30; i++) {
      db.updateRoutingStats("debugger", "debugging", true, 100, 0);
      db.updateRoutingStats("writer", "debugging", false, 100, 0);
      db.updateRoutingStats("writer", "code-generation", true, 100, 0);
      db.updateRoutingStats("debugger", "code-generation", false, 100, 0);
    }

    let debuggerWinsDebug = 0;
    let writerWinsGen = 0;
    for (let s = 0; s < 50; s++) {
      const router = createLearnedRouter(registry, db, { seed: s });
      if (router.route("fix the error").agentName === "debugger") debuggerWinsDebug++;
      if (router.route("write a new feature").agentName === "writer") writerWinsGen++;
    }
    expect(debuggerWinsDebug).toBeGreaterThan(40);
    expect(writerWinsGen).toBeGreaterThan(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run packages/relay/tests/learned-router.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/relay/src/learned-router.ts
import type { LatticeRegistry } from "./registry.js";
import type { LatticeDB, RoutingStatsRow } from "./db.js";
import type { LatticeRouter, RouteResult } from "./router.js";
import { categorize } from "./categorizer.js";
import { betaSample, createSeededRandom } from "./beta-sample.js";

export interface LearnedRouterOptions {
  /** Fixed seed for deterministic tests. If undefined, uses Math.random. */
  seed?: number;
}

/**
 * Creates a Thompson Sampling router that learns which agent is best per task category.
 *
 * Algorithm:
 * 1. Categorize the task text
 * 2. For each online agent, look up (agent, category) stats
 * 3. Sample from Beta(successes + 1, failures + 1) for each agent
 * 4. Pick the agent with the highest sample
 *
 * Falls back to explicit-agent override (highest priority) like the simple router.
 */
export function createLearnedRouter(
  registry: LatticeRegistry,
  db: LatticeDB,
  options: LearnedRouterOptions = {}
): LatticeRouter {
  return {
    route(taskText: string, explicitAgent?: string): RouteResult {
      const onlineAgents = registry.getOnlineAgents();
      if (onlineAgents.length === 0) throw new Error("No agents available");

      // Priority 1: explicit agent override
      if (explicitAgent) {
        const agent = onlineAgents.find((a) => a.name === explicitAgent);
        if (!agent) throw new Error(`Agent "${explicitAgent}" not found or offline`);
        return { agentName: explicitAgent, reason: "explicit agent override" };
      }

      // Categorize the task
      const category = categorize(taskText);

      // Build a lookup of stats by (agent_name, category)
      const allStats = db.getRoutingStats();
      const statsMap = new Map<string, RoutingStatsRow>();
      for (const row of allStats) {
        statsMap.set(`${row.agent_name}::${row.category}`, row);
      }

      // Create RNG: use seed if provided, otherwise use a fresh random seed
      const seed = options.seed ?? Math.floor(Math.random() * 2147483647);
      const rng = createSeededRandom(seed);

      // Thompson Sampling: sample from Beta(alpha, beta) for each agent
      let bestAgent = "";
      let bestSample = -1;

      for (const agent of onlineAgents) {
        const key = `${agent.name}::${category}`;
        const stats = statsMap.get(key);
        const alpha = (stats?.successes ?? 0) + 1; // Prior: Beta(1, 1) = Uniform
        const beta = (stats?.failures ?? 0) + 1;
        const sample = betaSample(alpha, beta, rng);

        if (sample > bestSample) {
          bestSample = sample;
          bestAgent = agent.name;
        }
      }

      return {
        agentName: bestAgent,
        reason: `thompson sampling (category: ${category}, sample: ${bestSample.toFixed(3)})`,
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run packages/relay/tests/learned-router.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**
```bash
git add packages/relay/src/learned-router.ts packages/relay/tests/learned-router.test.ts
git commit -m "feat(relay): add Thompson Sampling learned router"
```

---

### Task 4: Strategy-Based Router Factory

**Files:**
- Modify: `packages/relay/src/router.ts`
- Modify: `packages/relay/tests/router.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/relay/tests/router.test.ts`:

```typescript
import { createRouterFromConfig } from "../src/router.js";

// ... (keep all existing tests above) ...

describe("createRouterFromConfig", () => {
  let db: ReturnType<typeof createDatabase>;
  let bus: ReturnType<typeof createEventBus>;
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    db = createDatabase(":memory:");
    bus = createEventBus();
    registry = createRegistry(db, bus);
  });

  afterEach(() => {
    db.close();
  });

  it("should return the simple router when strategy is 'simple'", () => {
    registry.register(createMockAdapter("agent-a", ["code"]));
    const router = createRouterFromConfig(registry, db, { strategy: "simple" });
    const result = router.route("write some code");
    expect(result.reason).toContain("skill match");
  });

  it("should return the learned router when strategy is 'learned'", () => {
    registry.register(createMockAdapter("agent-a", ["code"]));
    db.updateRoutingStats("agent-a", "code-generation", true, 100, 0);
    const router = createRouterFromConfig(registry, db, { strategy: "learned", seed: 42 });
    const result = router.route("write some code");
    expect(result.reason).toContain("thompson sampling");
  });

  it("should default to 'simple' when strategy is unrecognized", () => {
    registry.register(createMockAdapter("agent-a", ["code"]));
    const router = createRouterFromConfig(registry, db, { strategy: "unknown" as any });
    const result = router.route("write some code");
    expect(result.reason).toContain("skill match");
  });

  it("should default to 'simple' when no config is provided", () => {
    registry.register(createMockAdapter("agent-a", ["code"]));
    const router = createRouterFromConfig(registry, db);
    const result = router.route("write some code");
    expect(result.reason).toContain("skill match");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run packages/relay/tests/router.test.ts`
Expected: FAIL with "createRouterFromConfig is not a function" or similar

- [ ] **Step 3: Write minimal implementation**

Add to the bottom of `packages/relay/src/router.ts`:

```typescript
import type { LatticeDB } from "./db.js";
import { createLearnedRouter } from "./learned-router.js";

export interface RoutingConfig {
  strategy?: "simple" | "learned";
  seed?: number;
}

/**
 * Factory that creates either the simple (skill-matching) or learned (Thompson Sampling)
 * router based on the config. Both implement the LatticeRouter interface.
 */
export function createRouterFromConfig(
  registry: LatticeRegistry,
  db: LatticeDB,
  config?: RoutingConfig
): LatticeRouter {
  const strategy = config?.strategy ?? "simple";

  if (strategy === "learned") {
    return createLearnedRouter(registry, db, { seed: config?.seed });
  }

  // Default: simple skill-matching router
  return createRouter(registry);
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run packages/relay/tests/router.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**
```bash
git add packages/relay/src/router.ts packages/relay/tests/router.test.ts
git commit -m "feat(relay): add createRouterFromConfig strategy factory"
```

---

### Task 5: Update Task Manager to Use Categorizer

**Files:**
- Modify: `packages/relay/src/task-manager.ts`
- Modify: `packages/relay/tests/task-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new test to `packages/relay/tests/task-manager.test.ts`:

```typescript
import { categorize } from "../src/categorizer.js";

// ... (within the existing describe block, add these tests) ...

it("should update routing stats with the task category, not 'default'", async () => {
  const adapter = createMockAdapter("agent-a", ["code"]);
  registry.register(adapter);

  const task = await taskManager.createTask("fix the bug in auth");
  await taskManager.executeTask(task.id);

  const stats = db.getRoutingStats();
  const debuggingStats = stats.find(
    (s) => s.agent_name === "agent-a" && s.category === "debugging"
  );
  const defaultStats = stats.find(
    (s) => s.agent_name === "agent-a" && s.category === "default"
  );

  expect(debuggingStats).toBeDefined();
  expect(debuggingStats!.successes).toBe(1);
  expect(defaultStats).toBeUndefined();
});

it("should categorize failed tasks too", async () => {
  const failAdapter: LatticeAdapter = {
    getAgentCard: () => ({
      name: "fail-agent",
      description: "Fails",
      url: "http://localhost:3100/a2a/agents/fail-agent",
      version: "1.0.0",
      capabilities: { streaming: false, pushNotifications: false },
      skills: [{ id: "s1", name: "Skill", description: "A skill", tags: ["code"] }],
      authentication: { schemes: [] },
    }),
    executeTask: vi.fn().mockRejectedValue(new Error("boom")),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
  registry.register(failAdapter);

  const task = await taskManager.createTask("write a new endpoint");
  await taskManager.executeTask(task.id);

  const stats = db.getRoutingStats();
  const genStats = stats.find(
    (s) => s.agent_name === "fail-agent" && s.category === "code-generation"
  );
  expect(genStats).toBeDefined();
  expect(genStats!.failures).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run packages/relay/tests/task-manager.test.ts`
Expected: FAIL because stats are recorded under "default" instead of "debugging"/"code-generation"

- [ ] **Step 3: Write minimal implementation**

In `packages/relay/src/task-manager.ts`, make these changes:

1. Add import at the top:
```typescript
import { categorize } from "./categorizer.js";
```

2. In `executeTask`, after the routing step (after `agentName` and `reason` are set), add:
```typescript
const taskText = task.history[0]?.parts[0]?.text ?? "";
const category = categorize(taskText);
```

3. Replace the two `db.updateRoutingStats` calls:

In the failure catch block, change:
```typescript
db.updateRoutingStats(agentName, "default", false, latencyMs, 0);
```
to:
```typescript
db.updateRoutingStats(agentName, category, false, latencyMs, 0);
```

In the success path, change:
```typescript
db.updateRoutingStats(agentName, "default", true, latencyMs, 0);
```
to:
```typescript
db.updateRoutingStats(agentName, category, true, latencyMs, 0);
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run packages/relay/tests/task-manager.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Commit**
```bash
git add packages/relay/src/task-manager.ts packages/relay/tests/task-manager.test.ts
git commit -m "feat(relay): use task categorizer for routing stats instead of 'default'"
```

---

### Task 6: Wire Up in main.ts and Update Exports

**Files:**
- Modify: `packages/relay/src/main.ts`
- Modify: `packages/relay/src/index.ts`

- [ ] **Step 1: Write the failing test**

No new test file needed. This is a wiring task verified by running the full suite.

- [ ] **Step 2: Update main.ts to use config-driven router**

In `packages/relay/src/main.ts`, change:

```typescript
import { createRouter } from "./router.js";
```
to:
```typescript
import { createRouterFromConfig } from "./router.js";
```

And change:
```typescript
const router = createRouter(registry);
```
to:
```typescript
const routingConfig = config.routing ?? {};
const router = createRouterFromConfig(registry, db, {
  strategy: routingConfig.strategy ?? "simple",
});
```

- [ ] **Step 3: Update index.ts exports**

In `packages/relay/src/index.ts`, add:

```typescript
export { categorize, CATEGORY_MAP } from "./categorizer.js";
export { betaSample, createSeededRandom } from "./beta-sample.js";
export { createLearnedRouter } from "./learned-router.js";
export { createRouterFromConfig } from "./router.js";
export type { RoutingConfig } from "./router.js";
export type { LearnedRouterOptions } from "./learned-router.js";
```

- [ ] **Step 4: Run all tests to verify nothing is broken**
Run: `npx vitest run`
Expected: All tests pass (previous 45 + new tests)

- [ ] **Step 5: Commit**
```bash
git add packages/relay/src/main.ts packages/relay/src/index.ts
git commit -m "feat(relay): wire learned router into main.ts and export new modules"
```

---

### Task 7: Integration Test

**Files:**
- Modify: `packages/relay/tests/integration.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/relay/tests/integration.test.ts`:

```typescript
describe("Learned Router Integration", () => {
  it("should route tasks through the learned router end-to-end", async () => {
    const db = createDatabase(":memory:");
    const bus = createEventBus();
    const registry = createRegistry(db, bus);

    // Register two agents
    const goodAdapter = createMockAdapter("good-agent", ["code"]);
    (goodAdapter.executeTask as any).mockResolvedValue({
      id: "t1",
      status: "completed",
      artifacts: [{ name: "result", parts: [{ type: "text", text: "done" }] }],
      history: [],
    });
    const badAdapter = createMockAdapter("bad-agent", ["code"]);
    (badAdapter.executeTask as any).mockRejectedValue(new Error("I always fail"));

    registry.register(goodAdapter);
    registry.register(badAdapter);

    // Use learned router
    const { createRouterFromConfig } = await import("../src/router.js");
    const router = createRouterFromConfig(registry, db, { strategy: "learned" });
    const taskManager = createTaskManager(db, bus, registry, router);

    // Run several debugging tasks — after some learning, good-agent should dominate
    const results: string[] = [];
    for (let i = 0; i < 20; i++) {
      const task = await taskManager.createTask("fix the bug in module");
      const completed = await taskManager.executeTask(task.id);
      results.push(completed.metadata?.assignedAgent ?? "");
    }

    // Check that stats were recorded per category
    const stats = db.getRoutingStats();
    const debuggingStats = stats.filter((s) => s.category === "debugging");
    expect(debuggingStats.length).toBeGreaterThan(0);

    // The good agent should have accumulated successes
    const goodStats = debuggingStats.find((s) => s.agent_name === "good-agent");
    expect(goodStats).toBeDefined();
    expect(goodStats!.successes).toBeGreaterThan(0);

    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run packages/relay/tests/integration.test.ts`
Expected: FAIL (imports don't resolve yet if Tasks 1-6 aren't done; if they are, should pass immediately)

- [ ] **Step 3: No new production code needed**

This test exercises the integration of categorizer + learned router + task manager. All production code was written in Tasks 1-6.

- [ ] **Step 4: Run full test suite**
Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**
```bash
git add packages/relay/tests/integration.test.ts
git commit -m "test(relay): add learned router integration test"
```

---

## Summary

| Task | What | New Files | Modified Files | Tests |
|------|------|-----------|----------------|-------|
| 1 | Task categorizer | `categorizer.ts`, `categorizer.test.ts` | - | 9 |
| 2 | Beta sampling | `beta-sample.ts`, `beta-sample.test.ts` | - | 7 |
| 3 | Learned router | `learned-router.ts`, `learned-router.test.ts` | - | 7 |
| 4 | Router factory | - | `router.ts`, `router.test.ts` | 4 |
| 5 | Categorized stats | - | `task-manager.ts`, `task-manager.test.ts` | 2 |
| 6 | Wiring + exports | - | `main.ts`, `index.ts` | 0 |
| 7 | Integration test | - | `integration.test.ts` | 1 |

**Total: ~30 new tests, 7 commits, 4 new files, 5 modified files**

After completion, setting `"routing": { "strategy": "learned" }` in `lattice.config.json` (already set) activates Thompson Sampling. The system starts with uniform priors and converges to the best agent per task category after ~20 tasks.
