import { Client } from "@notionhq/client";
import { loadConfig } from "../utils/config";

let _client: Client | null = null;

export function getClient(): Client {
  if (!_client) {
    const { notionToken } = loadConfig();
    _client = new Client({ auth: notionToken });
  }
  return _client;
}

/**
 * Wrap a Notion API call with exponential backoff on 429.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status =
        typeof err === "object" && err !== null && "status" in err
          ? (err as { status: number }).status
          : null;

      if (status === 429 && attempt < maxRetries) {
        const headers =
          typeof err === "object" && err !== null && "headers" in err
            ? (err as { headers?: Record<string, string> }).headers
            : undefined;
        const retryAfterVal = headers?.["retry-after"];
        const retryAfter =
          typeof retryAfterVal === "string"
            ? parseInt(retryAfterVal, 10)
            : null;
        const waitMs = retryAfter ? retryAfter * 1000 : 2 ** attempt * 1000;
        await Bun.sleep(waitMs);
        continue;
      }
      break;
    }
  }
  throw lastError;
}
