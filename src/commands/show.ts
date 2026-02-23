import { Command } from "commander";
import { NotionToMarkdown } from "notion-to-md";
import type { Client } from "@notionhq/client";
import type {
  BlockObjectResponse,
  ListBlockChildrenResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { getClient, withRetry } from "../api/client";
import { fetchPageRaw } from "../api/pages";
import {
  getCachedBlocks,
  getCachedPage,
  loadCache,
  saveCache,
  setCachedBlocks,
  setCachedPage,
} from "../cache/store";

type NotionListBlock = ListBlockChildrenResponse["results"][number];
type RawBlockNode = BlockObjectResponse & { children: RawBlockNode[] };

interface ShowOptions {
  cache?: boolean;
  raw?: boolean;
}

function isBlockObjectResponse(
  block: NotionListBlock
): block is BlockObjectResponse {
  return "type" in block && "has_children" in block && "parent" in block;
}

async function fetchAllBlocks(
  client: Client,
  blockId: string,
  blockChildrenMap: Map<string, BlockObjectResponse[]>
): Promise<BlockObjectResponse[]> {
  const cached = blockChildrenMap.get(blockId);
  if (cached) {
    return cached;
  }

  const blocks: BlockObjectResponse[] = [];
  let nextCursor: string | undefined;

  do {
    const response = await withRetry(() =>
      client.blocks.children.list({
        block_id: blockId,
        start_cursor: nextCursor,
        page_size: 100,
      })
    );

    for (const block of response.results) {
      if (isBlockObjectResponse(block)) {
        blocks.push(block);
      }
    }
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
  blocks: BlockObjectResponse[],
  blockChildrenMap: Map<string, BlockObjectResponse[]>
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
  blockChildrenMap: Map<string, BlockObjectResponse[]>
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

function flattenBlocks(
  blocks: BlockObjectResponse[],
  blockChildrenMap: Map<string, BlockObjectResponse[]>
): BlockObjectResponse[] {
  const flattened: BlockObjectResponse[] = [];

  const append = (nodes: BlockObjectResponse[]): void => {
    for (const node of nodes) {
      flattened.push(node);
      if (node.has_children) {
        append(blockChildrenMap.get(node.id) ?? []);
      }
    }
  };

  append(blocks);
  return flattened;
}

function hydrateBlocks(
  pageId: string,
  blocks: BlockObjectResponse[]
): {
  rootBlocks: BlockObjectResponse[];
  blockChildrenMap: Map<string, BlockObjectResponse[]>;
} {
  const rootBlocks: BlockObjectResponse[] = [];
  const blockChildrenMap = new Map<string, BlockObjectResponse[]>();

  for (const block of blocks) {
    if (block.parent.type === "block_id") {
      const siblings = blockChildrenMap.get(block.parent.block_id) ?? [];
      siblings.push(block);
      blockChildrenMap.set(block.parent.block_id, siblings);
      continue;
    }

    if (block.parent.type === "page_id" && block.parent.page_id === pageId) {
      rootBlocks.push(block);
    }
  }

  return { rootBlocks, blockChildrenMap };
}

export function registerShowCommand(program: Command): void {
  program
    .command("show <page-id>")
    .description("Show page content as Markdown")
    .option("--cache", "Use cache when available")
    .option("--raw", "Output raw blocks JSON")
    .action(async (pageId: string, options: ShowOptions) => {
      try {
        const store = loadCache();
        const cachedPage = options.cache
          ? getCachedPage(store, pageId, true)
          : null;
        let flattenedBlocks =
          options.cache ? getCachedBlocks(store, pageId, true) : null;

        if (!cachedPage || !flattenedBlocks) {
          const page = await fetchPageRaw(pageId);
          const apiClient = getClient();
          const blockChildrenMap = new Map<string, BlockObjectResponse[]>();
          const rootBlocks = await fetchAllBlocks(apiClient, pageId, blockChildrenMap);
          flattenedBlocks = flattenBlocks(rootBlocks, blockChildrenMap);

          setCachedPage(store, page);
          setCachedBlocks(store, pageId, flattenedBlocks);
          saveCache(store);
        }

        const { rootBlocks, blockChildrenMap } = hydrateBlocks(
          pageId,
          flattenedBlocks
        );

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
