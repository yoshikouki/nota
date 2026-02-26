import { Command } from "commander";
import { NotionToMarkdown } from "notion-to-md";
import { getClient } from "../api/client";
import { fetchPageRaw } from "../api/pages";
import {
  fetchAllBlocks,
  flattenBlocks,
  hydrateBlocks,
  createPrefetchedClient,
} from "../api/content";
import {
  getCachedBlocks,
  getCachedPage,
  setCachedBlocks,
  setCachedPage,
} from "../cache/store";
import { loadConfig } from "../utils/config-file";
import { parseNotionUrl } from "../utils/parseNotionUrl";

interface ShowOptions {
  cache?: boolean;
  raw?: boolean;
}

export function registerShowCommand(program: Command): void {
  program
    .command("show <page-id>")
    .description("Show page content as Markdown")
    .option("--cache", "Use cache when available")
    .option("--raw", "Output raw blocks JSON")
    .action(async (pageId: string, options: ShowOptions, command: Command) => {
      try {
        pageId = parseNotionUrl(pageId);
        const config = loadConfig();
        const cacheSource = command.getOptionValueSource("cache");
        const allowStale =
          options.cache === true ||
          (cacheSource !== "cli" && config.cache?.enabled === true);

        let flattenedBlocks = getCachedBlocks(pageId, allowStale);

        if (!flattenedBlocks) {
          const apiClient = getClient();
          const blockChildrenMap = new Map();
          const rootBlocks = await fetchAllBlocks(apiClient, pageId, blockChildrenMap);
          flattenedBlocks = flattenBlocks(rootBlocks, blockChildrenMap);

          const page = await fetchPageRaw(pageId);
          setCachedPage(page);
          setCachedBlocks(pageId, flattenedBlocks);
        } else if (!getCachedPage(pageId, allowStale)) {
          const page = await fetchPageRaw(pageId);
          setCachedPage(page);
        }

        const { rootBlocks, blockChildrenMap } = hydrateBlocks(
          pageId,
          flattenedBlocks
        );

        if (options.raw) {
          console.log(JSON.stringify({ rootBlocks, children: Object.fromEntries(blockChildrenMap) }, null, 2));
          return;
        }

        const n2m = new NotionToMarkdown({
          notionClient: createPrefetchedClient(blockChildrenMap),
        });
        const mdBlocks = await n2m.blocksToMarkdown(rootBlocks);
        const markdown = n2m.toMarkdownString(mdBlocks).parent ?? "";

        if (markdown.length > 0) {
          console.log(markdown.trimEnd());
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
Environment:
  NOTION_TOKEN=secret_xxxx  Required. See \`nota --help\` Setup section for details.

Getting page-id:
  Run \`nota list\` to see page IDs (3rd column), or:
    nota list --json | jq '.[] | {id, title}'

Examples:
  nota show <page-id>                   # render as Markdown
  nota show <page-id> --cache           # serve from local cache (offline)
  nota show <page-id> --raw             # raw blocks JSON (for debugging)
  nota show <page-id> | grep "TODO"     # pipe to other tools
  nota show <page-id> | nota edit <id>  # copy content between pages`
    );
}
