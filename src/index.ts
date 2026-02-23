#!/usr/bin/env bun

import { Command } from "commander";
import { registerListCommand } from "./commands/list";
import { registerShowCommand } from "./commands/show";
import { registerTreeCommand } from "./commands/tree";
import { registerCacheCommand } from "./commands/cache";
import { registerConfigCommand } from "./commands/config";

const program = new Command();

program
  .name("nota")
  .description("A CLI tool for Notion")
  .version("0.1.0");

registerListCommand(program);
registerShowCommand(program);
registerTreeCommand(program);
registerCacheCommand(program);
registerConfigCommand(program);

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
