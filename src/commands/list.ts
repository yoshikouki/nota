import { Command } from "commander";
import { searchPagesRaw, toNotaPage, type SortOrder } from "../api/pages";
import {
  getCachedPages,
  loadCache,
  saveCache,
  setCachedPages,
} from "../cache/store";

interface ListOptions {
  search?: string;
  sort?: string;
  cache?: boolean;
  json?: boolean;
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List Notion pages")
    .option("--search <query>", "Search pages by query")
    .option("--sort <order>", "Sort order: edited (default), created, none", "edited")
    .option("--cache", "Use cache when available")
    .option("--json", "Output raw JSON")
    .action(async (options: ListOptions) => {
      try {
        const sort = (options.sort ?? "edited") as SortOrder;
        // Cache key includes sort to avoid mixing sorted/unsorted results
        const cacheKey = options.search
          ? `${options.search}:${sort}`
          : `:${sort}`;

        const store = loadCache();
        let rawPages = options.cache ? getCachedPages(store, cacheKey) : null;

        if (!rawPages) {
          rawPages = await searchPagesRaw(options.search, sort);
          setCachedPages(store, rawPages, cacheKey);
          saveCache(store);
        }

        const pages = rawPages.map(toNotaPage);

        if (options.json) {
          console.log(JSON.stringify(pages, null, 2));
          return;
        }

        for (const page of pages) {
          const edited = page.lastEditedAt.toLocaleDateString("ja-JP");
          console.log(`  ${edited}  ${page.id}  ${page.title}`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });
}
