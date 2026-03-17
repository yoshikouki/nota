import type { NotaPage } from "../types";
import { getClient, withRetry } from "./client";
import { toNotaPage } from "./page-mapper";
import type {
  PageObjectResponse,
  PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

// Re-export so existing imports keep working
export { toNotaPage } from "./page-mapper";

function isFullPage(
  page: PageObjectResponse | PartialPageObjectResponse
): page is PageObjectResponse {
  return "properties" in page;
}

export async function fetchPage(pageId: string): Promise<NotaPage> {
  const raw = await fetchPageRaw(pageId);
  return toNotaPage(raw);
}

export async function fetchPageRaw(pageId: string): Promise<PageObjectResponse> {
  const client = getClient();
  const res = await withRetry(() =>
    client.pages.retrieve({ page_id: pageId })
  );
  if (!isFullPage(res)) {
    throw new Error(`Received partial page response for id: ${pageId}`);
  }
  return res;
}

export type SortOrder = "edited" | "none";

function getSortParam(sort: SortOrder):
  | { timestamp: "last_edited_time"; direction: "descending" }
  | undefined {
  return sort === "edited"
    ? { timestamp: "last_edited_time", direction: "descending" }
    : undefined;
}

export async function searchPagesRaw(
  query?: string,
  sort: SortOrder = "none"
): Promise<PageObjectResponse[]> {
  const client = getClient();
  const pages: PageObjectResponse[] = [];
  let nextCursor: string | undefined;

  // Notion search API only supports last_edited_time as timestamp
  const sortParam = getSortParam(sort);

  do {
    const res = await withRetry(() =>
      client.search({
        query,
        filter: { value: "page", property: "object" },
        sort: sortParam,
        start_cursor: nextCursor,
      })
    );

    for (const result of res.results) {
      if (result.object !== "page") {
        continue;
      }
      if (isFullPage(result)) {
        pages.push(result);
      } else {
        console.error(
          `nota: skipped partial page response for id: ${result.id}`
        );
      }
    }
    nextCursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (nextCursor);

  return pages;
}

export async function searchPages(
  query?: string,
  sort: SortOrder = "none"
): Promise<NotaPage[]> {
  const raw = await searchPagesRaw(query, sort);
  return raw.map(toNotaPage);
}

/** Move a page to a different parent (page or data source). */
export async function movePage(
  pageId: string,
  newParentId: string,
  parentType: "page" | "database"
): Promise<PageObjectResponse> {
  const client = getClient();
  const parent =
    parentType === "database"
      ? ({ data_source_id: newParentId, type: "data_source_id" as const })
      : ({ page_id: newParentId, type: "page_id" as const });

  const res = await withRetry(() =>
    client.pages.move({ page_id: pageId, parent })
  );
  if (!("properties" in res)) {
    throw new Error(`Received partial page response after move: ${pageId}`);
  }
  return res as PageObjectResponse;
}

/** Retrieve a page property (supports paginated results for relations etc.). */
export async function getPageProperty(
  pageId: string,
  propertyId: string
): Promise<unknown> {
  const client = getClient();
  const results: unknown[] = [];
  let nextCursor: string | undefined;

  do {
    const res = await withRetry(() =>
      client.pages.properties.retrieve({
        page_id: pageId,
        property_id: propertyId,
        ...(nextCursor ? { start_cursor: nextCursor } : {}),
      })
    );

    // Single item (non-paginated)
    if (res.object === "property_item") {
      return res;
    }

    // Paginated list
    const list = res as { results: unknown[]; has_more: boolean; next_cursor: string | null };
    results.push(...list.results);
    nextCursor = list.has_more ? (list.next_cursor ?? undefined) : undefined;
  } while (nextCursor);

  return results;
}

/** Auto-detect whether an ID belongs to a page or a database. */
export async function detectParentType(
  id: string
): Promise<"page" | "database"> {
  const client = getClient();
  // Try page first
  try {
    const res = await client.pages.retrieve({ page_id: id });
    if (res.object === "page") return "page";
  } catch {
    // not a page
  }
  // Try data source (SDK v5: connected/synced databases use dataSources API)
  try {
    await client.dataSources.retrieve({ data_source_id: id });
    return "database";
  } catch {
    // not a data source
  }
  // Try legacy database
  try {
    const res = await client.databases.retrieve({ database_id: id });
    if (res.object === "database") return "database";
  } catch {
    // not a database
  }
  throw new Error(
    `Could not find a page or database with id: ${id}\n` +
    "Make sure the integration has access to it (share the page/database with your integration)."
  );
}

export async function createPage(
  title: string,
  parentId: string,
  parentType: "page" | "database",
  contentMarkdown?: string
): Promise<PageObjectResponse> {
  const client = getClient();

  const pageParent =
    parentType === "page" ? ({ page_id: parentId } as const) : null;

  // Build create args: use `markdown` param if content is provided (Markdown Content API),
  // otherwise use properties only.
  const createArgs = (parent: Parameters<typeof client.pages.create>[0]["parent"]) =>
    client.pages.create({
      parent,
      properties: {
        title: { title: [{ text: { content: title } }] },
      },
      ...(contentMarkdown ? { markdown: contentMarkdown } as unknown as object : {}),
    });

  let res: Awaited<ReturnType<typeof client.pages.create>>;

  if (pageParent) {
    res = await withRetry(() => createArgs(pageParent));
  } else {
    // For databases, try data_source_id first (SDK v5 connected databases),
    // fall back to legacy database_id.
    try {
      res = await withRetry(() =>
        createArgs({ data_source_id: parentId } as unknown as Parameters<typeof client.pages.create>[0]["parent"])
      );
    } catch {
      res = await withRetry(() => createArgs({ database_id: parentId } as const));
    }
  }

  if (!("properties" in res)) {
    throw new Error("Unexpected partial response from pages.create");
  }
  return res as PageObjectResponse;
}
