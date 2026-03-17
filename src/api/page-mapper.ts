import type { NotaPage } from "../types";
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
