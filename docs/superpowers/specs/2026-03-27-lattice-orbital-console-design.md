# Lattice Orbital Console Design

**Date:** 2026-03-27
**Status:** Draft approved in chat, written for review
**Scope:** Dashboard visual redesign and interaction polish for the existing React/Vite/Tailwind app in `packages/dashboard`

## Goal

Make the Lattice dashboard look more intentional, distinctive, and trustworthy while preserving usability for non-technical users.

The redesign should support three simultaneous goals:
- make Live Flow feel like mission control
- make Workflow Builder feel technical and exact
- keep the overall product approachable enough for mixed-skill teams

## Product Context

Lattice is a local control plane for orchestrating multiple AI agents through a relay, real-time dashboard, workflow engine, and CLI. Users need to dispatch tasks, watch execution, and compose workflows across Claude Code, OpenClaw, and Codex.

The visual system should communicate that this is an operational tool, not a concept demo.

## Recommended Direction

Use an `Orbital Console` aesthetic:
- dark-first UI with tinted blue-charcoal neutrals instead of pure black
- restrained signal colors that communicate system state clearly
- atmospheric live surfaces with depth and motion
- more exact, lower-drama builder surfaces for workflow authoring

This direction gives the product a memorable operational identity without drifting into sci-fi parody or excluding non-technical users.

## Users

### Technical users
- care about routing, live execution, workflow structure, and agent capability
- tolerate denser UI if hierarchy is strong
- expect precision in builder surfaces

### Non-technical users
- need obvious affordances and clear labels
- should be able to understand status and execute pre-built workflows
- need guidance without feeling like the UI is condescending

## Visual Strategy

### Theme
- Primary mode is dark.
- Backgrounds should use layered dark surfaces, not a flat near-black canvas.
- Neutrals should be subtly tinted toward blue-steel to unify the product.

### Color roles
- Active/system attention: electric blue
- Success: controlled green
- Warning: amber
- Failure: red
- Informational ambient accents: muted cyan-blue only where system activity benefits from emphasis

Color should encode meaning first. Decorative gradients and constant glow should be avoided outside focal surfaces.

### Typography
- Use one display face for major page headings and major section titles.
- Use one highly readable UI face for navigation, tables, forms, and node labels.
- Body text should stay straightforward and compact.
- Titles should feel authored, not default.

### Layout
- Keep the shell simple, but more intentional: stronger sidebar presence, better page framing, and a clearer sense of zone separation.
- Avoid generic repeated card grids where possible.
- Use spacing rhythm deliberately so every section does not breathe the same way.

### Motion
- Concentrate motion in high-value places:
- page-load reveals
- live flow edge/node activity
- task state changes
- subtle hover/focus states

Avoid continuous ambient animation on every component. Motion should support state comprehension.

## Surface-by-Surface Design

### Shell and navigation
- Sidebar should feel like the stable control spine of the app.
- Increase contrast between navigation chrome and content canvas.
- Add stronger active-state treatment so current location is unmistakable.
- Improve page headers so each page opens with a stronger title block and short supporting context.

### Agent Overview
- This is the friendliest operational entry point.
- Make the page easier to scan by improving the dispatch surface hierarchy and giving agent cards more structured content zones.
- Agent status should be prominent, readable, and useful without overusing color.
- Empty or offline states should feel informative, not alarming.

### Live Flow
- This is the visual centerpiece.
- The flow canvas should feel immersive and high-signal, with stronger depth, clearer framing, and better contrast between active and inactive states.
- Message activity, task progression, and node state changes should be legible at a glance.
- Motion and lighting effects should be concentrated here more than anywhere else in the app.

### Tasks
- Prioritize triage speed and readability over visual spectacle.
- Keep filters, statuses, and rows clean and compact.
- Use better hierarchy and more purposeful status styling instead of adding more decoration.
- Raw system detail should remain available but secondary.

### Workflows
- This surface should feel more technical and exact than Live Flow.
- Use cleaner panels, crisper boundaries, and less atmosphere.
- Node palette, editor canvas, and properties panel should feel like professional tooling rather than a themed demo.
- Structure and spacing should communicate control and precision.

## Interaction Principles

### Mixed-skill clarity
- Labels and helper copy should favor plain language.
- Critical actions should be obvious from placement and hierarchy.
- Status changes should be understandable without protocol knowledge.

### Progressive complexity
- Easy actions should look easy.
- Advanced information should stay accessible without dominating the interface.
- Non-technical users should not need to parse dense system jargon to get value.

### Signal over ornament
- Use visual emphasis to answer real questions:
- what is active
- what is healthy
- what needs attention
- what can I do next

If an element does not improve comprehension or hierarchy, it should be removed or reduced.

## Implementation Outline

The redesign should stay within the existing `packages/dashboard` architecture and avoid unnecessary structural churn.

### Foundation
- expand `index.css` into a real design-token layer with CSS custom properties for surfaces, text, borders, shadows, status colors, and motion timing
- introduce typography and page-frame conventions used across pages
- update shell/sidebar styling to establish the new visual language

### Shared surfaces
- unify panel, table, header, badge, and status treatments
- reduce ad hoc Tailwind color usage in favor of semantic tokens
- improve empty states and section intros for approachability

### Focal surfaces
- apply strongest visual lift to `LiveFlow`
- apply cleaner precision-focused lift to `Workflows`
- keep `AgentOverview` and `Tasks` calmer and more instructional

## Constraints

- Preserve current information architecture and routing.
- Do not require a dark/light theme switch in this phase.
- Do not add heavy UI abstraction unless repetition clearly justifies it.
- Respect existing real-time and React Flow behavior.

## Testing and Verification

The redesign should be verified with:
- dashboard build success
- manual review across all primary pages
- responsive checks at common laptop and tablet widths
- reduced-motion sanity check for any newly added animation

## Success Criteria

The redesign is successful when:
- Live Flow feels notably more memorable and operational
- Workflow Builder feels more professional and exact
- the overall product remains readable and welcoming to non-technical users
- the dashboard no longer looks like a generic dark React admin app

## Risks

### Risk: over-theming
Too much glow or density would make the app feel exclusive to technical users.

Mitigation:
- keep decoration concentrated in Live Flow
- keep copy and controls plainspoken

### Risk: inconsistency across pages
If every page interprets the theme differently, the app will feel fragmented.

Mitigation:
- establish tokens and shared chrome first
- then differentiate pages by intensity, not by unrelated styling systems

### Risk: precision loss in the workflow editor
If the mission-control look bleeds too far into the builder, authoring will feel less exact.

Mitigation:
- give the workflow surface a stricter, lower-drama treatment than Live Flow
