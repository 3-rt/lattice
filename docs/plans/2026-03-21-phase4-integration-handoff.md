# Phase 4: Integration Handoff Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute Phase 4 cleanly by coordinating the existing 4a, 4b, and 4c plans, minimizing merge conflicts and preserving a working dashboard at each checkpoint.

**Architecture:** Phase 4 is already decomposed into three detailed plans. `4a` and `4b` are frontend-heavy and can be implemented in parallel, but both touch the dashboard router and sidebar. `4c` should land after the UI work because it depends on the finished workflows and tasks views for the end-to-end smoke test and demo flow.

**Tech Stack:** React, Vite, Tailwind CSS, React Flow, Zustand, Node.js, Express, Vitest

**Detailed Plans:**
- `docs/plans/2026-03-21-phase4a-workflow-ui.md`
- `docs/plans/2026-03-21-phase4b-routing-stats-ui.md`
- `docs/plans/2026-03-21-phase4c-polish-demo.md`

---

## Shared File Ownership

These files are touched by multiple Phase 4 plans and need explicit coordination:

- `packages/dashboard/src/App.tsx`
  - `4a` adds `/workflows`
  - `4b` adds `/tasks`
- `packages/dashboard/src/components/layout/sidebar.tsx`
  - `4a` enables the `Workflows` nav item
  - `4b` enables the `Tasks` nav item

If implementing in parallel, do not let either worker replace the whole file without re-reading the latest version first.

---

### Task 1: Treat 4a, 4b, and 4c as separate execution units

**Files:**
- Reference: `docs/plans/2026-03-21-phase4a-workflow-ui.md`
- Reference: `docs/plans/2026-03-21-phase4b-routing-stats-ui.md`
- Reference: `docs/plans/2026-03-21-phase4c-polish-demo.md`

- [ ] **Step 1: Execute Phase 4a from its dedicated plan**

Run the workflow editor/runner work from:

```text
docs/plans/2026-03-21-phase4a-workflow-ui.md
```

- [ ] **Step 2: Execute Phase 4b from its dedicated plan**

Run the tasks history and routing stats work from:

```text
docs/plans/2026-03-21-phase4b-routing-stats-ui.md
```

- [ ] **Step 3: Execute Phase 4c only after the Phase 4 UI work is merged**

Run the seeding, smoke test, README, and demo flow work from:

```text
docs/plans/2026-03-21-phase4c-polish-demo.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-03-21-phase4a-workflow-ui.md docs/plans/2026-03-21-phase4b-routing-stats-ui.md docs/plans/2026-03-21-phase4c-polish-demo.md docs/plans/2026-03-21-phase4-integration-handoff.md
git commit -m "docs: add phase 4 implementation plans"
```

---

### Task 2: Use a merge-safe execution order

**Files:**
- Modify later during implementation: `packages/dashboard/src/App.tsx`
- Modify later during implementation: `packages/dashboard/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Preferred single-session order**

Use this order if one agent/session is implementing Phase 4:

```text
1. Phase 4a
2. Phase 4b
3. Reconcile App.tsx + sidebar.tsx
4. Phase 4c
```

- [ ] **Step 2: Preferred parallel order**

Use this split if multiple workers are implementing Phase 4:

```text
Worker A: Phase 4a except final shared-file reconciliation
Worker B: Phase 4b except final shared-file reconciliation
Integrator: merge App.tsx + sidebar.tsx, then run verification
Worker C or integrator: Phase 4c after merged UI branch is stable
```

- [ ] **Step 3: Reconcile `App.tsx` explicitly**

The final dashboard router must include all four routes:

```typescript
<Route path="/" element={<AgentOverview />} />
<Route path="/flow" element={<LiveFlow />} />
<Route path="/tasks" element={<TasksPage />} />
<Route path="/workflows" element={<Workflows />} />
```

- [ ] **Step 4: Reconcile `sidebar.tsx` explicitly**

The final sidebar nav must enable both integration links:

```typescript
{ to: "/tasks", icon: ListTodo, label: "Tasks" }
{ to: "/workflows", icon: GitBranch, label: "Workflows" }
```

---

### Task 3: Run verification at the right checkpoints

**Files:**
- Verify during implementation: `packages/dashboard`
- Verify during implementation: `packages/relay`
- Verify during implementation: `tests/smoke.test.ts`

- [ ] **Step 1: Verify frontend after Phase 4a and again after Phase 4b merge**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
cd /Users/basilliu/lattice/packages/dashboard && npx vite build
```

- [ ] **Step 2: Verify relay tests when Phase 4c lands**

```bash
cd /Users/basilliu/lattice && npx vitest run packages/relay/tests/seed-workflows.test.ts tests/smoke.test.ts
```

- [ ] **Step 3: Run final end-to-end verification**

Use the manual checklist and commands from:

```text
docs/plans/2026-03-21-phase4c-polish-demo.md
```
