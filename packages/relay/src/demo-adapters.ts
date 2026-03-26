/**
 * Demo adapters — mock agents that simulate realistic behavior
 * without requiring external dependencies (Claude CLI, OpenClaw gateway, Codex CLI).
 *
 * Usage: npx tsx packages/relay/src/main.ts --demo
 */
import type {
  LatticeAdapter,
  AgentCard,
  Task,
  TaskStatusUpdate,
  Artifact,
  HealthCheckResult,
} from "@lattice/adapter-base";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Response matching ───────────────────────────────────────────────────────

/**
 * Match prompt text against keyword→response pairs.
 * Checks keywords in order; first match wins. Falls back to "default".
 */
function matchResponse(text: string, responses: [string, string][]): string {
  const lower = text.toLowerCase();
  for (const [keyword, response] of responses) {
    if (keyword === "default") continue;
    if (lower.includes(keyword)) return response;
  }
  return responses.find(([k]) => k === "default")?.[1] ?? "Task completed.";
}

// ── Claude Code responses ───────────────────────────────────────────────────

const CLAUDE_RESPONSES: [string, string][] = [
  // Incident Response workflow: fix step (must be BEFORE "triage" — the expanded
  // template contains "triage analysis" which would otherwise match first)
  ["write a fix", `## Fix Applied

### Changes (2 files, +31 lines, -4 lines)

**\`src/services/payment-service.ts\`**
\`\`\`diff
- async processOrder(cartId: string): Promise<Order> {
-   const cart = await this.cartRepo.getCart(cartId);
+ async processOrder(cartId: string): Promise<Order> {
+   const cart = await this.cartRepo.getCartWithLock(cartId);
+   if (!cart) throw new CartNotFoundError(cartId);
\`\`\`

**\`src/repositories/cart-repo.ts\`**
\`\`\`diff
+ async getCartWithLock(id: string): Promise<Cart | null> {
+   return this.db.transaction(async (tx) => {
+     const cart = await tx.query(
+       'SELECT * FROM carts WHERE id = $1 FOR UPDATE',
+       [id]
+     );
+     return cart.rows[0] ?? null;
+   });
+ }
\`\`\`

### Tests
\`\`\`
+ added: payment-service.test.ts — "handles concurrent checkout for same cart"
+ added: payment-service.test.ts — "returns CartNotFoundError for deleted cart"
+ added: cart-repo.test.ts — "getCartWithLock acquires row lock"
All 89 tests passing (was 86).
\`\`\``],

  // Generic bug fix
  ["bug", `Found the root cause: the \`authenticate()\` function on line 42 of \`auth.ts\` doesn't handle the case where \`session.token\` is \`undefined\`.

**Fix applied:**
\`\`\`diff
- if (session.token === null) {
+ if (session.token === null || session.token === undefined) {
    throw new AuthError("Invalid session");
  }
\`\`\`

Added a null-coalescing check and updated the corresponding test in \`auth.test.ts\`. All 47 tests pass.`],

  // Incident Response workflow: triage step
  ["triage", `## Incident Triage Report

**Severity:** P1 — user-facing, affecting checkout flow
**Root Cause:** Race condition in \`PaymentService.processOrder()\`

### Analysis
The stack trace shows a \`NullReferenceError\` at \`payment-service.ts:142\`. When two concurrent requests hit the same cart ID, the second request reads a cart that's mid-mutation by the first.

\`\`\`
PaymentService.processOrder (payment-service.ts:142)
  → CartRepository.getCart (cart-repo.ts:67)
    → cart.items is null (expected array)
\`\`\`

### Affected Systems
- Checkout API (\`/api/checkout/complete\`)
- 23 failed transactions in the last hour
- Error rate spiked from 0.1% → 4.2%

### Recommended Fix
Add optimistic locking to \`CartRepository.getCart()\` using a version field, and wrap the checkout flow in a transaction.`],

  ["fix", `Analyzed the issue and applied the fix:

1. Updated the error handler to properly propagate the stack trace
2. Added input validation at the API boundary
3. Wrote 3 regression tests covering the edge cases

\`\`\`typescript
// Before: silent failure
const result = await fetchData(id);

// After: explicit error with context
const result = await fetchData(id).catch((err) => {
  throw new AppError(\`Failed to fetch data for \${id}\`, { cause: err });
});
\`\`\``],

  // Code review
  ["review", `## Code Review Summary

**Overall: Approve with minor suggestions**

### Strengths
- Clean separation of concerns between the router and task manager
- Good use of TypeScript generics for type safety
- Comprehensive error handling with custom error classes

### Suggestions
1. **Line 23:** Consider extracting the retry logic into a shared utility — it's duplicated in 3 places
2. **Line 45:** The timeout of 30s might be too aggressive for large payloads; consider making it configurable
3. **Line 67:** Missing \`await\` on the \`cleanup()\` call — this could cause resource leaks under load

### Tests
All existing tests pass. Recommend adding an integration test for the timeout edge case.`],

  // Code generation
  ["generate", `\`\`\`typescript
export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

export function createRateLimiter(opts: RateLimiterOptions) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string): boolean {
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt < now) {
        buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
        return true;
      }
      if (bucket.count >= opts.maxRequests) return false;
      bucket.count++;
      return true;
    },

    remaining(key: string): number {
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt < Date.now()) return opts.maxRequests;
      return Math.max(0, opts.maxRequests - bucket.count);
    },
  };
}
\`\`\`

Includes sliding window with automatic bucket cleanup and a \`remaining()\` helper.`],

  // Refactor
  ["refactor", `Refactored the authentication module:

1. Extracted \`TokenValidator\` class from inline logic (was 180 lines, now 3 focused files)
2. Replaced callback chains with async/await
3. Added dependency injection for the token store (enables testing)

\`\`\`
src/auth/
  ├── token-validator.ts    (new — 62 lines)
  ├── session-manager.ts    (simplified — 84 → 45 lines)
  └── auth-middleware.ts    (unchanged)
\`\`\`

All 47 tests pass. No public API changes — this is a pure internal refactor.`],

  ["default", `Task completed successfully. Analyzed the codebase structure, identified the relevant files, and applied the necessary changes. All tests pass and the implementation follows existing project patterns.`],
];

// ── OpenClaw responses ──────────────────────────────────────────────────────

const OPENCLAW_RESPONSES: [string, string][] = [
  // Incident Response workflow: notify step
  ["incident", `## Notifications Sent

**#incidents** (Slack)
> :rotating_light: **P1 Incident Resolved** — Checkout race condition
> Root cause: concurrent cart mutation in PaymentService
> Fix: Added optimistic locking + transaction wrapping
> Review: Passed — no security issues, 3 regression tests added
> Resolved in 4m 23s | 0 customer impact post-fix

**#engineering** (Slack)
> Fix deployed for checkout race condition. See thread in #incidents for details.
> PR: merged to main | Deploy: auto-rolling to production

**PagerDuty**
> Incident INC-2847 resolved. Auto-closed alert.

Delivered to 14 team members across 2 channels.`],

  ["notify", `Notification sent successfully.

- **Channel:** #engineering
- **Message:** "Fix deployed and reviewed — 3 regression tests added, review approved."
- **Delivered to:** 12 team members
- **Thread:** created for follow-up discussion`],

  ["send", `Message delivered via Slack.

- **Recipients:** engineering-team
- **Status:** delivered
- **Timestamp:** ${new Date().toISOString()}`],

  ["schedule", `Reminder scheduled:
- **Time:** Tomorrow at 9:00 AM
- **Channel:** #standup
- **Message:** "Follow up on the checkout fix — verify production error rates are back to baseline"`],

  ["summary", `Distributed summary to stakeholders:

**Incident Response — Resolved**
- Incident triaged and root cause identified (race condition)
- Fix written and applied by Claude Code
- Security review passed (Codex)
- Team notified via #incidents and #engineering
- Total resolution time: 4m 23s`],

  ["default", `Task completed. Message processed and delivered to the configured channels.`],
];

// ── Codex responses ─────────────────────────────────────────────────────────

const CODEX_RESPONSES: [string, string][] = [
  // Incident Response workflow: security review step
  ["security", `## Security Review

**Verdict: APPROVED — no vulnerabilities found**

### Checks Performed
- [x] SQL injection scan — parameterized queries used correctly (\`$1\` placeholders)
- [x] Race condition — \`FOR UPDATE\` lock prevents concurrent mutations
- [x] Transaction isolation — read committed level is appropriate here
- [x] Error handling — \`CartNotFoundError\` doesn't leak internal state
- [x] Input validation — \`cartId\` validated as UUID before query

### Regression Analysis
- [x] Existing payment tests pass (86/86)
- [x] New concurrency test covers the exact failure mode
- [x] Cart lock test verifies row-level locking behavior

### Performance Note
The \`FOR UPDATE\` lock adds ~2ms latency per checkout. Acceptable given the 200ms p99 budget.

**Recommendation:** Ship it.`],

  ["review", `## Review Results

**Verdict: LGTM — approved**

### Checks
- [x] No security vulnerabilities (ran semgrep + eslint-security)
- [x] Type safety — no \`any\` casts, all generics properly constrained
- [x] Error handling covers all failure modes
- [x] Tests cover the happy path and 3 edge cases
- [x] No performance regressions (bundle size unchanged)

One minor note: consider adding a JSDoc comment to the exported \`authenticate\` function for IDE discoverability.`],

  ["generate", `Generated the requested code:

\`\`\`typescript
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const tokens = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string): boolean {
      const now = Date.now();
      const bucket = tokens.get(key);
      if (!bucket || bucket.resetAt < now) {
        tokens.set(key, { count: 1, resetAt: now + opts.windowMs });
        return true;
      }
      if (bucket.count >= opts.maxRequests) return false;
      bucket.count++;
      return true;
    },
  };
}
\`\`\`

Sliding window implementation with automatic cleanup.`],

  ["terminal", `Executed command sequence:
\`\`\`
$ npm run build     ✓ (2.1s)
$ npm test          ✓ 89/89 passing (1.8s)
$ npm run lint      ✓ no issues
\`\`\``],

  ["default", `Code analysis complete. Reviewed the implementation, verified type safety, and confirmed all tests pass. No issues found.`],
];

// ── Agent cards ─────────────────────────────────────────────────────────────

const CLAUDE_CARD: AgentCard = {
  name: "claude-code",
  description: "Claude Code — AI coding assistant by Anthropic",
  url: "http://localhost:3100/a2a/agents/claude-code",
  version: "1.0.0",
  capabilities: { streaming: true, pushNotifications: false },
  skills: [
    { id: "code-generation", name: "Code Generation", description: "Generate code from descriptions", tags: ["code", "generate", "write", "create", "implement"] },
    { id: "code-review", name: "Code Review", description: "Review code for issues", tags: ["review", "audit", "check"] },
    { id: "debugging", name: "Debugging", description: "Find and fix bugs", tags: ["debug", "fix", "bug", "error"] },
    { id: "refactoring", name: "Refactoring", description: "Refactor and improve code", tags: ["refactor", "improve", "clean", "optimize"] },
    { id: "git-operations", name: "Git Operations", description: "Git commands and workflows", tags: ["git", "commit", "branch", "merge"] },
  ],
  authentication: { schemes: [] },
};

const OPENCLAW_CARD: AgentCard = {
  name: "openclaw",
  description: "OpenClaw — multi-tool AI agent for messaging, scheduling, and web tasks",
  url: "http://localhost:3100/a2a/agents/openclaw",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
  skills: [
    { id: "messaging", name: "Messaging", description: "Send messages via Telegram, Slack, etc.", tags: ["message", "send", "notify", "telegram", "slack"] },
    { id: "scheduling", name: "Scheduling", description: "Schedule tasks and reminders", tags: ["schedule", "reminder", "calendar", "timer"] },
    { id: "web-browsing", name: "Web Browsing", description: "Browse and extract web content", tags: ["browse", "web", "search", "scrape", "fetch"] },
    { id: "file-management", name: "File Management", description: "Manage files and documents", tags: ["file", "document", "upload", "download"] },
  ],
  authentication: { schemes: ["bearer"] },
};

const CODEX_CARD: AgentCard = {
  name: "codex",
  description: "Codex — OpenAI's coding agent via CLI",
  url: "http://localhost:3100/a2a/agents/codex",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
  skills: [
    { id: "code-generation", name: "Code Generation", description: "Generate code from descriptions", tags: ["code", "generate", "write", "create"] },
    { id: "code-review", name: "Code Review", description: "Review code for issues", tags: ["review", "audit", "check"] },
    { id: "terminal-commands", name: "Terminal Commands", description: "Run terminal commands", tags: ["terminal", "command", "shell", "run"] },
  ],
  authentication: { schemes: [] },
};

// ── Adapter factory ─────────────────────────────────────────────────────────

function buildPrompt(task: Task): string {
  return task.history
    .filter((m) => m.role === "user")
    .flatMap((m) => m.parts)
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!)
    .join("\n\n");
}

function createMockAdapter(
  card: AgentCard,
  responses: [string, string][],
  delayRange: [number, number],
): LatticeAdapter {
  return {
    getAgentCard(): AgentCard {
      return { ...card, skills: [...card.skills] };
    },

    async executeTask(task: Task): Promise<Task> {
      const prompt = buildPrompt(task);
      const [minMs, maxMs] = delayRange;
      const delay = minMs + Math.random() * (maxMs - minMs);
      await sleep(delay);

      const text = matchResponse(prompt, responses);
      const artifact: Artifact = {
        name: "result",
        parts: [{ type: "text", text }],
      };
      return { ...task, status: "completed", artifacts: [artifact] };
    },

    async *streamTask(task: Task): AsyncGenerator<TaskStatusUpdate> {
      const prompt = buildPrompt(task);
      const text = matchResponse(prompt, responses);

      const words = text.split(" ");
      const chunkSize = Math.ceil(words.length / 3);

      for (let i = 0; i < words.length; i += chunkSize) {
        await sleep(400 + Math.random() * 300);
        const chunk = words.slice(i, i + chunkSize).join(" ");
        yield { taskId: task.id, status: "working", message: chunk };
      }

      yield {
        taskId: task.id,
        status: "completed",
        artifacts: [{ name: "result", parts: [{ type: "text", text }] }],
      };
    },

    async healthCheck(): Promise<HealthCheckResult> {
      return { ok: true };
    },
  };
}

export function createDemoClaudeCodeAdapter(): LatticeAdapter {
  return createMockAdapter(CLAUDE_CARD, CLAUDE_RESPONSES, [1500, 3000]);
}

export function createDemoOpenClawAdapter(): LatticeAdapter {
  return createMockAdapter(OPENCLAW_CARD, OPENCLAW_RESPONSES, [800, 1500]);
}

export function createDemoCodexAdapter(): LatticeAdapter {
  return createMockAdapter(CODEX_CARD, CODEX_RESPONSES, [1200, 2500]);
}
