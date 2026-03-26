---
name: build
description: Build all Lattice packages
---

Build all packages in the monorepo:

```bash
npm run build --workspaces
```

If build fails, diagnose the TypeScript errors and fix them. Each package builds with tsup (configured in its own package.json).
