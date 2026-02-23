import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type {
  BlockObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

const searchPagesRawMock = mock(async () => [] as PageObjectResponse[]);

mock.module("../src/api/pages", () => ({
  searchPagesRaw: searchPagesRawMock,
}));

const { revalidateSearchInBackground } = await import("../src/cache/background");
mock.restore();

const {
  getCachedPage,
  getCachedSearch,
  getCachedBlocks,
  setCachedPage,
  setCachedBlocks,
} = await import("../src/cache/store");

const ORIGINAL_XDG_CACHE_HOME = process.env.XDG_CACHE_HOME;
let testCacheHome = "";

function makePage(id: string, lastEditedTime: string): PageObjectResponse {
  return {
    object: "page",
    id,
    created_time: "2026-02-22T00:00:00.000Z",
    last_edited_time: lastEditedTime,
    archived: false,
    in_trash: false,
    url: `https://www.notion.so/${id}`,
    parent: { type: "workspace", workspace: true },
    properties: {},
  } as unknown as PageObjectResponse;
}

function makeBlock(pageId: string): BlockObjectResponse {
  return {
    object: "block",
    id: `block-${pageId}`,
    type: "paragraph",
    has_children: false,
    archived: false,
    in_trash: false,
    parent: { type: "page_id", page_id: pageId },
  } as unknown as BlockObjectResponse;
}

beforeEach(() => {
  testCacheHome = mkdtempSync(join(tmpdir(), "nota-bg-test-"));
  process.env.XDG_CACHE_HOME = testCacheHome;
  searchPagesRawMock.mockReset();
});

afterEach(() => {
  if (ORIGINAL_XDG_CACHE_HOME === undefined) {
    delete process.env.XDG_CACHE_HOME;
  } else {
    process.env.XDG_CACHE_HOME = ORIGINAL_XDG_CACHE_HOME;
  }
  rmSync(testCacheHome, { recursive: true, force: true });
});

describe("revalidateSearchInBackground", () => {
  test("last_edited_time が変化したページだけ invalidate される", async () => {
    setCachedPage(makePage("page-1", "2026-02-23T00:00:00.000Z"));
    setCachedPage(makePage("page-2", "2026-02-22T23:00:00.000Z"));
    setCachedBlocks("page-1", [makeBlock("page-1")]);
    setCachedBlocks("page-2", [makeBlock("page-2")]);
    setCachedBlocks("page-3", [makeBlock("page-3")]);

    const latestPages = [
      makePage("page-1", "2026-02-23T00:00:00.000Z"),
      makePage("page-2", "2026-02-23T01:00:00.000Z"),
      makePage("page-3", "2026-02-23T02:00:00.000Z"),
    ];
    searchPagesRawMock.mockResolvedValue(latestPages);

    revalidateSearchInBackground("query", "edited");
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(getCachedBlocks("page-1", true)).not.toBeNull();
    expect(getCachedBlocks("page-2", true)).toBeNull();
    expect(getCachedBlocks("page-3", true)).toBeNull();

    expect(getCachedPage("page-1", true)?.last_edited_time).toBe(
      "2026-02-23T00:00:00.000Z"
    );
    expect(getCachedPage("page-2", true)?.last_edited_time).toBe(
      "2026-02-23T01:00:00.000Z"
    );
    expect(getCachedPage("page-3", true)?.last_edited_time).toBe(
      "2026-02-23T02:00:00.000Z"
    );

    expect(getCachedSearch("query", "edited", true)).toEqual(latestPages);
  });
});
