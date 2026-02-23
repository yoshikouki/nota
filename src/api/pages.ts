import type { NotaPage } from "../types";
import { getClient, withRetry } from "./client";
import type {
  PageObjectResponse,
  PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

function isFullPage(
  page: PageObjectResponse | PartialPageObjectResponse
): page is PageObjectResponse {
  return "properties" in page;
}

export function toNotaPage(page: PageObjectResponse): NotaPage {
  const titleProp = Object.values(page.properties).find(
    (p) => p.type === "title"
  ) as { type: "title"; title: Array<{ plain_text: string }> } | undefined;
  const title =
    titleProp?.title.map((t) => t.plain_text).join("") || "(Untitled)";

  let parentId: string | null = null;
  let parentType: NotaPage["parentType"] = "workspace";
  if (page.parent.type === "page_id") {
    parentId = page.parent.page_id;
    parentType = "page";
  } else if (page.parent.type === "database_id") {
    parentId = page.parent.database_id;
    parentType = "database";
  } else if (
    // "data_source_id" is a newer Notion API type for connected/synced databases.
    // The parent object contains both data_source_id and database_id.
    page.parent.type === ("data_source_id" as string)
  ) {
    const p = page.parent as unknown as { database_id?: string; data_source_id: string };
    parentId = p.database_id ?? p.data_source_id;
    parentType = "database";
  }

  return {
    id: page.id,
    title,
    url: page.url,
    parentId,
    parentType,
    createdAt: new Date(page.created_time),
    lastEditedAt: new Date(page.last_edited_time),
  };
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
