import type {
  BlockObjectRequest,
  BlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { getClient, withRetry } from "./client";

/**
 * Fetch all direct children of a block (non-recursive).
 * Used for delete-then-append flows.
 */
export async function fetchTopLevelBlocks(
  blockId: string
): Promise<BlockObjectResponse[]> {
  const client = getClient();
  const blocks: BlockObjectResponse[] = [];
  let nextCursor: string | undefined;

  do {
    const res = await withRetry(() =>
      client.blocks.children.list({
        block_id: blockId,
        start_cursor: nextCursor,
        page_size: 100,
      })
    );
    for (const b of res.results) {
      if ("type" in b) blocks.push(b as BlockObjectResponse);
    }
    nextCursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (nextCursor);

  return blocks;
}

/**
 * Archive (delete) a single block. Notion has no hard-delete for blocks;
 * archived blocks are equivalent to deleted.
 */
export async function archiveBlock(blockId: string): Promise<void> {
  const client = getClient();
  await withRetry(() =>
    client.blocks.update({
      block_id: blockId,
      archived: true,
    })
  );
}

/**
 * Archive all top-level blocks of a page, effectively clearing its content.
 * Child blocks are automatically archived when their parent is archived.
 */
export async function clearPageBlocks(pageId: string): Promise<void> {
  const blocks = await fetchTopLevelBlocks(pageId);
  // Notion rate-limit is 3 req/s; do sequential archiving to stay safe
  for (const block of blocks) {
    await archiveBlock(block.id);
  }
}

/**
 * Append new blocks to a page (or block container).
 * Notion allows at most 100 children per request.
 */
export async function appendBlocks(
  blockId: string,
  children: BlockObjectRequest[]
): Promise<void> {
  if (children.length === 0) return;
  const client = getClient();

  // Chunk into 100-item batches
  const BATCH = 100;
  for (let i = 0; i < children.length; i += BATCH) {
    const chunk = children.slice(i, i + BATCH);
    await withRetry(() =>
      client.blocks.children.append({
        block_id: blockId,
        children: chunk,
      })
    );
  }
}

/**
 * Update a page's title property.
 */
export async function updatePageTitle(
  pageId: string,
  title: string
): Promise<void> {
  const client = getClient();
  await withRetry(() =>
    client.pages.update({
      page_id: pageId,
      properties: {
        title: {
          title: [{ type: "text", text: { content: title } }],
        },
      },
    })
  );
}

/**
 * Archive a page (Notion's "delete").
 */
export async function archivePage(pageId: string): Promise<void> {
  const client = getClient();
  await withRetry(() =>
    client.pages.update({
      page_id: pageId,
      archived: true,
    })
  );
}
