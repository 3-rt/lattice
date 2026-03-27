import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { LatticeDB } from "./db.js";
import type { WorkflowDefinition } from "./workflow-types.js";

export interface SeedResult {
  loaded: number;
  skipped: number;
  errors: string[];
}

export function seedWorkflows(db: LatticeDB, workflowDir: string): SeedResult {
  const result: SeedResult = { loaded: 0, skipped: 0, errors: [] };

  if (!fs.existsSync(workflowDir)) {
    return result;
  }

  const files = fs
    .readdirSync(workflowDir)
    .filter((filename) => filename.endsWith(".json"));
  const existingNames = new Set(db.listWorkflows().map((workflow) => workflow.name));

  for (const file of files) {
    const filePath = path.join(workflowDir, file);

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as {
        name?: string;
        definition?: WorkflowDefinition;
      };

      if (
        !parsed.name ||
        !parsed.definition ||
        !Array.isArray(parsed.definition.nodes) ||
        !Array.isArray(parsed.definition.edges)
      ) {
        result.errors.push(`${file}: missing "name" or "definition" field`);
        continue;
      }

      if (existingNames.has(parsed.name)) {
        result.skipped += 1;
        continue;
      }

      db.insertWorkflow(uuidv4(), parsed.name, parsed.definition);
      existingNames.add(parsed.name);
      result.loaded += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      result.errors.push(`${file}: ${message}`);
    }
  }

  return result;
}
