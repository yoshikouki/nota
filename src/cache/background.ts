import { searchPagesRaw, type SortOrder } from "../api/pages";
import {
  getCachedPage,
  invalidatePage,
  setCachedPage,
  setCachedSearch,
} from "./store";

function isDebugMode(): boolean {
  if (process.env.NOTA_DEBUG === "1") {
    return true;
  }
  return (process.env.DEBUG ?? "").includes("nota");
}

function runBackgroundRefresh(
  query: string | undefined,
  sort: SortOrder
): void {
  void (async () => {
    try {
      const pages = await searchPagesRaw(query, sort);

      for (const page of pages) {
        const cachedPage = getCachedPage(page.id, true);
        if (!cachedPage || cachedPage.last_edited_time !== page.last_edited_time) {
          invalidatePage(page.id);
        }
        setCachedPage(page);
      }

      setCachedSearch(query, sort, pages);
    } catch (error: unknown) {
      if (!isDebugMode()) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`nota: background cache revalidate failed: ${message}`);
    }
  })();
}

/**
 * Fire-and-forget background refresh after serving stale search cache.
 * 1. Calls searchPagesRaw(query, sort)
 * 2. For each returned page, compares last_edited_time with getCachedPage()
 * 3. If changed or missing -> invalidatePage() (deletes page + blocks files)
 * 4. Updates setCachedPage() for all pages
 * 5. Updates setCachedSearch()
 * Errors are silently swallowed (stderr only in debug mode).
 */
export function revalidateSearchInBackground(
  query: string | undefined,
  sort: SortOrder
): void {
  if (typeof setImmediate === "function") {
    setImmediate(() => runBackgroundRefresh(query, sort));
    return;
  }

  void Promise.resolve().then(() => runBackgroundRefresh(query, sort));
}
