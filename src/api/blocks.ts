import type {
  BlockObjectRequest,
  BlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { NOTION_MAX_PAGE_SIZE, NOTION_BATCH_SIZE } from "../constants";
import { getClient, withRetry } from "./client";

/** Retrieve a single block by ID. */
export async function retrieveBlock(blockId: string): Promise<BlockObjectResponse> {
  const client = getClient();
  const res = await withRetry(() =>
    client.blocks.retrieve({ block_id: blockId })
  );
  if (!("type" in res)) {
    throw new Error(`Received partial block response for id: ${blockId}`);
  }
  return res as BlockObjectResponse;
}

/**
 * Hard-delete a block via blocks.delete.
 * Unlike archiveBlock (which uses update+archived), this calls the DELETE endpoint.
 */
export async function deleteBlock(blockId: string): Promise<void> {
  const client = getClient();
  await withRetry(() => client.blocks.delete({ block_id: blockId }));
}

/**
 * Update the text content of a rich_text-capable block.
 * Preserves block type; replaces rich_text with a single plain-text span.
 * Supported types: paragraph, heading_1/2/3, bulleted_list_item,
 * numbered_list_item, quote, callout, toggle, to_do, code.
 */
export async function updateBlockText(
  blockId: string,
  text: string
): Promise<BlockObjectResponse> {
  const client = getClient();
  const current = await retrieveBlock(blockId);
  const richText = [{ type: "text" as const, text: { content: text } }];

  const textBlockTypes = [
    "paragraph", "heading_1", "heading_2", "heading_3",
    "bulleted_list_item", "numbered_list_item", "quote",
    "callout", "toggle", "to_do", "code",
  ] as const;
  type TextBlockType = typeof textBlockTypes[number];

  const blockType = current.type as string;
  if (!textBlockTypes.includes(blockType as TextBlockType)) {
    throw new Error(
      `Block type "${blockType}" does not support text update. ` +
      `Supported: ${textBlockTypes.join(", ")}`
    );
  }

  const res = await withRetry(() =>
    client.blocks.update({
      block_id: blockId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [blockType]: { rich_text: richText },
    } as any)
  );
  if (!("type" in res)) {
    throw new Error(`Received partial block response after update: ${blockId}`);
  }
  return res as BlockObjectResponse;
}

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
        page_size: NOTION_MAX_PAGE_SIZE,
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

  // Chunk into batches (max children per Notion append request)
  for (let i = 0; i < children.length; i += NOTION_BATCH_SIZE) {
    const chunk = children.slice(i, i + NOTION_BATCH_SIZE);
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
