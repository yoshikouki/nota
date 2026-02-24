import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface NotaConfig {
  cache?: {
    enabled?: boolean;
    ttl?: number;
  };
  list?: {
    sort?: "edited" | "none";
    database?: string;
  };
  create?: {
    parent?: string;
    parentType?: "page" | "database";
  };
}

function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  const base = xdgConfig || join(process.env.HOME || "~", ".config");
  return join(base, "nota");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function loadConfig(): NotaConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      console.error(`nota: failed to parse config JSON: ${configPath}`);
      return {};
    }

    if (!isRecord(parsed)) {
      return {};
    }
    return parsed as NotaConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: NotaConfig): void {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}
