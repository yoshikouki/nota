/**
 * Shared constants for Notion API interactions.
 */

/** Maximum number of items per page in Notion list/query endpoints. */
export const NOTION_MAX_PAGE_SIZE = 100;

/** Maximum number of block children per append request. */
export const NOTION_BATCH_SIZE = 100;

/** Default retry count for rate-limited (429) API calls. */
export const NOTION_MAX_RETRIES = 3;

/** Character limit for block text previews in CLI output. */
export const PREVIEW_LENGTH = 60;
