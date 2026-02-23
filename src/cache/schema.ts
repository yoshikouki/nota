import type {
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

/** Generic cache entry wrapping a raw SDK response */
export interface CacheEntry<T> {
  raw: T;
  cached_at: string; // ISO8601
  ttl_seconds: number;
}

export interface SearchCacheEntry extends CacheEntry<PageObjectResponse[]> {
  query: string | undefined;
  sort: string;
}

export const DEFAULT_TTL = 300;        // 5 minutes for pages/blocks
export const SEARCH_TTL = 60;          // 1 minute for search results

export function isStale(entry: CacheEntry<unknown>): boolean {
  const timestamp = new Date(entry.cached_at).getTime();
  if (!Number.isFinite(timestamp)) return true;
  const age = (Date.now() - timestamp) / 1000;
  return age > entry.ttl_seconds;
}

export function makeEntry<T>(raw: T, ttl = DEFAULT_TTL): CacheEntry<T> {
  return { raw, cached_at: new Date().toISOString(), ttl_seconds: ttl };
}
