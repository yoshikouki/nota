import { describe, expect, test } from "bun:test";
import { isStale, type CacheEntry } from "../src/cache/schema";

describe("isStale", () => {
  test("cached_at が不正な日付文字列なら stale 扱いになる", () => {
    const entry: CacheEntry<unknown> = {
      raw: {},
      cached_at: "not-a-date",
      ttl_seconds: 60,
    };

    expect(isStale(entry)).toBe(true);
  });
});
