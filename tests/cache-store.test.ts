import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type {
  BlockObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { emptyStore, makeEntry } from "../src/cache/schema";
import {
  getCachedBlocks,
  getCachedPage,
  getCachedPages,
  invalidatePage,
  loadCache,
} from "../src/cache/store";
import { getCachePath } from "../src/utils/xdg";

const ORIGINAL_XDG_CACHE_HOME = process.env.XDG_CACHE_HOME;
let testCacheHome = "";

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

describe("loadCache", () => {
  test("JSON が壊れている場合は .bak に退避して空ストアを返す", () => {
    const cachePath = getCachePath();
    writeFileSync(cachePath, "{broken-json", "utf-8");

    const messages: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      messages.push(args.join(" "));
    };

    try {
      const store = loadCache();
      expect(store).toEqual(emptyStore());
      expect(existsSync(`${cachePath}.bak`)).toBe(true);
      expect(messages).toContain(
        "nota: cache corrupted, resetting (backed up to cache.json.bak)"
      );
    } finally {
      console.error = originalError;
    }
  });
});

describe("stale cache handling", () => {
  test("allowStale=true なら stale な search キャッシュを返す", () => {
    const store = emptyStore();
    const rawPages = [{ id: "page-1" }] as unknown as PageObjectResponse[];
    store.searches.query = {
      raw: rawPages,
      cached_at: new Date(0).toISOString(),
      ttl_seconds: 1,
    };

    expect(getCachedPages(store, "query")).toBeNull();
    expect(getCachedPages(store, "query", true)).toBe(rawPages);
  });

  test("allowStale=true なら stale な page キャッシュを返す", () => {
    const store = emptyStore();
    const rawPage = { id: "page-1" } as unknown as PageObjectResponse;
    store.pages["page-1"] = {
      raw: rawPage,
      cached_at: new Date(0).toISOString(),
      ttl_seconds: 1,
    };

    expect(getCachedPage(store, "page-1")).toBeNull();
    expect(getCachedPage(store, "page-1", true)).toBe(rawPage);
  });

  test("allowStale=true なら stale な block キャッシュを返す", () => {
    const store = emptyStore();
    const rawBlocks = [{ id: "block-1" }] as unknown as BlockObjectResponse[];
    store.blocks["page-1"] = {
      raw: rawBlocks,
      cached_at: new Date(0).toISOString(),
      ttl_seconds: 1,
    };

    expect(getCachedBlocks(store, "page-1")).toBeNull();
    expect(getCachedBlocks(store, "page-1", true)).toBe(rawBlocks);
  });
});

describe("invalidatePage", () => {
  test("page と block を削除し、search キャッシュも全消去する", () => {
    const store = emptyStore();
    store.pages["page-1"] = makeEntry(
      { id: "page-1" } as unknown as PageObjectResponse
    );
    store.blocks["page-1"] = makeEntry(
      [{ id: "block-1" }] as unknown as BlockObjectResponse[]
    );
    store.searches[""] = makeEntry(
      [{ id: "page-1" }] as unknown as PageObjectResponse[]
    );
    store.searches.query = makeEntry(
      [{ id: "page-2" }] as unknown as PageObjectResponse[]
    );

    invalidatePage(store, "page-1");

    expect(store.pages["page-1"]).toBeUndefined();
    expect(store.blocks["page-1"]).toBeUndefined();
    expect(store.searches).toEqual({});
  });
});
