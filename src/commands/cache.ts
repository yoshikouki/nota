import { Command } from "commander";
import { createInterface } from "readline/promises";
import { existsSync, statSync } from "fs";
import { getCachePath } from "../utils/xdg";
import {
  clearCache,
  invalidatePage,
  loadCache,
  saveCache,
} from "../cache/store";

interface ClearOptions {
  force?: boolean;
  page?: string;
}

async function confirmClearAll(): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question("Clear all cache? [y/N] ");
    const normalized = answer.trim().toLowerCase();
    return normalized === "y" || normalized === "yes";
  } finally {
    rl.close();
  }
}

export function registerCacheCommand(program: Command): void {
  const cacheCommand = program.command("cache").description("Manage cache");

  cacheCommand
    .command("status")
    .description("Show cache status")
    .action(() => {
      try {
        const cachePath = getCachePath();
        const store = loadCache();
        const fileSize = existsSync(cachePath) ? statSync(cachePath).size : 0;

        console.log(`Cache path: ${cachePath}`);
        console.log(`Page count: ${Object.keys(store.pages).length}`);
        console.log(`Block count: ${Object.keys(store.blocks).length}`);
        console.log(`Search count: ${Object.keys(store.searches).length}`);
        console.log(`File size: ${fileSize} bytes`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });

  cacheCommand
    .command("clear")
    .description("Clear cache entries")
    .option("--page <id>", "Clear cache for a page and its blocks")
    .option("--force", "Skip confirmation prompt")
    .action(async (options: ClearOptions) => {
      try {
        if (options.page) {
          const store = loadCache();
          invalidatePage(store, options.page);
          saveCache(store);
          return;
        }

        if (!options.force) {
          const confirmed = await confirmClearAll();
          if (!confirmed) {
            return;
          }
        }

        clearCache();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });
}
