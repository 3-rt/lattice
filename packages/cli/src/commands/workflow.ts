import type { Command } from "commander";

export function registerWorkflow(program: Command) {
  const workflow = program
    .command("workflow")
    .description("Workflow management commands");

  workflow
    .command("list")
    .description("List available workflows")
    .action(async () => {
      console.log("Workflow engine is not yet implemented (Phase 3).");
      console.log("See: docs/specs/2026-03-21-lattice-design.md");
    });

  workflow
    .command("run <name>")
    .description("Run a workflow by name")
    .action(async (name: string) => {
      console.log(`Workflow engine is not yet implemented (Phase 3).`);
      console.log(`Cannot run workflow "${name}".`);
    });
}
