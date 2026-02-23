import {
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import type {
  BlockObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { getBlocksDir, getPagesDir, getSearchesDir } from "../utils/xdg";
import {
  type CacheEntry,
  type SearchCacheEntry,
  DEFAULT_TTL,
  SEARCH_TTL,
  isStale,
  makeEntry,
} from "./schema";

function warnWriteError(filePath: string): void {
  console.error(`nota: failed to write cache file: ${filePath}`);
}

function writeCacheFile(filePath: string, value: unknown): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    writeFileSync(tmpPath, JSON.stringify(value), "utf-8");
    renameSync(tmpPath, filePath);
  } catch {
    try {
      rmSync(tmpPath, { force: true });
    } catch {
      // ignore cleanup failure
    }
    warnWriteError(filePath);
  }
}

function readCacheFile<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isCacheEntry(value: unknown): value is CacheEntry<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.cached_at === "string" &&
    typeof entry.ttl_seconds === "number" &&
    "raw" in entry
  );
}

function isSearchCacheEntry(value: unknown): value is SearchCacheEntry {
  if (!isCacheEntry(value)) {
    return false;
  }
  const entry = value as unknown as Record<string, unknown>;
  const query = entry.query;
  return (
    typeof entry.sort === "string" &&
    (typeof query === "string" || typeof query === "undefined")
  );
}

function readEntry<T>(filePath: string): CacheEntry<T> | null {
  const entry = readCacheFile<unknown>(filePath);
  if (!isCacheEntry(entry)) {
    return null;
  }
  return entry as CacheEntry<T>;
}

function readSearchEntry(filePath: string): SearchCacheEntry | null {
  const entry = readCacheFile<unknown>(filePath);
  if (!isSearchCacheEntry(entry)) {
    return null;
  }
  return entry;
}

function pagePath(pageId: string): string {
  return join(getPagesDir(), `${pageId}.json`);
}

function blockPath(pageId: string): string {
  return join(getBlocksDir(), `${pageId}.json`);
}

function searchPath(query: string | undefined, sort: string): string {
  return join(getSearchesDir(), `${searchHash(query, sort)}.json`);
}

function deleteFile(filePath: string): void {
  try {
    rmSync(filePath, { force: true });
  } catch {
    // ignore delete failures
  }
}

// Search hash: base64url(JSON.stringify({query, sort})) truncated to 32 chars
function searchHash(query: string | undefined, sort: string): string {
  const payload = JSON.stringify({ query, sort });
  return Buffer.from(payload).toString("base64url").slice(0, 32);
}

export function getCachedPage(
  pageId: string,
  allowStale = false
): PageObjectResponse | null {
  const entry = readEntry<PageObjectResponse>(pagePath(pageId));
  if (!entry) {
    return null;
  }
  if (!allowStale && isStale(entry)) {
    return null;
  }
  return entry.raw;
}

export function setCachedPage(
  page: PageObjectResponse,
  ttl = DEFAULT_TTL
): void {
  writeCacheFile(pagePath(page.id), makeEntry(page, ttl));
}

export function invalidatePage(pageId: string): void {
  deleteFile(pagePath(pageId));
  deleteFile(blockPath(pageId));
}

export function getCachedBlocks(
  pageId: string,
  allowStale = false
): BlockObjectResponse[] | null {
  const entry = readEntry<BlockObjectResponse[]>(blockPath(pageId));
  if (!entry) {
    return null;
  }
  if (!allowStale && isStale(entry)) {
    return null;
  }
  return entry.raw;
}

export function setCachedBlocks(
  pageId: string,
  blocks: BlockObjectResponse[],
  ttl = DEFAULT_TTL
): void {
  writeCacheFile(blockPath(pageId), makeEntry(blocks, ttl));
}

export function getCachedSearch(
  query: string | undefined,
  sort: string,
  allowStale = false
): PageObjectResponse[] | null {
  const entry = readSearchEntry(searchPath(query, sort));
  if (!entry) {
    return null;
  }
  if (entry.query !== query || entry.sort !== sort) {
    return null;
  }
  if (!allowStale && isStale(entry)) {
    return null;
  }
  return entry.raw;
}

export function setCachedSearch(
  query: string | undefined,
  sort: string,
  pages: PageObjectResponse[],
  ttl = SEARCH_TTL
): void {
  const entry: SearchCacheEntry = {
    ...makeEntry(pages, ttl),
    query,
    sort,
  };
  writeCacheFile(searchPath(query, sort), entry);
}

export function clearAllCache(): void {
  rmSync(getPagesDir(), { recursive: true, force: true });
  rmSync(getBlocksDir(), { recursive: true, force: true });
  rmSync(getSearchesDir(), { recursive: true, force: true });

  getPagesDir();
  getBlocksDir();
  getSearchesDir();
}
