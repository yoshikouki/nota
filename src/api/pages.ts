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
  const client = getClient();
  const res = await withRetry(() =>
    client.pages.retrieve({ page_id: pageId })
  );
  return toNotaPage(res as PageObjectResponse);
}

export async function searchPages(query?: string): Promise<NotaPage[]> {
  const client = getClient();
  const pages: NotaPage[] = [];
  let nextCursor: string | undefined;

  do {
    const res = await withRetry(() =>
      client.search({
        query,
        filter: { value: "page", property: "object" },
        start_cursor: nextCursor,
      })
    );

    pages.push(...(res.results as PageObjectResponse[]).map(toNotaPage));
    nextCursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (nextCursor);

  return pages;
}
