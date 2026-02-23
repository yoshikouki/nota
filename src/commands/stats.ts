import { Command } from "commander";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { getClient, withRetry } from "../api/client";
import { toNotaPage } from "../api/pages";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { getBlocksDir, getCacheDir, getPagesDir, getSearchesDir } from "../utils/xdg";
import { readFileSync } from "fs";
import { loadConfig } from "../utils/config";

interface DirStats {
  count: number;
  bytes: number;
}

function statDir(dir: string): DirStats {
  let count = 0;
  let bytes = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      count++;
      bytes += statSync(join(dir, entry.name)).size;
    }
  } catch {
    // directory may not exist yet
  }
  return { count, bytes };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNum(n: number): string {
  return n.toLocaleString("en-US");
}

function pad(label: string, width = 20): string {
  return label.padEnd(width);
}

/** Read all cached pages and parse them */
function loadCachedPages(): PageObjectResponse[] {
  const dir = getPagesDir();
  const pages: PageObjectResponse[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(readFileSync(join(dir, entry.name), "utf-8"));
        if (raw?.raw?.object === "page") pages.push(raw.raw as PageObjectResponse);
      } catch {
        // skip corrupt entries
      }
    }
  } catch {
    // dir missing
  }
  return pages;
}

export function registerStatsCommand(program: Command): void {
  program
    .command("stats")
    .description("Show Notion API status, cache stats, and page analytics")
    .option("--no-api", "Skip Notion API connectivity check")
    .action(async (options: { api: boolean }) => {
      // ── 1. API status ────────────────────────────────────────────────
      console.log("Notion API");
      try {
        const { notionToken } = loadConfig();
        const tokenHint = `${notionToken.slice(0, 10)}…${notionToken.slice(-4)}`;
        process.stdout.write(`  ${pad("Token:")}${tokenHint}\n`);

        if (options.api !== false) {
          process.stderr.write("  Checking connectivity…\r");
          const client = getClient();
          const start = Date.now();
          await withRetry(() =>
            client.search({ filter: { value: "page", property: "object" }, page_size: 1 })
          );
          const ms = Date.now() - start;
          process.stdout.write(`  ${pad("Status:")}✓ connected (${ms}ms)     \n`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ${pad("Status:")}✗ error — ${msg}`);
      }

      // ── 2. Cache stats ───────────────────────────────────────────────
      console.log("\nCache");
      console.log(`  ${pad("Dir:")}${getCacheDir()}`);

      const pages = statDir(getPagesDir());
      const blocks = statDir(getBlocksDir());
      const searches = statDir(getSearchesDir());
      const total = {
        count: pages.count + blocks.count + searches.count,
        bytes: pages.bytes + blocks.bytes + searches.bytes,
      };

      console.log(`  ${pad("Pages:")}${formatNum(pages.count)} files  (${formatBytes(pages.bytes)})`);
      console.log(`  ${pad("Blocks:")}${formatNum(blocks.count)} files  (${formatBytes(blocks.bytes)})`);
      console.log(`  ${pad("Searches:")}${formatNum(searches.count)} files  (${formatBytes(searches.bytes)})`);
      console.log(`  ${pad("Total:")}${formatNum(total.count)} files  (${formatBytes(total.bytes)})`);

      // ── 3. Page analytics ────────────────────────────────────────────
      console.log("\nPage analytics  (from cache)");
      const cachedPages = loadCachedPages();
      if (cachedPages.length === 0) {
        console.log("  (no pages cached yet — run `nota list` to populate)");
        return;
      }

      const notaPages = cachedPages.map(toNotaPage);

      // Date range — display in local timezone
      // sv-SE locale → YYYY-MM-DD format in system local timezone
      const toLocalDate = (d: Date) => d.toLocaleDateString("sv-SE");
      const dates = notaPages.map((p) => p.lastEditedAt).sort((a, b) => a.getTime() - b.getTime());
      const oldest = dates[0] ? toLocalDate(dates[0]) : "—";
      const newest = dates[dates.length - 1] ? toLocalDate(dates[dates.length - 1]!) : "—";

      // Parent type breakdown
      const byParentType = { page: 0, database: 0, workspace: 0 };
      for (const p of notaPages) byParentType[p.parentType]++;

      // Pages with children
      const childCounts = new Map<string, number>();
      for (const p of notaPages) {
        if (p.parentType === "page" && p.parentId) {
          childCounts.set(p.parentId, (childCounts.get(p.parentId) ?? 0) + 1);
        }
      }
      const pagesWithChildren = childCounts.size;
      const maxChildren = Math.max(0, ...[...childCounts.values()]);

      // Most-edited pages (top 5 by lastEditedAt desc)
      const topEdited = [...notaPages]
        .sort((a, b) => b.lastEditedAt.getTime() - a.lastEditedAt.getTime())
        .slice(0, 5);

      console.log(`  ${pad("Total pages:")}${formatNum(notaPages.length)}`);
      console.log(`  ${pad("Date range:")}${oldest}  →  ${newest}`);
      console.log(`  ${pad("Parent: page:")}${formatNum(byParentType.page)}`);
      console.log(`  ${pad("Parent: database:")}${formatNum(byParentType.database)}`);
      console.log(`  ${pad("Parent: workspace:")}${formatNum(byParentType.workspace)}`);
      console.log(`  ${pad("Pages w/ children:")}${formatNum(pagesWithChildren)}  (max ${maxChildren} children)`);

      console.log("\n  Recently edited:");
      for (const p of topEdited) {
        const date = toLocalDate(p.lastEditedAt);
        const title = p.title.length > 40 ? `${p.title.slice(0, 37)}…` : p.title;
        console.log(`    ${date}  ${title}`);
      }
    });
}
