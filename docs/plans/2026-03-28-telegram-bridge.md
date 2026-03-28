# Telegram Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Lattice to intercept inbound Telegram `BUG:` messages via the OpenClaw gateway, abort the auto-response, run a multi-agent Bug Triage workflow, and send the result back to the customer via Telegram.

**Architecture:** The OpenClaw adapter subscribes to gateway session events on connect. When a `session.message` with a `BUG:` prefix arrives from Telegram, the adapter aborts the auto-response, sends an ack, and invokes a relay-registered callback. The relay callback triggers the Bug Triage workflow (Claude Code → Codex → OpenClaw), then sends the final result back to Telegram via the adapter.

**Tech Stack:** TypeScript, WebSocket (ws), existing workflow engine, existing adapter infrastructure.

**Spec:** `docs/specs/2026-03-28-telegram-bridge-design.md`

---

### Task 1: Extend Workflow Engine to Accept Initial Context

The workflow engine's `runWorkflow` only accepts a `workflowId`. The Bug Triage workflow needs `{{bugReport}}` injected as initial input. Add an optional `initialContext` parameter.

**Files:**
- Modify: `packages/relay/src/workflow-engine.ts`
- Modify: `packages/relay/src/workflow-types.ts`
- Test: `packages/relay/tests/workflow-engine.test.ts`

- [ ] **Step 1: Write a failing test for initial context**

In the existing workflow engine test file, add:

```typescript
it("should inject initial context into first node template", async () => {
  // Create a workflow with a single node using {{userInput}}
  const wfId = uuidv4();
  db.insertWorkflow(wfId, "test-initial-context", {
    nodes: [
      {
        id: "step1",
        type: "agent-task",
        label: "Step 1",
        config: { agent: "mock", taskTemplate: "Process: {{userInput}}" },
      },
    ],
    edges: [],
  });

  const result = await workflowEngine.runWorkflow(wfId, {
    userInput: "hello from initial context",
  });

  expect(result.status).toBe("completed");
  // The mock adapter should have received the resolved template
  const task = taskManager.listTasks().at(-1);
  expect(task).toBeDefined();
  // The task text should contain the resolved input
  expect(task!.history[0].parts[0].text).toContain("hello from initial context");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/relay/tests/workflow-engine.test.ts`
Expected: FAIL — `runWorkflow` doesn't accept a second argument.

- [ ] **Step 3: Update the workflow engine interface and implementation**

In `packages/relay/src/workflow-engine.ts`, change the interface and implementation:

```typescript
export interface LatticeWorkflowEngine {
  runWorkflow(workflowId: string, initialContext?: Record<string, string>): Promise<WorkflowRunResult>;
}
```

In the `runWorkflow` implementation, after `const context: WorkflowContext = {};`, add initial context seeding:

```typescript
// Seed initial context as a virtual "_input" node so templates can resolve
// initial variables via data mapping from root nodes
const inputData: Record<string, string> = initialContext ?? {};

// For root nodes (no incoming edges), resolve templates against initialContext directly
```

The actual change is in `executeNode` for agent-task nodes. After collecting `mappedData` from incoming edges, merge `initialContext` into it so root nodes can resolve `{{variableName}}` placeholders:

```typescript
// In executeNode, inside the agent-task branch, after the mappedData loop:
// Merge initial context for root nodes (no incoming data)
if (initialContext) {
  for (const [key, value] of Object.entries(initialContext)) {
    if (!(key in mappedData)) {
      mappedData[key] = value;
    }
  }
}
```

The full change to `runWorkflow`:

```typescript
async runWorkflow(workflowId: string, initialContext?: Record<string, string>): Promise<WorkflowRunResult> {
  const wfRow = db.getWorkflow(workflowId);
  if (!wfRow) throw new Error(`Workflow "${workflowId}" not found`);

  const def = JSON.parse(wfRow.definition) as WorkflowDefinition;
  const runId = uuidv4();

  db.insertWorkflowRun(runId, workflowId);
  db.updateWorkflowRun(runId, { status: "running" });
  eventBus.emit({ type: "workflow:started", runId, workflowId });

  const context: WorkflowContext = {};
  const nodeMap = new Map(def.nodes.map((n) => [n.id, n]));
  const layers = topoSort(def);

  let failed = false;

  for (const layer of layers) {
    await Promise.all(
      layer.map(async (nodeId) => {
        // ... existing skip logic unchanged ...

        try {
          const output = await executeNode(node, context, runId, def, initialContext);
          context[nodeId] = output;
        } catch (err) {
          context[nodeId] = {
            status: "failed",
            result: err instanceof Error ? err.message : String(err),
          };
          failed = true;
        }
      })
    );
  }

  // ... rest unchanged ...
}
```

And update `executeNode` signature to pass through `initialContext`:

```typescript
async function executeNode(
  node: WorkflowNode,
  context: WorkflowContext,
  runId: string,
  def: WorkflowDefinition,
  initialContext?: Record<string, string>
): Promise<NodeOutput> {
```

Inside the `agent-task` branch, after the `mappedData` loop, before `resolveTemplate`:

```typescript
// Merge initial context — lets root nodes resolve {{placeholders}} from input
if (initialContext) {
  for (const [key, value] of Object.entries(initialContext)) {
    if (!(key in mappedData)) {
      mappedData[key] = value;
    }
  }
}
```

- [ ] **Step 4: Update REST route to pass initial context**

In `packages/relay/src/server.ts`, the `/api/workflows/:id/run` route:

```typescript
app.post("/api/workflows/:id/run", async (req, res) => {
  try {
    if (!workflowEngine) { res.status(500).json({ error: "Workflow engine not configured" }); return; }
    const wf = db.getWorkflow(req.params.id);
    if (!wf) { res.status(404).json({ error: "Workflow not found" }); return; }
    const initialContext = req.body?.context as Record<string, string> | undefined;
    const result = await workflowEngine.runWorkflow(req.params.id, initialContext);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/relay/tests/workflow-engine.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/relay/src/workflow-engine.ts packages/relay/src/server.ts packages/relay/tests/workflow-engine.test.ts
git commit -m "feat(workflow): add initialContext parameter to runWorkflow"
```

---

### Task 2: Create Bug Triage Workflow Definition

**Files:**
- Create: `workflows/bug-triage.json`

- [ ] **Step 1: Create the workflow JSON**

```json
{
  "name": "Bug Triage Pipeline",
  "description": "Investigate a bug report across agents: Claude Code diagnoses, Codex reviews, OpenClaw composes a customer-facing reply.",
  "definition": {
    "nodes": [
      {
        "id": "investigate",
        "type": "agent-task",
        "label": "Investigate Bug",
        "config": {
          "agent": "claude-code",
          "taskTemplate": "Investigate this bug report and suggest a fix. Be concise — respond in 2-3 paragraphs max.\n\nBug report: {{bugReport}}"
        }
      },
      {
        "id": "review",
        "type": "agent-task",
        "label": "Review Fix",
        "config": {
          "agent": "codex",
          "taskTemplate": "Review this bug investigation and proposed fix for correctness. Note any issues. Be concise — respond in 1-2 paragraphs.\n\nInvestigation:\n{{investigation}}"
        }
      },
      {
        "id": "compose",
        "type": "agent-task",
        "label": "Compose Customer Reply",
        "config": {
          "agent": "openclaw",
          "taskTemplate": "Write a brief, friendly customer-facing message (3-4 sentences) summarizing what we found and the fix. Do not include technical details — keep it approachable.\n\nInvestigation: {{investigation}}\n\nReview: {{review}}"
        }
      }
    ],
    "edges": [
      {
        "source": "investigate",
        "target": "review",
        "dataMapping": {
          "artifacts[0].parts[0].text": "investigation"
        }
      },
      {
        "source": "investigate",
        "target": "compose",
        "dataMapping": {
          "artifacts[0].parts[0].text": "investigation"
        }
      },
      {
        "source": "review",
        "target": "compose",
        "dataMapping": {
          "artifacts[0].parts[0].text": "review"
        }
      }
    ]
  }
}
```

- [ ] **Step 2: Verify the workflow seeds on relay startup**

Run: `npx tsx packages/relay/src/main.ts`
Expected: Startup output includes `✓ 4 existing workflow(s)` (was 3 before).

- [ ] **Step 3: Commit**

```bash
git add workflows/bug-triage.json
git commit -m "feat: add Bug Triage Pipeline workflow definition"
```

---

### Task 3: Add Gateway Client Methods (subscribe, abort, sendMessage)

Add `subscribeToSessions()`, `abortSession()`, and a `deliver` parameter to the existing `request()` method on `OpenClawGatewayClient`.

**Files:**
- Modify: `packages/adapters/openclaw/src/openclaw-adapter.ts`

- [ ] **Step 1: Add `subscribeToSessions()` to the gateway client**

In the `OpenClawGatewayClient` class, add:

```typescript
/** Subscribe to session lifecycle and message events. */
async subscribeToSessions(): Promise<void> {
  await this.request("sessions.subscribe", {});
}
```

- [ ] **Step 2: Add `abortSession()` to the gateway client**

```typescript
/** Abort the active response on a session. */
async abortSession(sessionKey: string): Promise<void> {
  await this.request("chat.abort", { sessionKey });
}
```

- [ ] **Step 3: Add `sendMessage()` with deliver parameter to the gateway client**

```typescript
/** Send a message to a session. If deliver=true, push it through the originating channel (e.g., Telegram). */
async sendMessage(sessionKey: string, message: string, deliver: boolean): Promise<void> {
  await this.request("chat.send", {
    sessionKey,
    message,
    deliver,
    idempotencyKey: randomUUID(),
  });
}
```

- [ ] **Step 4: Call `subscribeToSessions()` after successful connect**

In the `connect()` method, after `this.connected = true; resolve();`, add session subscription. Change the connect resolve handler:

```typescript
this.pending.set(connectId, {
  resolve: () => {
    clearTimeout(timeout);
    this.connected = true;
    // Auto-subscribe to session events for bridge functionality
    this.subscribeToSessions().catch(() => {
      // Non-fatal — bridge features won't work but task execution still will
    });
    resolve();
  },
  reject: (err) => {
    clearTimeout(timeout);
    reject(err);
  },
});
```

- [ ] **Step 5: Rebuild and verify connection still works**

Run: `npm run build --workspace=packages/adapters/openclaw`
Then restart the relay and verify OpenClaw still shows as "ready".

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/openclaw/src/openclaw-adapter.ts
git commit -m "feat(openclaw): add session subscribe, abort, and sendMessage gateway methods"
```

---

### Task 4: Add Inbound Message Handling to the Adapter

Add `session.message` event processing, text extraction, trigger prefix matching, and the `onInboundMessage()` callback registration.

**Files:**
- Modify: `packages/adapters/openclaw/src/openclaw-adapter.ts`

- [ ] **Step 1: Add the InboundMessage type and handler registration**

At the top of the file (after imports), add:

```typescript
export interface InboundMessage {
  text: string;
  sessionKey: string;
  sender: string;
  channel: string;
}

export type InboundHandler = (message: InboundMessage) => void;
```

- [ ] **Step 2: Add the `extractUserText()` helper**

This strips OpenClaw's metadata preamble from Telegram messages. Add after the existing `extractText()` function:

```typescript
/**
 * Strip OpenClaw metadata preamble from inbound channel messages.
 * Telegram messages arrive wrapped with "Conversation info" and "Sender" JSON blocks.
 * Strategy: find the last closing triple-backtick, take everything after it.
 */
function extractUserText(raw: string): string {
  const lastFence = raw.lastIndexOf("```");
  if (lastFence === -1) return raw.trim();
  const afterFence = raw.slice(lastFence + 3).trim();
  return afterFence || raw.trim();
}
```

- [ ] **Step 3: Add the `extractSenderName()` helper**

```typescript
/** Extract sender display name from session origin metadata. */
function extractSenderName(session: Record<string, unknown> | undefined): string {
  if (!session) return "Unknown";
  const origin = session.origin as Record<string, unknown> | undefined;
  if (!origin) return "Unknown";
  const label = origin.label;
  return typeof label === "string" ? label : "Unknown";
}
```

- [ ] **Step 4: Add bridge config type to OpenClawConfig**

Update the `OpenClawConfig` interface:

```typescript
export interface BridgeConfig {
  enabled?: boolean;
  triggerPrefix?: string;
  ackMessage?: string;
}

export interface OpenClawConfig {
  gatewayUrl: string;
  gatewayToken: string;
  deviceToken: string;
  deviceIdentity: DeviceIdentity;
  promptPrefix?: string;
  bridge?: BridgeConfig;
}
```

- [ ] **Step 5: Add inbound message processing to the gateway client event dispatch**

In the `OpenClawGatewayClient` class, the `ws.on("message")` handler already dispatches events to `this.eventListeners`. The inbound message detection happens at the adapter level (in `onEvent` listeners), not in the client. No client changes needed — the existing event dispatch covers it.

- [ ] **Step 6: Add `onInboundMessage()` and bridge logic to the adapter**

In `createOpenClawAdapter`, after the existing `const adapter: LatticeAdapter = { ... }` block, add:

```typescript
const inboundHandlers: InboundHandler[] = [];
const bridgeConfig = config.bridge ?? {};
const bridgeEnabled = bridgeConfig.enabled !== false;
const triggerPrefix = (bridgeConfig.triggerPrefix ?? "BUG:").toUpperCase();
const ackMessage = bridgeConfig.ackMessage ?? "Bug received. Investigating across agents...";

function setupBridge(gw: OpenClawGatewayClient) {
  gw.onEvent((event) => {
    if (event.event !== "session.message") return;
    const payload = event.payload;
    if (!payload) return;

    const message = payload.message as Record<string, unknown> | undefined;
    if (!message || message.role !== "user") return;

    // Extract text
    const content = message.content as Array<Record<string, unknown>> | undefined;
    const rawText = content?.[0]?.text;
    if (typeof rawText !== "string") return;

    const userText = extractUserText(rawText);
    if (!userText.toUpperCase().startsWith(triggerPrefix)) return;

    const sessionKey = payload.sessionKey as string;
    const session = payload.session as Record<string, unknown> | undefined;
    const channel = (session?.origin as Record<string, unknown>)?.provider as string ?? "unknown";
    const sender = extractSenderName(session);
    const bugText = userText.slice(triggerPrefix.length).trim();

    // Abort auto-response and send ack
    gw.abortSession(sessionKey).catch(() => {});
    gw.sendMessage(sessionKey, ackMessage, true).catch(() => {});

    // Notify registered handlers
    for (const handler of inboundHandlers) {
      try {
        handler({ text: bugText, sessionKey, sender, channel });
      } catch { /* handler errors should not crash the bridge */ }
    }
  });
}
```

- [ ] **Step 7: Wire up the bridge on connect and expose methods**

Change `getClient()` to set up the bridge after connecting:

```typescript
async function getClient(): Promise<OpenClawGatewayClient> {
  if (!hasDeviceAuth) {
    throw new Error(
      "Gateway token, device token, and device identity are required.",
    );
  }
  if (client && client.isConnected()) return client;
  client?.close();
  client = new OpenClawGatewayClient(wsUrl, gatewayToken, deviceToken, deviceIdentity);
  await client.connect();
  if (bridgeEnabled) {
    setupBridge(client);
  }
  return client;
}
```

Change the return value of `createOpenClawAdapter` to include the bridge methods. Instead of returning just `adapter`, return an extended object:

```typescript
return Object.assign(adapter, {
  onInboundMessage(handler: InboundHandler): void {
    inboundHandlers.push(handler);
  },
  async sendToSession(sessionKey: string, text: string): Promise<void> {
    const gw = await getClient();
    await gw.sendMessage(sessionKey, text, true);
  },
});
```

Update the function return type:

```typescript
export function createOpenClawAdapter(config: OpenClawConfig): LatticeAdapter & {
  onInboundMessage(handler: InboundHandler): void;
  sendToSession(sessionKey: string, text: string): Promise<void>;
} {
```

- [ ] **Step 8: Rebuild**

Run: `npm run build --workspace=packages/adapters/openclaw`
Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
git add packages/adapters/openclaw/src/openclaw-adapter.ts
git commit -m "feat(openclaw): add Telegram bridge with inbound message interception"
```

---

### Task 5: Wire Up the Relay — Inbound Handler + Workflow Trigger + Reply Sender

Connect the adapter's bridge to the workflow engine in `main.ts`.

**Files:**
- Modify: `packages/relay/src/main.ts`

- [ ] **Step 1: Add the bridge wiring after OpenClaw adapter registration**

In `main.ts`, after the successful OpenClaw registration block (after `console.log("  ✓ openclaw        ready")`), add:

```typescript
// --- Telegram Bridge ---
// When an inbound BUG: message is intercepted, trigger the Bug Triage workflow
// and send the result back to the customer via Telegram.
if (adapters["openclaw"].bridge?.enabled !== false) {
  adapter.onInboundMessage(async (message) => {
    console.log(`  ⚡ Bridge: intercepted "${message.text.slice(0, 60)}..." from ${message.sender} (${message.channel})`);

    bus.emit({
      type: "message:received",
      from: message.sender,
      to: "lattice",
      taskId: "",
      preview: message.text.slice(0, 100),
    });

    // Find the Bug Triage workflow by name
    const workflows = db.listWorkflows();
    const bugTriageWf = workflows.find((w) => {
      const parsed = typeof w.definition === "string" ? JSON.parse(w.definition) : w.definition;
      return w.name === (adapters["openclaw"].bridge?.workflowName ?? "Bug Triage Pipeline");
    });

    if (!bugTriageWf) {
      console.log("  ⚠ Bridge: Bug Triage workflow not found, skipping");
      await adapter.sendToSession(message.sessionKey, "Sorry, the bug triage workflow is not configured.");
      return;
    }

    try {
      const result = await workflowEngine.runWorkflow(bugTriageWf.id, {
        bugReport: message.text,
      });

      // Extract the final step's output (compose node)
      const composeOutput = result.context["compose"];
      const replyText = composeOutput?.result
        ?? composeOutput?.artifacts?.[0]?.parts?.[0]?.text
        ?? "We investigated your bug report but couldn't generate a summary. Our team will follow up.";

      await adapter.sendToSession(message.sessionKey, replyText);

      bus.emit({
        type: "message:sent",
        from: "lattice",
        to: message.sender,
        taskId: "",
        preview: replyText.slice(0, 100),
      });

      console.log(`  ✓ Bridge: replied to ${message.sender}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ Bridge: workflow failed — ${errorMsg}`);
      await adapter.sendToSession(
        message.sessionKey,
        "We hit an issue investigating your bug. Our team has been notified."
      ).catch(() => {});
    }
  });

  console.log("  ⚡ Bridge: listening for BUG: messages");
}
```

- [ ] **Step 2: Ensure the `adapter` variable has the bridge type**

The `adapter` is currently typed as `LatticeAdapter` from the `createOpenClawAdapter` call. Update the variable to capture the full return type. Change:

```typescript
const adapter = createOpenClawAdapter({ gatewayUrl, gatewayToken, deviceToken, deviceIdentity, ...(promptPrefix !== undefined && { promptPrefix }) });
```

To:

```typescript
const bridgeOpts = adapters["openclaw"].bridge;
const adapter = createOpenClawAdapter({
  gatewayUrl, gatewayToken, deviceToken, deviceIdentity,
  ...(promptPrefix !== undefined && { promptPrefix }),
  ...(bridgeOpts && { bridge: bridgeOpts }),
});
```

- [ ] **Step 3: Rebuild and test manually**

Run: `npm run build --workspace=packages/adapters/openclaw`
Then restart the relay from the terminal with env vars set.

Expected startup output includes:
```
  ✓ openclaw        ready
  ⚡ Bridge: listening for BUG: messages
```

- [ ] **Step 4: End-to-end test — send a Telegram message**

Send a Telegram message to your bot: `BUG: test bug report from lattice bridge`

Expected:
1. Relay logs: `⚡ Bridge: intercepted "test bug report..." from Basil Liu ...`
2. Telegram receives ack: "Bug received. Investigating across agents..."
3. Workflow runs (may take 1-2 minutes)
4. Telegram receives final composed reply
5. Relay logs: `✓ Bridge: replied to Basil Liu ...`

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/main.ts
git commit -m "feat: wire Telegram bridge to Bug Triage workflow in relay"
```

---

### Task 6: Update Configuration and Documentation

**Files:**
- Modify: `lattice.config.json`
- Modify: `docs/setup-openclaw.md`

- [ ] **Step 1: Add bridge config to lattice.config.json**

```json
"openclaw": {
  "enabled": true,
  "gatewayUrl": "http://100.98.106.46:18789",
  "gatewayToken": "${OPENCLAW_GATEWAY_TOKEN}",
  "deviceToken": "${OPENCLAW_DEVICE_TOKEN}",
  "deviceIdentityPath": ".openclaw-device.json",
  "bridge": {
    "enabled": true,
    "triggerPrefix": "BUG:",
    "ackMessage": "Bug received. Investigating across agents...",
    "workflowName": "Bug Triage Pipeline"
  }
}
```

- [ ] **Step 2: Add bridge section to docs/setup-openclaw.md**

Add a section at the end before "Quick reference":

```markdown
## Telegram Bridge (Optional)

Lattice can intercept inbound Telegram messages and route them through multi-agent workflows.

### How it works

1. Customer sends a Telegram message to your OpenClaw bot starting with `BUG:`
2. Lattice intercepts the message, aborts OpenClaw's auto-response
3. Sends an acknowledgement ("Bug received. Investigating across agents...")
4. Triggers the Bug Triage Pipeline workflow across Claude Code, Codex, and OpenClaw
5. Sends the final customer-facing reply back via Telegram

### Configuration

In `lattice.config.json`, under `adapters.openclaw`:

\```json
"bridge": {
  "enabled": true,
  "triggerPrefix": "BUG:",
  "ackMessage": "Bug received. Investigating across agents...",
  "workflowName": "Bug Triage Pipeline"
}
\```

All fields are optional with sensible defaults. Set `enabled: false` to disable.

### Prerequisites

- OpenClaw gateway must be running with Telegram channel configured
- Both `OPENCLAW_GATEWAY_TOKEN` and `OPENCLAW_DEVICE_TOKEN` must be set
- The Bug Triage Pipeline workflow must be seeded (it is by default from `workflows/bug-triage.json`)
```

- [ ] **Step 3: Commit**

```bash
git add lattice.config.json docs/setup-openclaw.md
git commit -m "docs: add Telegram bridge configuration and documentation"
```

---

### Task 7: Clean Up and Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new workflow initial context test).

- [ ] **Step 2: Full end-to-end demo run**

1. Start relay: `npm start` (from terminal with env vars)
2. Start dashboard: `npm run dev:dashboard`
3. Open dashboard at http://localhost:3200
4. Send Telegram message: `BUG: dashboard freezes when uploading CSV`
5. Verify on dashboard:
   - Workflow run appears on Live Flow page
   - Agent cards light up as each step executes
   - Activity log shows message:received and message:sent events
6. Verify on Telegram:
   - Ack message received quickly
   - Final composed reply received after workflow completes

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final adjustments for Telegram bridge demo"
```
