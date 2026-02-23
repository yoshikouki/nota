import { Command } from "commander";
import {
  searchPagesRaw,
  toNotaPage,
  type SortOrder,
} from "../api/pages";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import {
  getCachedPages,
  loadCache,
  saveCache,
  setCachedPages,
} from "../cache/store";
import { loadConfig } from "../utils/config-file";

interface ListOptions {
  search?: string;
  sort?: string;
  database?: string;
  cache?: boolean;
  json?: boolean;
}

function getListCacheKey(
  query: string | undefined,
  sort: SortOrder,
  database: string | undefined
): string {
  const normalizedQuery = query ?? "";
  const normalizedDatabase = database ?? "";
  return `q=${normalizedQuery}|sort=${sort}|db=${normalizedDatabase}`;
}

function filterByDatabase(
  pages: PageObjectResponse[],
  databaseId: string
): PageObjectResponse[] {
  return pages.filter(
    (page) =>
      page.parent.type === "database_id" && page.parent.database_id === databaseId
  );
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List Notion pages")
    .option("--search <query>", "Search pages by query")
    .option("--sort <order>", "Sort order: edited (default), none")
    .option("--database <id>", "Filter pages by database ID")
    .option("--cache", "Use cache when available")
    .option("--json", "Output raw JSON")
    .action(async (options: ListOptions, command: Command) => {
      try {
        const config = loadConfig();
        const sortSource = command.getOptionValueSource("sort");
        const sortOption =
          sortSource === "cli"
            ? options.sort
            : (options.sort ?? config.list?.sort ?? "edited");
        if (sortOption !== "edited" && sortOption !== "none") {
          console.error("Error: --sort must be one of: edited, none");
          process.exit(1);
        }
        const sort: SortOrder = sortOption;

        const databaseSource = command.getOptionValueSource("database");
        const databaseId =
          databaseSource === "cli"
            ? options.database
            : (options.database ?? config.list?.database);

        const cacheSource = command.getOptionValueSource("cache");
        const allowStale =
          options.cache === true ||
          (cacheSource !== "cli" && config.cache?.enabled === true);

        const cacheKey = getListCacheKey(options.search, sort, databaseId);

        const store = loadCache();
        let rawPages = allowStale ? getCachedPages(store, cacheKey, true) : null;

        if (!rawPages) {
          rawPages = await searchPagesRaw(options.search, sort);
          if (databaseId) {
            rawPages = filterByDatabase(rawPages, databaseId);
          }

          setCachedPages(store, rawPages, cacheKey);
          saveCache(store);
        }

        const pages = rawPages.map(toNotaPage);

        if (options.json) {
          console.log(JSON.stringify(rawPages, null, 2));
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
