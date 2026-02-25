import { Command } from "commander";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { clearAllCache, invalidatePage } from "../cache/store";
import { getBlocksDir, getCacheDir, getPagesDir, getSearchesDir } from "../utils/xdg";

interface ClearOptions {
  all?: boolean;
  page?: string;
}

function countFilesAndSize(dir: string): { count: number; size: number } {
  let count = 0;
  let size = 0;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    count += 1;
    size += statSync(join(dir, entry.name)).size;
  }

  return { count, size };
}

export function registerCacheCommand(program: Command): void {
  const cacheCommand = program
    .command("cache")
    .description("Manage cache")
    .addHelpText(
      "after",
      `
Examples:
  nota cache status                  # show cache location and file counts
  nota cache clear                   # clear ALL cache (pages, blocks, searches)
  nota cache clear --page <page-id>  # clear cache for a specific page only`
    );

  cacheCommand
    .command("status")
    .description("Show cache status")
    .action(() => {
      try {
        const pagesDir = getPagesDir();
        const blocksDir = getBlocksDir();
        const searchesDir = getSearchesDir();

        const pages = countFilesAndSize(pagesDir);
        const blocks = countFilesAndSize(blocksDir);
        const searches = countFilesAndSize(searchesDir);
        const totalSize = pages.size + blocks.size + searches.size;

        console.log(`Cache dir: ${getCacheDir()}`);
        console.log(`Pages: ${pages.count}`);
        console.log(`Blocks: ${blocks.count}`);
        console.log(`Searches: ${searches.count}`);
        console.log(`Total size: ${totalSize} bytes`);
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
  nota cache status   # print cache directory path and file counts per type`
    );

  cacheCommand
    .command("clear")
    .description("Clear cache entries (defaults to clearing ALL cache if no option given)")
    .option("--all", "Clear all cache files (pages, blocks, searches)")
    .option("--page <id>", "Clear cache for a specific page and its blocks only")
    .action((options: ClearOptions) => {
      try {
        if (options.all && options.page) {
          console.error("Error: --all and --page cannot be used together");
          process.exit(1);
        }

        if (options.page) {
          invalidatePage(options.page);
          return;
        }

        // Default: clear all cache (same as --all)
        clearAllCache();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    })
    .addHelpText(
      "after",
      `
Default behavior:
  Running \`nota cache clear\` with no options clears ALL cache (pages, blocks, searches).
  Use --page to limit clearing to a single page.

Getting page-id for --page:
  nota list --json | jq '.[] | {id, title}'

Examples:
  nota cache clear                      # clear ALL cache (pages + blocks + searches)
  nota cache clear --all                # same as above (explicit)
  nota cache clear --page <page-id>     # invalidate cache for one page only`
    );
}
