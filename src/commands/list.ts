import { Command } from "commander";
import { searchPages } from "../api/pages";

interface ListOptions {
  search?: string;
  json?: boolean;
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List Notion pages")
    .option("--search <query>", "Search pages by query")
    .option("--json", "Output raw JSON")
    .action(async (options: ListOptions) => {
      try {
        const pages = await searchPages(options.search);

        if (options.json) {
          console.log(JSON.stringify(pages, null, 2));
          return;
        }

        for (const page of pages) {
          console.log(`  ${page.id}  ${page.title}`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });
}
