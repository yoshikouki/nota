import { describe, expect, test } from "bun:test";
import { parseNotionUrl } from "../src/utils/parseNotionUrl";

const EXPECTED_UUID = "312baba9-25d8-80d7-9a15-ff687f908cc9";

describe("parseNotionUrl", () => {
  // Plain IDs — backward compat
  test("32-char hex ID → UUID", () => {
    expect(parseNotionUrl("312baba925d880d79a15ff687f908cc9")).toBe(EXPECTED_UUID);
  });

  test("UUID with hyphens → passthrough", () => {
    expect(parseNotionUrl("312baba9-25d8-80d7-9a15-ff687f908cc9")).toBe(EXPECTED_UUID);
  });

  // Notion URLs
  test("URL with title-id slug", () => {
    expect(
      parseNotionUrl("https://www.notion.so/yoshikouki/AI-312baba925d880d79a15ff687f908cc9")
    ).toBe(EXPECTED_UUID);
  });

  test("URL with title-id slug and query params", () => {
    expect(
      parseNotionUrl("https://www.notion.so/yoshikouki/AI-312baba925d880d79a15ff687f908cc9?source=copy_link")
    ).toBe(EXPECTED_UUID);
  });

  test("URL with bare ID path", () => {
    expect(
      parseNotionUrl("https://www.notion.so/312baba925d880d79a15ff687f908cc9")
    ).toBe(EXPECTED_UUID);
  });

  test("URL with nested workspace path", () => {
    expect(
      parseNotionUrl("https://www.notion.so/my-workspace/My-Page-Title-312baba925d880d79a15ff687f908cc9")
    ).toBe(EXPECTED_UUID);
  });

  test("URL with hash fragment ignored", () => {
    expect(
      parseNotionUrl("https://www.notion.so/312baba925d880d79a15ff687f908cc9#some-block")
    ).toBe(EXPECTED_UUID);
  });

  // Error cases
  test("invalid string throws", () => {
    expect(() => parseNotionUrl("not-an-id-or-url")).toThrow("Invalid Notion page ID or URL");
  });

  test("URL without ID throws", () => {
    expect(() => parseNotionUrl("https://www.notion.so/")).toThrow("Could not extract a Notion page ID from URL");
  });

  test("URL with no valid ID segment throws", () => {
    expect(() => parseNotionUrl("https://www.notion.so/my-workspace/just-a-title")).toThrow("Could not extract a Notion page ID from URL");
  });
});
