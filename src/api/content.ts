/**
 * High-level helpers that combine block fetching + Markdown rendering.
 * Used by both `nota show` and `nota edit`.
 */
import type { Client } from "@notionhq/client";
import type {
  BlockObjectResponse,
  ListBlockChildrenResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { NotionToMarkdown } from "notion-to-md";
import { getClient, withRetry } from "./client";

type NotionListBlock = ListBlockChildrenResponse["results"][number];

function isBlockObjectResponse(
  block: NotionListBlock
): block is BlockObjectResponse {
  return "type" in block && "has_children" in block && "parent" in block;
}

/** Recursively fetch all blocks under a block/page, populating a shared map. */
export async function fetchAllBlocks(
  client: Client,
  blockId: string,
  blockChildrenMap: Map<string, BlockObjectResponse[]>
): Promise<BlockObjectResponse[]> {
  const cached = blockChildrenMap.get(blockId);
  if (cached) return cached;

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
      if (isBlockObjectResponse(block)) blocks.push(block);
    }
    nextCursor = response.has_more
      ? (response.next_cursor ?? undefined)
      : undefined;
  } while (nextCursor);

  blockChildrenMap.set(blockId, blocks);

  for (const block of blocks) {
    if (block.has_children) {
      await fetchAllBlocks(client, block.id, blockChildrenMap);
    }
  }

  return blocks;
}

/** Flatten a tree of blocks (DFS) into a single ordered array. */
export function flattenBlocks(
  blocks: BlockObjectResponse[],
  blockChildrenMap: Map<string, BlockObjectResponse[]>
): BlockObjectResponse[] {
  const flattened: BlockObjectResponse[] = [];
  const append = (nodes: BlockObjectResponse[]): void => {
    for (const node of nodes) {
      flattened.push(node);
      if (node.has_children) append(blockChildrenMap.get(node.id) ?? []);
    }
  };
  append(blocks);
  return flattened;
}

/**
 * Reconstruct tree structures (rootBlocks + blockChildrenMap) from a flat
 * array of blocks (as stored in cache).
 */
export function hydrateBlocks(
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
    if (
      block.parent.type === "page_id" &&
      block.parent.page_id === pageId
    ) {
      rootBlocks.push(block);
    }
  }

  return { rootBlocks, blockChildrenMap };
}

/**
 * Create a notion-to-md client that reads from a pre-fetched in-memory map
 * instead of making real API calls.
 */
export function createPrefetchedClient(
  blockChildrenMap: Map<string, BlockObjectResponse[]>
): Client {
  return {
    blocks: {
      children: {
        list: async ({
          block_id,
        }: {
          block_id: string;
          start_cursor?: string;
        }) =>
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

/**
 * Fetch all blocks for a page and return them as a Markdown string.
 * Re-fetches from API; does NOT use cache (let the caller handle caching).
 */
export async function fetchPageMarkdown(pageId: string): Promise<{
  markdown: string;
  flatBlocks: BlockObjectResponse[];
}> {
  const client = getClient();
  const blockChildrenMap = new Map<string, BlockObjectResponse[]>();
  const rootBlocks = await fetchAllBlocks(client, pageId, blockChildrenMap);
  const flatBlocks = flattenBlocks(rootBlocks, blockChildrenMap);

  const n2m = new NotionToMarkdown({
    notionClient: createPrefetchedClient(blockChildrenMap),
  });
  const mdBlocks = await n2m.blocksToMarkdown(rootBlocks);
  const markdown = n2m.toMarkdownString(mdBlocks).parent ?? "";

  return { markdown: markdown.trimEnd(), flatBlocks };
}
