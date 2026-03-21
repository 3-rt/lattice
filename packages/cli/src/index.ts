import { Command } from "commander";

const program = new Command();

program
  .name("lattice")
  .description("Lattice — AI Agent Control Plane CLI")
  .version("0.1.0");

// Commands will be added in subsequent tasks

program.parse();
