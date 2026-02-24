#!/usr/bin/env bun

import { Command } from "commander";
import { registerListCommand } from "./commands/list";
import { registerShowCommand } from "./commands/show";
import { registerTreeCommand } from "./commands/tree";
import { registerCreateCommand } from "./commands/create";
import { registerDbCommand } from "./commands/db";
import { registerEditCommand } from "./commands/edit";
import { registerDeleteCommand } from "./commands/delete";
import { registerCacheCommand } from "./commands/cache";
import { registerConfigCommand } from "./commands/config";
import { registerStatsCommand } from "./commands/stats";

const program = new Command();

program
  .name("nota")
  .description("A CLI tool for Notion")
  .version("0.1.0");

registerListCommand(program);
registerShowCommand(program);
registerTreeCommand(program);
registerCreateCommand(program);
registerDbCommand(program);
registerEditCommand(program);
registerDeleteCommand(program);
registerStatsCommand(program);
registerCacheCommand(program);
registerConfigCommand(program);

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
