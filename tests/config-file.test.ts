import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getConfigPath,
  loadConfig,
  saveConfig,
} from "../src/utils/config-file";

const ORIGINAL_XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;
let testConfigHome = "";

beforeEach(() => {
  testConfigHome = mkdtempSync(join(tmpdir(), "nota-config-test-"));
  process.env.XDG_CONFIG_HOME = testConfigHome;
});

afterEach(() => {
  if (ORIGINAL_XDG_CONFIG_HOME === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = ORIGINAL_XDG_CONFIG_HOME;
  }
  rmSync(testConfigHome, { recursive: true, force: true });
});

describe("config file", () => {
  test("設定ファイルがなければ空設定を返す", () => {
    expect(loadConfig()).toEqual({});
  });

  test("saveConfig はディレクトリを作成して保存する", () => {
    saveConfig({
      cache: { enabled: true, ttl: 600 },
      list: { sort: "edited", database: "db-123" },
    });

    const path = getConfigPath();
    expect(existsSync(path)).toBe(true);
    expect(loadConfig()).toEqual({
      cache: { enabled: true, ttl: 600 },
      list: { sort: "edited", database: "db-123" },
    });
  });

  test("JSON が壊れている場合は警告して空設定を返す", () => {
    const path = getConfigPath();
    saveConfig({});
    writeFileSync(path, "{broken-json", "utf-8");

    const messages: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      messages.push(args.join(" "));
    };

    try {
      expect(loadConfig()).toEqual({});
      expect(messages).toContain(`nota: failed to parse config JSON: ${path}`);
    } finally {
      console.error = originalError;
    }
  });
});
