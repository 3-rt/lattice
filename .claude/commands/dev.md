---
name: dev
description: Start the Lattice relay server and dashboard for local development
---

Start the Lattice development environment:

1. Run `npx tsx packages/relay/src/main.ts` to start the relay on port 3100
2. Run `npm run dev --workspace=packages/dashboard` to start the dashboard on port 3200

If the user says "demo", use `npx tsx packages/relay/src/main.ts --demo` instead, which loads simulated adapters with no external dependencies.

After starting, confirm both are running by checking:
- Relay: `curl -s http://localhost:3100/api/agents | head -c 200`
- Dashboard: confirm the Vite dev server output shows the local URL
