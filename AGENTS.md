# Lattice Agent Guide

## Project Overview

Lattice is a local control plane for AI agent orchestration via the A2A (Agent-to-Agent) protocol.

Tagline:
`Connect your AI agents. Orchestrate everything.`

The product combines:
- a relay server
- a real-time dashboard
- a CLI
- multiple agent adapters
- a workflow engine

Primary agents in scope:
- Claude Code
- OpenClaw
- Codex

## What This Repo Is For

The dashboard and surrounding tooling should help mixed-skill teams:
- dispatch tasks to agents
- understand live system activity
- create and run multi-agent workflows

The product must work for both:
- technical users who care about orchestration fidelity and workflow structure
- non-technical users who need clear status, obvious actions, and approachable language

## Architecture Snapshot

Core packages:
- `packages/relay` — Express relay, task manager, registry, router, SSE, SQLite
- `packages/dashboard` — React + Vite + Tailwind dashboard
- `packages/cli` — thin REST client
- `packages/adapters/*` — Claude Code, OpenClaw, and Codex integrations

Important runtime facts:
- relay default port: `3100`
- dashboard default port: `3200`
- SSE drives the dashboard's real-time updates
- workflow editing uses React Flow with Zustand-managed external state

## Working Rules

- Follow existing repo patterns unless there is a clear, task-relevant reason to improve them.
- Preserve current information architecture unless the task explicitly calls for a change.
- Keep the dashboard readable for non-technical users even when adding technically rich features.
- Prefer semantic styling reuse over ad hoc Tailwind color scattering.
- Avoid introducing new abstractions unless repetition clearly justifies them.

## React Flow Constraints

The workflow editor depends on a few non-obvious patterns:

- Use `onInit` to capture `ReactFlowInstance`, then `screenToFlowPosition()` for drag-drop coordinates.
- Use refs in `onNodesChange` and `onEdgesChange` to avoid stale closure bugs.
- Do not sync React Flow `dimensions` changes back into external state.

## Dashboard Design Context

### Users
Lattice serves mixed-skill teams working with Claude Code, OpenClaw, and Codex. The dashboard should support both technical operators and non-technical collaborators.

Primary jobs:
- dispatch tasks to the right agent
- understand what the system is doing right now
- build and run workflows that coordinate multiple agents

### Brand Personality
The product should feel:
- assured
- technical
- approachable

Emotional goals:
- confidence during live activity
- clarity during setup and triage
- approachability for first-time and non-technical users

### Aesthetic Direction
Use a dark-first `Orbital Console` direction.

Surface-specific tone:
- `Live Flow` should feel like mission control
- `Workflows` should feel technical and exact
- `Agents`, `Tasks`, and primary navigation should stay friendlier and calmer

Avoid:
- generic neon-on-black AI styling
- purple-heavy gradients
- decorative glow on every surface
- overly dense UI that excludes non-technical users

### Design Principles
1. Make system state obvious without requiring technical background.
2. Concentrate visual drama in live orchestration surfaces.
3. Use color as signal, not decoration.
4. Keep workflow authoring precise and structured.
5. Pair strong hierarchy with plainspoken labels.

## Key References

- `CLAUDE.md` — project overview and architecture context
- `.impeccable.md` — design context for future UI work
- `docs/superpowers/specs/2026-03-27-lattice-orbital-console-design.md` — approved dashboard redesign spec
