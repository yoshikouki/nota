import { Command } from "commander";
import {
  searchPagesRaw,
  toNotaPage,
  type SortOrder,
} from "../api/pages";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { revalidateSearchInBackground } from "../cache/background";
import {
  getCachedSearch,
  setCachedPage,
  setCachedSearch,
} from "../cache/store";
import { loadConfig } from "../utils/config-file";

interface ListOptions {
  search?: string;
  sort?: string;
  database?: string;
  cache?: boolean;
  json?: boolean;
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

        const allowStale =
          options.cache === true || config.cache?.enabled === true;

        const cachedPages = getCachedSearch(options.search, sort, allowStale);
        const wasStale =
          allowStale &&
          cachedPages !== null &&
          getCachedSearch(options.search, sort, false) === null;

        let rawPages = cachedPages;
        if (!rawPages) {
          rawPages = await searchPagesRaw(options.search, sort);
          setCachedSearch(options.search, sort, rawPages);
          for (const page of rawPages) {
            setCachedPage(page);
          }
        } else if (wasStale) {
          revalidateSearchInBackground(options.search, sort);
        }

        const outputPages = databaseId
          ? filterByDatabase(rawPages, databaseId)
          : rawPages;
        const pages = outputPages.map(toNotaPage);

        if (options.json) {
          console.log(JSON.stringify(outputPages, null, 2));
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
    })
    .addHelpText(
      "after",
      `
Examples:
  nota list                             # list all pages (sorted by last edited)
  nota list --search "meeting"          # search by keyword
  nota list --database <id>             # pages in a specific database
  nota list --sort none                 # no sort (faster)
  nota list --json | jq '.[].id'        # extract page IDs for scripting
  nota list --cache                     # serve from local cache (offline-capable)`
    );
}
