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
  const cacheCommand = program.command("cache").description("Manage cache");

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
    });

  cacheCommand
    .command("clear")
    .description("Clear cache entries")
    .option("--all", "Clear all cache files")
    .option("--page <id>", "Clear cache for a page and its blocks")
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

        clearAllCache();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });
}
