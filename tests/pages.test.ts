import { describe, expect, test } from "bun:test";
import { toNotaPage } from "../src/api/pages";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

// Minimal PageObjectResponse factory — only fields toNotaPage() reads
function makePage(overrides: {
  id?: string;
  url?: string;
  parent?: PageObjectResponse["parent"];
  properties?: PageObjectResponse["properties"];
  created_time?: string;
  last_edited_time?: string;
}): PageObjectResponse {
  return {
    object: "page",
    id: overrides.id ?? "page-id-123",
    url: overrides.url ?? "https://notion.so/page-id-123",
    parent: overrides.parent ?? { type: "workspace", workspace: true },
    properties: overrides.properties ?? {
      title: {
        id: "title",
        type: "title",
        title: [{ plain_text: "Test Page", annotations: {} as never, href: null, type: "text", text: { content: "Test Page", link: null } }],
      },
    },
    created_time: overrides.created_time ?? "2024-01-01T00:00:00.000Z",
    last_edited_time: overrides.last_edited_time ?? "2024-06-01T00:00:00.000Z",
    // Required by type but irrelevant to toNotaPage
    created_by: { object: "user", id: "user-1" },
    last_edited_by: { object: "user", id: "user-1" },
    cover: null,
    icon: null,
    archived: false,
    in_trash: false,
    public_url: null,
    request_id: "req-1",
  } as unknown as PageObjectResponse;
}

function makeTitleProp(texts: string[]): PageObjectResponse["properties"] {
  return {
    title: {
      id: "title",
      type: "title",
      title: texts.map((t) => ({
        plain_text: t,
        annotations: {} as never,
        href: null,
        type: "text" as const,
        text: { content: t, link: null },
      })),
    },
  };
}

// ---- parent type tests ----

describe("toNotaPage — parent type", () => {
  test("page_id parent", () => {
    const page = makePage({
      parent: { type: "page_id", page_id: "parent-page-abc" },
    });
    const result = toNotaPage(page);
    expect(result.parentType).toBe("page");
    expect(result.parentId).toBe("parent-page-abc");
  });

  test("database_id parent", () => {
    const page = makePage({
      parent: { type: "database_id", database_id: "db-id-xyz" },
    });
    const result = toNotaPage(page);
    expect(result.parentType).toBe("database");
    expect(result.parentId).toBe("db-id-xyz");
  });

  test("data_source_id parent — prefers database_id when present", () => {
    // This is the edge case that previously caused a bug.
    // data_source_id is not in the SDK types but exists in the Notion API.
    const page = makePage({
      parent: {
        type: "data_source_id" as never,
        database_id: "db-from-datasource",
        data_source_id: "datasource-id",
      } as never,
    });
    const result = toNotaPage(page);
    expect(result.parentType).toBe("database");
    expect(result.parentId).toBe("db-from-datasource");
  });

  test("data_source_id parent — falls back to data_source_id when no database_id", () => {
    const page = makePage({
      parent: {
        type: "data_source_id" as never,
        data_source_id: "datasource-only-id",
      } as never,
    });
    const result = toNotaPage(page);
    expect(result.parentType).toBe("database");
    expect(result.parentId).toBe("datasource-only-id");
  });

  test("workspace parent returns null parentId", () => {
    const page = makePage({
      parent: { type: "workspace", workspace: true },
    });
    const result = toNotaPage(page);
    expect(result.parentType).toBe("workspace");
    expect(result.parentId).toBeNull();
  });
});

// ---- title extraction tests ----

describe("toNotaPage — title", () => {
  test("single rich_text segment", () => {
    const page = makePage({ properties: makeTitleProp(["Hello World"]) });
    expect(toNotaPage(page).title).toBe("Hello World");
  });

  test("multiple rich_text segments are joined", () => {
    const page = makePage({ properties: makeTitleProp(["Hello", " ", "World"]) });
    expect(toNotaPage(page).title).toBe("Hello World");
  });

  test("empty title array returns (Untitled)", () => {
    const page = makePage({ properties: makeTitleProp([]) });
    expect(toNotaPage(page).title).toBe("(Untitled)");
  });

  test("no title property returns (Untitled)", () => {
    const page = makePage({ properties: {} });
    expect(toNotaPage(page).title).toBe("(Untitled)");
  });
});

// ---- date conversion tests ----

describe("toNotaPage — dates", () => {
  test("createdAt and lastEditedAt are Date objects", () => {
    const page = makePage({
      created_time: "2024-03-29T10:00:00.000Z",
      last_edited_time: "2026-02-24T10:55:00.000Z",
    });
    const result = toNotaPage(page);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.lastEditedAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe("2024-03-29T10:00:00.000Z");
    expect(result.lastEditedAt.toISOString()).toBe("2026-02-24T10:55:00.000Z");
  });
});

// ---- id and url passthrough ----

describe("toNotaPage — id / url", () => {
  test("id and url are passed through", () => {
    const page = makePage({
      id: "my-page-id",
      url: "https://notion.so/my-page-id",
    });
    const result = toNotaPage(page);
    expect(result.id).toBe("my-page-id");
    expect(result.url).toBe("https://notion.so/my-page-id");
  });
});
