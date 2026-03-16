#!/usr/bin/env bun

import { Command } from "commander";
import { registerListCommand } from "./commands/list";
import { registerShowCommand } from "./commands/show";
import { registerTreeCommand } from "./commands/tree";
import { registerBlocksCommand } from "./commands/blocks";
import { registerCreateCommand } from "./commands/create";
import { registerDbCommand } from "./commands/db";
import { registerEditCommand } from "./commands/edit";
import { registerMoveCommand } from "./commands/move";
import { registerPropsCommand } from "./commands/props";
import { registerDeleteCommand } from "./commands/delete";
import { registerCacheCommand } from "./commands/cache";
import { registerConfigCommand } from "./commands/config";
import { registerStatsCommand } from "./commands/stats";
import { registerDoctorCommand } from "./commands/doctor";

const program = new Command();

program
  .name("nota")
  .description("A CLI tool for Notion")
  .version(require("../package.json").version)
  .addHelpText(
    "after",
    `
Setup:
  export NOTION_TOKEN=secret_xxxx   # required — find in Notion → Settings → Connections

Quick start:
  nota db list                                 # discover database IDs
  nota list                                    # list all accessible pages
  nota create "My note" --parent <db-id>       # create a page in a database
  nota show <page-id>                          # read page content as Markdown
  cat draft.md | nota edit <page-id>           # replace page content from file
  nota delete <page-id>                        # archive (soft-delete) a page

Pipe-friendly — all commands accept --json for scripting:
  nota list --json | jq '.[].id'
  nota db query <db-id> --json | jq '.[].title'`
  );

registerListCommand(program);
registerShowCommand(program);
registerTreeCommand(program);
registerBlocksCommand(program);
registerCreateCommand(program);
registerDbCommand(program);
registerEditCommand(program);
registerMoveCommand(program);
registerPropsCommand(program);
registerDeleteCommand(program);
registerStatsCommand(program);
registerDoctorCommand(program);
registerCacheCommand(program);
registerConfigCommand(program);

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
