import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import type {
  BlockObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { getCachePath } from "../utils/xdg";
import {
  type CacheStore,
  DEFAULT_TTL,
  SEARCH_TTL,
  emptyStore,
  isStale,
  makeEntry,
} from "./schema";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCacheStore(value: unknown): value is CacheStore {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.version === 2 &&
    isRecord(value.pages) &&
    isRecord(value.blocks) &&
    isRecord(value.searches)
  );
}

function normalizeQuery(query?: string): string {
  return query ?? "";
}

export function loadCache(): CacheStore {
  const cachePath = getCachePath();
  if (!existsSync(cachePath)) {
    return emptyStore();
  }

  try {
    const raw = readFileSync(cachePath, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      try {
        renameSync(cachePath, `${cachePath}.bak`);
      } catch {
        // ignore backup failure and continue resetting
      }
      console.error("nota: cache corrupted, resetting (backed up to cache.json.bak)");
      return emptyStore();
    }

    if (!isCacheStore(parsed)) {
      return emptyStore();
    }
    return parsed;
  } catch {
    return emptyStore();
  }
}

export function saveCache(store: CacheStore): void {
  const cachePath = getCachePath();
  const tmpPath = `${cachePath}.tmp`;
  const data = JSON.stringify(store, null, 2);
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, cachePath);
}

export function getCachedPages(
  store: CacheStore,
  query?: string,
  allowStale = false
): PageObjectResponse[] | null {
  const key = normalizeQuery(query);
  const entry = store.searches[key];
  if (!entry) {
    return null;
  }
  if (!allowStale && isStale(entry)) {
    return null;
  }
  return entry.raw;
}

export function setCachedPages(
  store: CacheStore,
  pages: PageObjectResponse[],
  query?: string
): void {
  const key = normalizeQuery(query);
  store.searches[key] = makeEntry(pages, SEARCH_TTL);
}

export function getCachedPage(
  store: CacheStore,
  pageId: string,
  allowStale = false
): PageObjectResponse | null {
  const entry = store.pages[pageId];
  if (!entry) {
    return null;
  }
  if (!allowStale && isStale(entry)) {
    return null;
  }
  return entry.raw;
}

export function setCachedPage(
  store: CacheStore,
  page: PageObjectResponse
): void {
  store.pages[page.id] = makeEntry(page, DEFAULT_TTL);
}

export function getCachedBlocks(
  store: CacheStore,
  pageId: string,
  allowStale = false
): BlockObjectResponse[] | null {
  const entry = store.blocks[pageId];
  if (!entry) {
    return null;
  }
  if (!allowStale && isStale(entry)) {
    return null;
  }
  return entry.raw;
}

export function setCachedBlocks(
  store: CacheStore,
  pageId: string,
  blocks: BlockObjectResponse[]
): void {
  store.blocks[pageId] = makeEntry(blocks, DEFAULT_TTL);
}

export function invalidatePage(store: CacheStore, pageId: string): void {
  delete store.pages[pageId];
  delete store.blocks[pageId];
  store.searches = {};
}

export function clearCache(): void {
  rmSync(getCachePath(), { force: true });
}
