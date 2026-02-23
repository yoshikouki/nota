import { markdownToBlocks } from "@tryfabric/martian";
import type { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints";

/**
 * Convert a Markdown string into Notion block objects ready for
 * blocks.children.append().
 *
 * Uses @tryfabric/martian for the conversion. Unsupported Markdown
 * constructs are emitted as plain paragraph blocks.
 */
export function markdownToNotionBlocks(markdown: string): BlockObjectRequest[] {
  if (!markdown.trim()) return [];
  return markdownToBlocks(markdown) as BlockObjectRequest[];
}
