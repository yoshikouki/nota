import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const decoder = new TextDecoder();
const ORIGINAL_XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;
let testConfigHome = "";

function runNota(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync({
    cmd: ["bun", "run", "src/index.ts", ...args],
    cwd: process.cwd(),
    env: {
      ...process.env,
      XDG_CONFIG_HOME: testConfigHome,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    stdout: decoder.decode(proc.stdout),
    stderr: decoder.decode(proc.stderr),
    exitCode: proc.exitCode,
  };
}

beforeEach(() => {
  testConfigHome = mkdtempSync(join(tmpdir(), "nota-config-cmd-test-"));
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

describe("nota config command", () => {
  test("set で型変換された値を保存できる", () => {
    const setEnabled = runNota(["config", "set", "cache.enabled", "true"]);
    const setTtl = runNota(["config", "set", "cache.ttl", "600"]);

    expect(setEnabled.exitCode).toBe(0);
    expect(setEnabled.stderr).toBe("");
    expect(setTtl.exitCode).toBe(0);
    expect(setTtl.stderr).toBe("");

    const raw = readFileSync(join(testConfigHome, "nota", "config.json"), "utf-8");
    expect(JSON.parse(raw)).toEqual({
      cache: {
        enabled: true,
        ttl: 600,
      },
    });
  });

  test("unset でキーを削除できる", () => {
    runNota(["config", "set", "list.database", "db-123"]);
    const unset = runNota(["config", "unset", "list.database"]);
    const show = runNota(["config", "show"]);

    expect(unset.exitCode).toBe(0);
    expect(unset.stderr).toBe("");
    expect(show.exitCode).toBe(0);

    const parsed = JSON.parse(show.stdout) as {
      path: string;
      config: Record<string, unknown>;
    };
    expect(parsed.path).toBe(join(testConfigHome, "nota", "config.json"));
    expect(parsed.config).toEqual({});
  });
});
