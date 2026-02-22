export interface CachedPage {
  id: string;
  title: string;
  parent: {
    type: "page_id" | "database_id" | "workspace";
    id: string | null;
  };
  url: string;
  created_time: string;
  last_edited_time: string;
  cached_at: string;
  ttl_seconds: number;
  markdown: string | null;
  children: string[];
}

export interface CachedDatabase {
  id: string;
  title: string;
  cached_at: string;
  ttl_seconds: number;
  page_ids: string[];
}

export interface CacheStore {
  version: 1;
  pages: Record<string, CachedPage>;
  databases: Record<string, CachedDatabase>;
}

export const DEFAULT_TTL = 300; // 5 minutes

export function emptyStore(): CacheStore {
  return { version: 1, pages: {}, databases: {} };
}

export function isStale(cachedAt: string, ttlSeconds: number): boolean {
  const age = (Date.now() - new Date(cachedAt).getTime()) / 1000;
  return age > ttlSeconds;
}
