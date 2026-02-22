import { Command } from "commander";
import { searchPagesRaw, toNotaPage } from "../api/pages";
import {
  getCachedPages,
  loadCache,
  saveCache,
  setCachedPages,
} from "../cache/store";

interface ListOptions {
  search?: string;
  cache?: boolean;
  json?: boolean;
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List Notion pages")
    .option("--search <query>", "Search pages by query")
    .option("--cache", "Use cache when available")
    .option("--json", "Output raw JSON")
    .action(async (options: ListOptions) => {
      try {
        const store = loadCache();
        let rawPages =
          options.cache ? getCachedPages(store, options.search) : null;

        if (!rawPages) {
          rawPages = await searchPagesRaw(options.search);
          setCachedPages(store, rawPages, options.search);
          saveCache(store);
        }

        const pages = rawPages.map(toNotaPage);

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
