/**
 * Parse a Notion page ID from a URL or raw ID string.
 *
 * Supported input formats:
 *   - Raw UUID:   "312baba9-25d8-80d7-9a15-ff687f908cc9"
 *   - Raw hex ID: "312baba925d880d79a15ff687f908cc9"
 *   - Notion URL: "https://www.notion.so/workspace/Page-Title-312baba925d880d79a15ff687f908cc9"
 *   - Notion URL: "https://www.notion.so/312baba925d880d79a15ff687f908cc9"
 *   - With query: "https://www.notion.so/...?source=copy_link"
 *
 * Returns the page ID as a UUID string (with hyphens, 8-4-4-4-12 format).
 * Notion API returns parent.page_id in UUID format, so we must match it.
 * Throws if the input looks like a URL but no valid ID can be extracted.
 */
function hexToUuid(hex: string): string {
  const h = hex.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function parseNotionUrl(input: string): string {
  const trimmed = input.trim();

  // Already a plain UUID (with hyphens)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Already a plain 32-char hex ID — convert to UUID
  if (/^[0-9a-f]{32}$/i.test(trimmed)) {
    return hexToUuid(trimmed);
  }

  // Looks like a URL — extract the ID from the last path segment
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.includes("notion.so")) {
    let pathname: string;
    try {
      const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      pathname = url.pathname;
    } catch {
      throw new Error(`Invalid Notion URL: ${input}`);
    }

    // Last path segment, strip query/hash
    const segments = pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1] ?? "";

    // Match trailing 32-char hex (optionally preceded by a title and hyphen)
    const match = lastSegment.match(/([0-9a-f]{32})$/i);
    if (match?.[1]) {
      return hexToUuid(match[1]);
    }

    // Match UUID format in last segment
    const uuidMatch = lastSegment.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (uuidMatch?.[1]) {
      return uuidMatch[1].toLowerCase();
    }

    throw new Error(`Could not extract a Notion page ID from URL: ${input}`);
  }

  throw new Error(`Invalid Notion page ID or URL: ${input}`);
}
