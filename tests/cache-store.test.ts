import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type {
  BlockObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import {
  clearAllCache,
  getCachedBlocks,
  getCachedPage,
  getCachedSearch,
  invalidatePage,
  setCachedBlocks,
  setCachedPage,
  setCachedSearch,
} from "../src/cache/store";
import { getBlocksDir, getPagesDir, getSearchesDir } from "../src/utils/xdg";

const ORIGINAL_XDG_CACHE_HOME = process.env.XDG_CACHE_HOME;
let testCacheHome = "";

function staleFile(filePath: string): void {
  const entry = JSON.parse(readFileSync(filePath, "utf-8")) as {
    cached_at: string;
  };
  entry.cached_at = new Date(0).toISOString();
  writeFileSync(filePath, JSON.stringify(entry), "utf-8");
}

function makePage(
  id: string,
  lastEditedTime: string = "2026-02-23T00:00:00.000Z"
): PageObjectResponse {
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

beforeEach(() => {
  testCacheHome = mkdtempSync(join(tmpdir(), "nota-test-"));
  process.env.XDG_CACHE_HOME = testCacheHome;
});

afterEach(() => {
  if (ORIGINAL_XDG_CACHE_HOME === undefined) {
    delete process.env.XDG_CACHE_HOME;
  } else {
    process.env.XDG_CACHE_HOME = ORIGINAL_XDG_CACHE_HOME;
  }
  rmSync(testCacheHome, { recursive: true, force: true });
});

describe("stale cache handling", () => {
  test("allowStale=true なら stale な search キャッシュを返す", () => {
    const pages = [makePage("page-1")];
    setCachedSearch("query", "edited", pages, 1);

    const searchFile = readdirSync(getSearchesDir())[0];
    if (!searchFile) {
      throw new Error("search cache file not found");
    }
    staleFile(join(getSearchesDir(), searchFile));

    expect(getCachedSearch("query", "edited")).toBeNull();
    expect(getCachedSearch("query", "edited", true)).toEqual(pages);
  });

  test("allowStale=true なら stale な page キャッシュを返す", () => {
    const page = makePage("page-1");
    setCachedPage(page, 1);

    staleFile(join(getPagesDir(), "page-1.json"));

    expect(getCachedPage("page-1")).toBeNull();
    expect(getCachedPage("page-1", true)).toEqual(page);
  });

  test("allowStale=true なら stale な block キャッシュを返す", () => {
    const blocks = [{
      object: "block",
      id: "block-1",
      type: "paragraph",
      has_children: false,
      archived: false,
      in_trash: false,
      parent: { type: "page_id", page_id: "page-1" },
    }] as unknown as BlockObjectResponse[];

    setCachedBlocks("page-1", blocks, 1);
    staleFile(join(getBlocksDir(), "page-1.json"));

    expect(getCachedBlocks("page-1")).toBeNull();
    expect(getCachedBlocks("page-1", true)).toEqual(blocks);
  });
});

describe("cache file handling", () => {
  test("壊れた JSON を読んだ場合は null を返す", () => {
    const filePath = join(getPagesDir(), "page-1.json");
    writeFileSync(filePath, "{broken-json", "utf-8");

    expect(getCachedPage("page-1")).toBeNull();
  });

  test("invalidatePage は pages と blocks のファイルを削除する", () => {
    setCachedPage(makePage("page-1"));
    setCachedBlocks("page-1", []);

    const pagePath = join(getPagesDir(), "page-1.json");
    const blockPath = join(getBlocksDir(), "page-1.json");

    expect(existsSync(pagePath)).toBe(true);
    expect(existsSync(blockPath)).toBe(true);

    invalidatePage("page-1");

    expect(existsSync(pagePath)).toBe(false);
    expect(existsSync(blockPath)).toBe(false);
  });

  test("clearAllCache は全ディレクトリを作り直す", () => {
    setCachedPage(makePage("page-1"));
    setCachedBlocks("page-1", []);
    setCachedSearch(undefined, "none", [makePage("page-1")]);

    clearAllCache();

    expect(existsSync(getPagesDir())).toBe(true);
    expect(existsSync(getBlocksDir())).toBe(true);
    expect(existsSync(getSearchesDir())).toBe(true);
    expect(readdirSync(getPagesDir())).toHaveLength(0);
    expect(readdirSync(getBlocksDir())).toHaveLength(0);
    expect(readdirSync(getSearchesDir())).toHaveLength(0);
  });
});
