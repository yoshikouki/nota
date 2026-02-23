import type { NotaPage } from "../types";
import { getClient, withRetry } from "./client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

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
  return res as PageObjectResponse;
}

export type SortOrder = "edited" | "created" | "none";

export async function searchPagesRaw(
  query?: string,
  sort: SortOrder = "none"
): Promise<PageObjectResponse[]> {
  const client = getClient();
  const pages: PageObjectResponse[] = [];
  let nextCursor: string | undefined;

  // Notion search API only supports last_edited_time as timestamp
  const sortParam =
    sort === "edited"
      ? { timestamp: "last_edited_time" as const, direction: "descending" as const }
      : sort === "created"
        ? { timestamp: "last_edited_time" as const, direction: "ascending" as const }
        : undefined;

  do {
    const res = await withRetry(() =>
      client.search({
        query,
        filter: { value: "page", property: "object" },
        sort: sortParam,
        start_cursor: nextCursor,
      })
    );

    pages.push(...(res.results as PageObjectResponse[]));
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
