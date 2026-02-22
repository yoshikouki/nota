import { Command } from "commander";
import { NotionToMarkdown } from "notion-to-md";
import type { Client } from "@notionhq/client";
import type { ListBlockChildrenResponse } from "@notionhq/client/build/src/api-endpoints";
import { getClient, withRetry } from "../api/client";
import { fetchPage } from "../api/pages";

type NotionBlock = ListBlockChildrenResponse["results"][number];
type RawBlockNode = NotionBlock & { children: RawBlockNode[] };

interface ShowOptions {
  raw?: boolean;
}

async function fetchAllBlocks(
  client: Client,
  blockId: string,
  blockChildrenMap: Map<string, NotionBlock[]>
): Promise<NotionBlock[]> {
  const cached = blockChildrenMap.get(blockId);
  if (cached) {
    return cached;
  }

  const blocks: NotionBlock[] = [];
  let nextCursor: string | undefined;

  do {
    const response = await withRetry(() =>
      client.blocks.children.list({
        block_id: blockId,
        start_cursor: nextCursor,
        page_size: 100,
      })
    );

    blocks.push(...response.results);
    nextCursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (nextCursor);

  blockChildrenMap.set(blockId, blocks);

  for (const block of blocks) {
    if ("has_children" in block && block.has_children) {
      await fetchAllBlocks(client, block.id, blockChildrenMap);
    }
  }

  return blocks;
}

function buildRawTree(
  blocks: NotionBlock[],
  blockChildrenMap: Map<string, NotionBlock[]>
): RawBlockNode[] {
  return blocks.map((block) => {
    const children =
      "has_children" in block && block.has_children
        ? buildRawTree(blockChildrenMap.get(block.id) ?? [], blockChildrenMap)
        : [];
    return { ...block, children };
  });
}

function createPrefetchedClient(
  blockChildrenMap: Map<string, NotionBlock[]>
): Client {
  return {
    blocks: {
      children: {
        list: async ({ block_id }: { block_id: string; start_cursor?: string }) =>
          ({
            object: "list",
            type: "block",
            block: {},
            next_cursor: null,
            has_more: false,
            results: blockChildrenMap.get(block_id) ?? [],
          }) as ListBlockChildrenResponse,
      },
    },
  } as unknown as Client;
}

export function registerShowCommand(program: Command): void {
  program
    .command("show <page-id>")
    .description("Show page content as Markdown")
    .option("--raw", "Output raw blocks JSON")
    .action(async (pageId: string, options: ShowOptions) => {
      try {
        await fetchPage(pageId);

        const apiClient = getClient();
        const blockChildrenMap = new Map<string, NotionBlock[]>();
        const rootBlocks = await fetchAllBlocks(apiClient, pageId, blockChildrenMap);

        if (options.raw) {
          console.log(JSON.stringify(buildRawTree(rootBlocks, blockChildrenMap), null, 2));
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
    });
}
