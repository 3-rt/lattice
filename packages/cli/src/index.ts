import { Command } from "commander";
import { registerStart } from "./commands/start.js";
import { registerSend } from "./commands/send.js";
import { registerAgents } from "./commands/agents.js";
import { registerStatus } from "./commands/status.js";
import { registerRouting } from "./commands/routing.js";
import { registerWorkflow } from "./commands/workflow.js";

const program = new Command();

program
  .name("lattice")
  .description("Lattice \u2014 AI Agent Control Plane CLI")
  .version("0.1.0");

registerStart(program);
registerSend(program);
registerAgents(program);
registerStatus(program);
registerRouting(program);
registerWorkflow(program);

program.parse();
