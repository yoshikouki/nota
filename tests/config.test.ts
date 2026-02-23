import { afterEach, describe, expect, test } from "bun:test";
import { loadConfig } from "../src/utils/config";

const ORIGINAL_TOKEN = process.env.NOTION_TOKEN;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.NOTION_TOKEN;
  } else {
    process.env.NOTION_TOKEN = ORIGINAL_TOKEN;
  }
});

describe("loadConfig", () => {
  test("NOTION_TOKEN が未設定なら説明付きエラーを投げる", () => {
    delete process.env.NOTION_TOKEN;

    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as typeof process.exit;

    try {
      expect(() => loadConfig()).toThrow(
        "NOTION_TOKEN is not set. Export it or add to ~/.zshenv.local"
      );
    } finally {
      process.exit = originalExit;
    }
  });

  test("NOTION_TOKEN が設定済みなら設定を返す", () => {
    process.env.NOTION_TOKEN = "secret-token";
    expect(loadConfig()).toEqual({ notionToken: "secret-token" });
  });
});
