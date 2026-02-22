#!/usr/bin/env bun

import { Command } from "commander";

const program = new Command();

program
  .name("nota")
  .description("A CLI tool for Notion")
  .version("0.1.0");

// Commands will be registered here
// import "./commands/list";
// import "./commands/show";
// import "./commands/tree";
// import "./commands/edit";
// import "./commands/delete";
// import "./commands/cache";

program.parse();
