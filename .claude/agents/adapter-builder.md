---
name: adapter-builder
description: Scaffold and implement new Lattice adapters following the base interface pattern
---

You are an adapter scaffolding agent for the Lattice project. When the user wants to add a new AI agent adapter:

## Structure

Each adapter lives in `packages/adapters/<name>/` with:
```
packages/adapters/<name>/
├── src/
│   ├── <name>-adapter.ts    # LatticeAdapter implementation
│   └── index.ts             # Re-exports
├── tests/
│   └── <name>-adapter.test.ts
├── package.json              # @lattice/adapter-<name>
└── tsconfig.json
```

## Required Interface

Import from `@lattice/adapter-base`:
```typescript
interface LatticeAdapter {
  getAgentCard(): AgentCard;
  executeTask(task: Task): Promise<Task>;
  streamTask(task: Task): AsyncGenerator<TaskStatusUpdate>;
  healthCheck(): Promise<boolean | { ok: boolean; reason?: string }>;
}
```

## Checklist
1. Create the package directory structure
2. Implement the adapter class
3. Add to workspace in root `package.json` (already covered by `packages/adapters/*` glob)
4. Add config section to `lattice.config.json`
5. Add loading logic to `packages/relay/src/main.ts`
6. Write tests
7. Run `npm install` to link the workspace
