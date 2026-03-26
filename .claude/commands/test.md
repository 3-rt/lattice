---
name: test
description: Run the Lattice test suite (all packages or specific)
---

Run tests for the Lattice project.

**Usage:**
- `/test` — run all tests: `npx vitest run`
- `/test relay` — run relay tests: `npx vitest run packages/relay`
- `/test dashboard` — run dashboard tests: `npx vitest run packages/dashboard`
- `/test smoke` — run smoke tests: `npx vitest run tests/smoke.test.ts`
- `/test <adapter>` — run adapter tests: `npx vitest run packages/adapters/<adapter>`

After running, summarize: total tests, passed, failed. If any fail, show the failure details and suggest fixes.
