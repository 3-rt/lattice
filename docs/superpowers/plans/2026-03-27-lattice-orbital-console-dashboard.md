# Lattice Orbital Console Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Lattice dashboard so Live Flow feels like mission control, Workflow Builder feels more precise and technical, and the rest of the app stays approachable for mixed-skill users.

**Architecture:** Keep the existing `packages/dashboard` page and store structure, but establish a stronger shared visual foundation through CSS tokens and shared shell/page conventions. Apply the most dramatic treatment to `Live Flow`, a stricter tooling aesthetic to `Workflows`, and calmer readability upgrades to `Agents` and `Tasks`.

**Tech Stack:** React 18, Vite, Tailwind CSS, Framer Motion, React Router, Zustand, React Flow

---

## File Structure

### Shared styling and shell
- Modify: `packages/dashboard/src/index.css`
  Purpose: define dashboard-wide visual tokens, page-level background treatment, typography rules, motion utilities, and semantic surface classes
- Modify: `packages/dashboard/src/components/layout/shell.tsx`
  Purpose: establish the new page frame, content canvas, and shared background layers
- Modify: `packages/dashboard/src/components/layout/sidebar.tsx`
  Purpose: restyle navigation into the stable control spine with clearer active states and connection status treatment

### Shared page framing
- Modify: `packages/dashboard/src/pages/agent-overview.tsx`
  Purpose: add stronger page intro hierarchy and friendlier overview framing
- Modify: `packages/dashboard/src/pages/tasks-page.tsx`
  Purpose: clarify tabs, page intro, and operational hierarchy
- Modify: `packages/dashboard/src/pages/live-flow.tsx`
  Purpose: create the mission-control page frame around dispatch, canvas, and activity log
- Modify: `packages/dashboard/src/pages/workflows.tsx`
  Purpose: create a more exact, tool-like frame for editor and runner tabs

### Agents and tasks surfaces
- Modify: `packages/dashboard/src/components/agents/agent-grid.tsx`
  Purpose: tune layout rhythm and section composition for overview cards
- Modify: `packages/dashboard/src/components/agents/agent-card.tsx`
  Purpose: restructure card content zones, status affordances, and offline guidance presentation
- Modify: `packages/dashboard/src/components/tasks/task-dispatch-bar.tsx`
  Purpose: align dispatch controls with the new shared surface language
- Modify: `packages/dashboard/src/components/tasks/task-table.tsx`
  Purpose: restyle task history into a cleaner triage surface with better status hierarchy
- Modify: `packages/dashboard/src/components/tasks/task-filters.tsx`
  Purpose: align filter controls with the shared input treatment
- Modify: `packages/dashboard/src/components/tasks/routing-stats-table.tsx`
  Purpose: bring routing stats into the same semantic table styling

### Live flow focal surfaces
- Modify: `packages/dashboard/src/components/flow/flow-canvas.tsx`
  Purpose: increase depth, framing, and visual emphasis on live orchestration activity
- Modify: `packages/dashboard/src/components/flow/task-log-panel.tsx`
  Purpose: improve scanability and align the side panel with the mission-control tone
- Modify: `packages/dashboard/src/components/flow/agent-node.tsx`
  Purpose: refine node styling so active/inactive/healthy states read clearly
- Modify: `packages/dashboard/src/components/flow/relay-node.tsx`
  Purpose: align relay visuals with the updated system center styling
- Modify: `packages/dashboard/src/components/flow/animated-edge.tsx`
  Purpose: tune edge color, opacity, and motion intensity to feel purposeful instead of decorative
- Modify: `packages/dashboard/src/components/flow/empty-state.tsx`
  Purpose: make empty flow states more welcoming and instructional

### Workflow builder surfaces
- Modify: `packages/dashboard/src/components/workflows/workflow-editor.tsx`
  Purpose: create cleaner editor chrome and split palette/canvas/properties into a more exact tool layout
- Modify: `packages/dashboard/src/components/workflows/node-palette.tsx`
  Purpose: sharpen draggable node affordances and reduce decorative noise
- Modify: `packages/dashboard/src/components/workflows/properties-panel.tsx`
  Purpose: improve form clarity and make the inspector feel more professional
- Modify: `packages/dashboard/src/components/workflows/agent-task-node.tsx`
  Purpose: align workflow nodes with the new precise editor styling
- Modify: `packages/dashboard/src/components/workflows/condition-node.tsx`
  Purpose: visually distinguish logic nodes without adding noise
- Modify: `packages/dashboard/src/components/workflows/workflow-edge.tsx`
  Purpose: make workflow connections crisp and lower-drama than Live Flow
- Modify: `packages/dashboard/src/components/workflows/workflow-list.tsx`
  Purpose: align list styling with the calmer operational surfaces
- Modify: `packages/dashboard/src/components/workflows/workflow-runner.tsx`
  Purpose: ensure the runner view inherits the same exact-but-readable page treatment

### Verification
- Test: `packages/dashboard/package.json`
  Purpose: run the dashboard build command as the minimum structural verification step

## Chunk 1: Foundation and Shared Shell

### Task 1: Establish visual tokens in dashboard CSS

**Files:**
- Modify: `packages/dashboard/src/index.css`
- Test: `packages/dashboard/package.json`

- [ ] **Step 1: Inspect current ad hoc color and surface usage**

Run: `rg "gray-|lattice-|emerald-|amber-|red-" packages/dashboard/src -g '!**/*.test.ts'`
Expected: multiple scattered Tailwind color usages across layout, pages, and dashboard components

- [ ] **Step 2: Write the failing visual target as a checklist in the CSS file comments or local notes**

Include targets for:
- blue-charcoal dark theme tokens
- semantic text/surface/border/status tokens
- page background layers
- reusable panel/table/input/button helpers
- reduced-motion support for new animations

Expected: a concrete token checklist to implement, replacing vague restyling

- [ ] **Step 3: Implement the token layer and semantic utility classes**

Add to `packages/dashboard/src/index.css`:
- root CSS custom properties for backgrounds, panels, borders, text, status colors, shadows, and accent ramps
- base `body` styling for the dark-first environment
- reusable semantic classes for page headers, panels, badges, inputs, and section labels
- restrained background/motion helpers for the new shell

- [ ] **Step 4: Build the dashboard to catch syntax or Tailwind issues**

Run: `npm run build --workspace=packages/dashboard`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/index.css
git commit -m "feat(dashboard): add orbital console design tokens"
```

### Task 2: Restyle shell and sidebar around the new shared language

**Files:**
- Modify: `packages/dashboard/src/components/layout/shell.tsx`
- Modify: `packages/dashboard/src/components/layout/sidebar.tsx`
- Test: `packages/dashboard/package.json`

- [ ] **Step 1: Write the failing structural expectations**

Capture expected shell changes:
- stronger page canvas framing
- sidebar as stable control spine
- clearer content separation
- connection status as a purpose-built status row

Expected: a short implementation checklist that prevents drifting into arbitrary styling

- [ ] **Step 2: Update `shell.tsx` to provide the new page frame**

Implement:
- layered app background
- content canvas wrapper
- spacing that works for overview pages and full-bleed surfaces

- [ ] **Step 3: Update `sidebar.tsx` to match the control-spine design**

Implement:
- stronger brand/header treatment
- better active nav state
- calmer inactive state
- more deliberate connection status presentation

- [ ] **Step 4: Rebuild the dashboard**

Run: `npm run build --workspace=packages/dashboard`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/layout/shell.tsx packages/dashboard/src/components/layout/sidebar.tsx
git commit -m "feat(dashboard): restyle shell and sidebar"
```

## Chunk 2: Shared Operational Pages

### Task 3: Upgrade page intros and overview composition

**Files:**
- Modify: `packages/dashboard/src/pages/agent-overview.tsx`
- Modify: `packages/dashboard/src/components/agents/agent-grid.tsx`
- Modify: `packages/dashboard/src/components/agents/agent-card.tsx`
- Modify: `packages/dashboard/src/components/tasks/task-dispatch-bar.tsx`
- Test: `packages/dashboard/package.json`

- [ ] **Step 1: Inspect current composition**

Run: `sed -n '1,240p' packages/dashboard/src/components/agents/agent-grid.tsx`
Expected: current grid and dispatch composition are present but visually basic

- [ ] **Step 2: Write the failing UI checklist**

Define the target:
- clearer page intro hierarchy
- dispatch bar reads as a primary action surface
- agent cards use stronger content zoning
- offline guidance feels helpful, not alarming

- [ ] **Step 3: Implement the overview and agent card redesign**

Update the relevant files so:
- page intro uses the new shared heading treatment
- dispatch bar becomes more intentional and approachable
- cards get clearer separation between name/status, description, skills, and metadata
- offline messaging aligns with the new warm warning treatment

- [ ] **Step 4: Rebuild the dashboard**

Run: `npm run build --workspace=packages/dashboard`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/pages/agent-overview.tsx packages/dashboard/src/components/agents/agent-grid.tsx packages/dashboard/src/components/agents/agent-card.tsx packages/dashboard/src/components/tasks/task-dispatch-bar.tsx
git commit -m "feat(dashboard): redesign agent overview surfaces"
```

### Task 4: Clean up task history and routing pages

**Files:**
- Modify: `packages/dashboard/src/pages/tasks-page.tsx`
- Modify: `packages/dashboard/src/components/tasks/task-table.tsx`
- Modify: `packages/dashboard/src/components/tasks/task-filters.tsx`
- Modify: `packages/dashboard/src/components/tasks/routing-stats-table.tsx`
- Test: `packages/dashboard/package.json`

- [ ] **Step 1: Inspect current task and stats surface structure**

Run: `sed -n '1,260p' packages/dashboard/src/components/tasks/task-table.tsx`
Expected: current task presentation is functional but visually generic

- [ ] **Step 2: Write the failing UI checklist**

Define the target:
- cleaner task/routing page intro
- tabs that read like operational views, not default tabs
- filters and tables aligned to shared semantic styling
- status emphasis based on triage usefulness

- [ ] **Step 3: Implement task and routing restyling**

Update the listed files so tasks become denser and clearer without becoming visually loud.

- [ ] **Step 4: Rebuild the dashboard**

Run: `npm run build --workspace=packages/dashboard`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/pages/tasks-page.tsx packages/dashboard/src/components/tasks/task-table.tsx packages/dashboard/src/components/tasks/task-filters.tsx packages/dashboard/src/components/tasks/routing-stats-table.tsx
git commit -m "feat(dashboard): refine task history and routing surfaces"
```

## Chunk 3: Live Flow Mission Control

### Task 5: Reframe the Live Flow page as the focal mission-control surface

**Files:**
- Modify: `packages/dashboard/src/pages/live-flow.tsx`
- Modify: `packages/dashboard/src/components/flow/flow-canvas.tsx`
- Modify: `packages/dashboard/src/components/flow/task-log-panel.tsx`
- Modify: `packages/dashboard/src/components/flow/empty-state.tsx`
- Test: `packages/dashboard/package.json`

- [ ] **Step 1: Inspect the current live flow composition**

Run: `sed -n '1,260p' packages/dashboard/src/components/flow/flow-canvas.tsx`
Expected: current structure shows the existing canvas and side panel split

- [ ] **Step 2: Write the failing UI checklist**

Define the target:
- top bar feels like an operations header
- canvas has stronger depth and framing
- side log panel is easier to scan
- empty and low-activity states still feel intentional

- [ ] **Step 3: Implement the new page frame and supporting surface styles**

Apply the strongest visual lift here while keeping labels and controls clear.

- [ ] **Step 4: Rebuild the dashboard**

Run: `npm run build --workspace=packages/dashboard`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/pages/live-flow.tsx packages/dashboard/src/components/flow/flow-canvas.tsx packages/dashboard/src/components/flow/task-log-panel.tsx packages/dashboard/src/components/flow/empty-state.tsx
git commit -m "feat(dashboard): redesign live flow mission control"
```

### Task 6: Tune live nodes and edges for signal clarity

**Files:**
- Modify: `packages/dashboard/src/components/flow/agent-node.tsx`
- Modify: `packages/dashboard/src/components/flow/relay-node.tsx`
- Modify: `packages/dashboard/src/components/flow/animated-edge.tsx`
- Test: `packages/dashboard/package.json`

- [ ] **Step 1: Inspect current node and edge styling**

Run: `sed -n '1,260p' packages/dashboard/src/components/flow/agent-node.tsx`
Run: `sed -n '1,260p' packages/dashboard/src/components/flow/relay-node.tsx`
Run: `sed -n '1,260p' packages/dashboard/src/components/flow/animated-edge.tsx`
Expected: node and edge visuals are present and can be tuned without store changes

- [ ] **Step 2: Write the failing UI checklist**

Define the target:
- active vs inactive states read instantly
- relay feels like the system center
- edge motion feels informative rather than ornamental

- [ ] **Step 3: Implement the node and edge tuning**

Keep interaction behavior intact. Only adjust visuals and presentation logic needed for clarity.

- [ ] **Step 4: Rebuild the dashboard**

Run: `npm run build --workspace=packages/dashboard`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/flow/agent-node.tsx packages/dashboard/src/components/flow/relay-node.tsx packages/dashboard/src/components/flow/animated-edge.tsx
git commit -m "feat(dashboard): tune live flow nodes and edges"
```

## Chunk 4: Workflow Tooling Precision

### Task 7: Reframe the workflows page and editor chrome

**Files:**
- Modify: `packages/dashboard/src/pages/workflows.tsx`
- Modify: `packages/dashboard/src/components/workflows/workflow-editor.tsx`
- Modify: `packages/dashboard/src/components/workflows/node-palette.tsx`
- Modify: `packages/dashboard/src/components/workflows/properties-panel.tsx`
- Test: `packages/dashboard/package.json`

- [ ] **Step 1: Inspect current workflow editor support surfaces**

Run: `sed -n '1,240p' packages/dashboard/src/components/workflows/node-palette.tsx`
Run: `sed -n '1,260p' packages/dashboard/src/components/workflows/properties-panel.tsx`
Expected: palette and properties panel are currently functional but visually basic

- [ ] **Step 2: Write the failing UI checklist**

Define the target:
- workflows page header feels more like tooling than a general overview page
- tab chrome is clearer and more exact
- editor sidebars become cleaner and more deliberate
- inputs and labels feel professional and technical

- [ ] **Step 3: Implement the page and editor chrome redesign**

Keep React Flow interaction patterns intact while making the surrounding UI more precise and less atmospheric than Live Flow.

- [ ] **Step 4: Rebuild the dashboard**

Run: `npm run build --workspace=packages/dashboard`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/pages/workflows.tsx packages/dashboard/src/components/workflows/workflow-editor.tsx packages/dashboard/src/components/workflows/node-palette.tsx packages/dashboard/src/components/workflows/properties-panel.tsx
git commit -m "feat(dashboard): refine workflow editor chrome"
```

### Task 8: Tune workflow nodes, edges, and runner/list surfaces

**Files:**
- Modify: `packages/dashboard/src/components/workflows/agent-task-node.tsx`
- Modify: `packages/dashboard/src/components/workflows/condition-node.tsx`
- Modify: `packages/dashboard/src/components/workflows/workflow-edge.tsx`
- Modify: `packages/dashboard/src/components/workflows/workflow-list.tsx`
- Modify: `packages/dashboard/src/components/workflows/workflow-runner.tsx`
- Test: `packages/dashboard/package.json`

- [ ] **Step 1: Inspect current workflow focal components**

Run: `sed -n '1,240p' packages/dashboard/src/components/workflows/agent-task-node.tsx`
Run: `sed -n '1,240p' packages/dashboard/src/components/workflows/condition-node.tsx`
Run: `sed -n '1,240p' packages/dashboard/src/components/workflows/workflow-edge.tsx`
Run: `sed -n '1,240p' packages/dashboard/src/components/workflows/workflow-runner.tsx`
Expected: the editor primitives and runner view can be restyled independently of workflow logic

- [ ] **Step 2: Write the failing UI checklist**

Define the target:
- workflow nodes feel crisp and tool-like
- condition nodes remain visually distinct
- workflow edges are quieter than Live Flow edges
- runner/list surfaces remain readable for mixed-skill users

- [ ] **Step 3: Implement the workflow surface refinements**

Keep the builder precise and lower-drama than the live canvas.

- [ ] **Step 4: Rebuild the dashboard**

Run: `npm run build --workspace=packages/dashboard`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/workflows/agent-task-node.tsx packages/dashboard/src/components/workflows/condition-node.tsx packages/dashboard/src/components/workflows/workflow-edge.tsx packages/dashboard/src/components/workflows/workflow-list.tsx packages/dashboard/src/components/workflows/workflow-runner.tsx
git commit -m "feat(dashboard): refine workflow nodes and runner surfaces"
```

## Chunk 5: Final Verification

### Task 9: Run full dashboard verification and capture residual gaps

**Files:**
- Test: `packages/dashboard/package.json`
- Modify: `docs/superpowers/specs/2026-03-27-lattice-orbital-console-design.md` (only if implementation intentionally diverges)

- [ ] **Step 1: Run the dashboard build**

Run: `npm run build --workspace=packages/dashboard`
Expected: build succeeds

- [ ] **Step 2: Run targeted dashboard tests if any cover modified logic**

Run: `npm test --workspace=packages/dashboard -- --runInBand`
Expected: existing dashboard tests pass, or the command reports there is no `test` script and that gap is noted

- [ ] **Step 3: Manually review the dashboard in the browser**

Check:
- Agents page readability
- Live Flow mission-control emphasis
- Tasks page clarity
- Workflow editor precision
- responsive behavior at common laptop and tablet widths
- reduced-motion sanity for newly added animations

Expected: the redesign matches the approved spec without breaking core interactions

- [ ] **Step 4: Document any intentional divergence**

If implementation differs materially from the spec, update the spec or note the delta in commit/PR text.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard docs/superpowers/specs/2026-03-27-lattice-orbital-console-design.md
git commit -m "feat(dashboard): complete orbital console redesign"
```
