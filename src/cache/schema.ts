import type {
  PageObjectResponse,
  BlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

/** Generic cache entry wrapping a raw SDK response */
export interface CacheEntry<T> {
  raw: T;
  cached_at: string; // ISO8601
  ttl_seconds: number;
}

export interface CacheStore {
  version: 2;
  /** Key: page_id → raw PageObjectResponse */
  pages: Record<string, CacheEntry<PageObjectResponse>>;
  /** Key: page_id → raw BlockObjectResponse[] (recursively flattened) */
  blocks: Record<string, CacheEntry<BlockObjectResponse[]>>;
  /** Key: query string (or "" for no-query list) → raw PageObjectResponse[] */
  searches: Record<string, CacheEntry<PageObjectResponse[]>>;
}

export const DEFAULT_TTL = 300;        // 5 minutes for pages/blocks
export const SEARCH_TTL = 60;          // 1 minute for search results

export function emptyStore(): CacheStore {
  return { version: 2, pages: {}, blocks: {}, searches: {} };
}

export function isStale(entry: CacheEntry<unknown>): boolean {
  const timestamp = new Date(entry.cached_at).getTime();
  if (!Number.isFinite(timestamp)) return true;
  const age = (Date.now() - timestamp) / 1000;
  return age > entry.ttl_seconds;
}

export function makeEntry<T>(raw: T, ttl = DEFAULT_TTL): CacheEntry<T> {
  return { raw, cached_at: new Date().toISOString(), ttl_seconds: ttl };
}
