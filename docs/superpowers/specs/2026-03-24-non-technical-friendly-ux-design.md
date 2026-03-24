# Non-Technical Friendly UX Design

**Date:** 2026-03-24
**Goal:** Make Lattice approachable for developers trying it for the first time and non-developers who just want to orchestrate AI agents — without requiring them to debug WebSocket scopes, missing env vars, or raw protocol errors.

**Approach:** Fail gracefully with clear guidance. No setup wizard. The dashboard and startup output are the primary surfaces for communicating what's wrong and how to fix it.

---

## 1. Agent Status Reasons

Track *why* an agent is offline, not just *that* it is.

### Data model

Add `statusReason?: string` to `AgentEntry` in the registry and the `/api/agents` response.

**Memory only — not persisted to SQLite.** The `agents` table does not get a new column. On relay restart, `statusReason` is populated by the first health check cycle (runs immediately on startup via pre-flight checks, then every 30s). This avoids a schema migration for a transient, frequently-changing value.

### Adapter health check change

The `healthCheck()` return type changes from `Promise<boolean>` to `Promise<HealthCheckResult>`:

```typescript
// adapter-base/types.ts
export type HealthCheckResult = boolean | { ok: boolean; reason?: string };
```

The registry normalizes both return types:

```typescript
// registry.ts — runHealthChecks()
const result = await entry.adapter.healthCheck();
const ok = typeof result === "boolean" ? result : result.ok;
const reason = typeof result === "object" ? result.reason : undefined;
```

This is backwards-compatible — existing adapters returning `boolean` continue to work. New adapters can return the richer type.

### Where reasons are set

- **Startup pre-flight checks** — before attempting connection (token missing, CLI not on PATH)
- **Health check failures** — periodically, every 30s

### Reason messages by adapter

| Adapter | Situation | Reason |
|---------|-----------|--------|
| OpenClaw | Token not set | "Gateway token not configured. Set OPENCLAW_GATEWAY_TOKEN in your environment." |
| OpenClaw | Gateway unreachable | "Can't reach OpenClaw gateway at {url}. Check that the gateway is running." |
| OpenClaw | Auth rejected | "Gateway rejected the token. Check that your OPENCLAW_GATEWAY_TOKEN has the right permissions." |
| OpenClaw | Response timeout | "OpenClaw took too long to respond. The gateway may be overloaded." |
| Claude Code | CLI not found | "Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code" |
| Claude Code | CLI error | "Claude CLI exited with an error. Run 'claude --version' to check your setup." |
| Codex | CLI not found | "Codex CLI not found. Install it from: https://github.com/openai/codex" |

### SSE event type change

Update the `agent:status` type in `adapter-base/types.ts`:

```typescript
// Before
{ type: "agent:status"; agentName: string; status: string }

// After
{ type: "agent:status"; agentName: string; status: string; reason?: string }
```

The `reason` field is present when `status` is `"offline"` and omitted when `"online"`.

---

## 2. Dashboard — Offline Agent Cards

Offline agent cards show the reason and a fix instruction.

- Gray status dot + "offline" label remain
- Amber info box appears below the skills section with the `statusReason` text
- Reason updates in real-time via SSE (`agent:status` events with `reason` field)
- Warning disappears automatically when the agent comes back online
- No changes to online agent cards

---

## 3. Friendly Error Messages for Task Failures

An error translation layer in the relay maps known raw errors to plain English before returning them to the user.

**New file:** `packages/relay/src/error-messages.ts`

### Error patterns

| Pattern | Friendly Message |
|---------|-----------------|
| `missing scope: <scope>` | "The agent doesn't have permission to do this. An admin needs to grant the '<scope>' scope." |
| `ENOENT` | "The agent's CLI tool isn't installed on this machine." |
| `connection timeout` | "Couldn't reach the agent's backend service. It may be down or unreachable." |
| `ECONNREFUSED` | "Connection refused. The agent's backend isn't running." |
| `rate limit` | "The agent hit a rate limit. Wait a moment and try again." |
| `auth\|unauthorized\|forbidden` | "Authentication failed. Check the agent's API key or token." |
| `OpenClaw response timed out` | "OpenClaw took too long to respond. The task may have been too complex." |
| `OpenClaw gateway not connected` | "Lost connection to the OpenClaw gateway. It may have restarted." |
| `claude exited with code` | "Claude encountered an error. Check that the Claude CLI is authenticated and working." |

Unknown errors pass through unchanged.

### Where translation is applied

Adapters have two error paths:
1. **Thrown errors** — caught by task-manager's try/catch
2. **Returned errors** — adapter returns `status: "failed"` with error text in `artifacts`

Translation is applied in **task-manager** after `executeTask()` returns, checking the artifact text of any failed task. This catches both paths since thrown errors are already caught and wrapped into artifacts by the adapters themselves.

### Preserving raw errors

Add an optional `detail` field to the `Artifact` type in `adapter-base/types.ts`:

```typescript
export interface Artifact {
  name: string;
  parts: Part[];
  detail?: string;  // NEW — raw error for debugging
}
```

When error translation applies, the original text moves to `detail` and the friendly message goes into `parts[0].text`.

### Dashboard display

- Failed tasks show the friendly message in the output section
- A "Show details" text toggle reveals the raw `detail` string underneath
- CLI output: friendly message shown, raw error shown with `--verbose` flag (out of scope for this spec, noted for future)

---

## 4. Startup Experience

Pre-flight checks before attempting connections, with actionable output.

### Startup output format

```
Lattice v0.1.0

Adapters:
  ✓ claude-code     ready
  ✓ codex           ready
  ⚠ openclaw        OPENCLAW_GATEWAY_TOKEN not set
                    → Set it with: export OPENCLAW_GATEWAY_TOKEN="your-token"

Workflows:                    (existing behavior, reformatted)
  ✓ 2 workflow(s) loaded

Relay running at http://localhost:3100
Agents online: 2 of 3
```

Note: "Dashboard at http://localhost:3200" is NOT shown — the relay does not know whether the dashboard is running. The dashboard URL is only shown by `npm run dev:all` which starts both.

### Pre-flight checks

Run before adapter `connect()` / first health check:

- **OpenClaw:** Is `OPENCLAW_GATEWAY_TOKEN` env var set? Is the gateway URL reachable (quick TCP probe)?
- **Claude Code:** Is `claude` (or configured path) on PATH? (`which` check)
- **Codex:** Is `codex` (or configured path) on PATH? (`which` check)

Pre-flight results set the initial `statusReason` on the `AgentEntry` — same value shown in dashboard and startup output (single source of truth).

### Behavior

- Warnings don't block startup — the relay runs with whatever works
- Adapters that fail pre-flight are still registered (so they appear in the dashboard) but marked offline with a reason
- If pre-flight passes but the first health check fails, the reason updates accordingly

### `.env.example`

```bash
# OpenClaw gateway authentication token
# Get this from your OpenClaw dashboard → Settings → API Tokens
OPENCLAW_GATEWAY_TOKEN=

# Optional: override CLI paths if not on system PATH
# CLAUDE_BIN=claude
# CODEX_BIN=codex
```

---

## 5. Testing Strategy

**Unit tests:**
- `error-messages.test.ts` — each pattern matches correctly, unknown errors pass through, `detail` field preserves original
- `registry.test.ts` — `statusReason` set on offline transition, cleared on online transition; both `boolean` and `{ ok, reason }` health check return types handled
- Adapter tests — updated for `{ ok, reason }` return type (openclaw, claude-code, codex)

**Integration tests:**
- `server.test.ts` — `GET /api/agents` includes `statusReason` when agent is offline, omits when online
- `server.test.ts` — SSE `agent:status` events include `reason` field

**Not tested (manual):**
- Dashboard rendering (no React test framework currently)
- Startup log formatting (cosmetic)

---

## Files Changed

| Change | Files |
|--------|-------|
| `HealthCheckResult` type + `Artifact.detail` + SSE type | `adapter-base/types.ts` |
| `statusReason` on AgentEntry, normalize health check | `registry.ts` |
| `statusReason` in API response | `server.ts` |
| `reason` in SSE events | `registry.ts` (where events are emitted) |
| Adapter healthCheck returns `{ ok, reason }` | all 3 adapter source files |
| Pre-flight checks at startup | `main.ts` |
| Error translation layer | `error-messages.ts` (new), `task-manager.ts` |
| Dashboard offline guidance | `agent-card.tsx` |
| Dashboard "Show details" toggle | `task-table.tsx` |
| `.env.example` | project root (new) |
| Tests | `error-messages.test.ts` (new), updates to `registry.test.ts`, `server.test.ts`, adapter tests |
