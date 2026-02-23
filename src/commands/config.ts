import { Command } from "commander";
import {
  getConfigPath,
  loadConfig,
  saveConfig,
  type NotaConfig,
} from "../utils/config-file";

const SUPPORTED_KEYS = new Set([
  "cache.enabled",
  "cache.ttl",
  "list.sort",
  "list.database",
]);

function coerceValue(value: string): boolean | number | string {
  const normalized = value.trim();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    return Number(normalized);
  }
  return value;
}

function assertSupportedKey(key: string): void {
  if (!SUPPORTED_KEYS.has(key)) {
    throw new Error(
      `unsupported key: ${key} (supported: ${[...SUPPORTED_KEYS].join(", ")})`
    );
  }
}

function validateValueForKey(
  key: string,
  value: boolean | number | string
): void {
  if (key === "cache.enabled" && typeof value !== "boolean") {
    throw new Error("cache.enabled must be a boolean");
  }
  if (key === "cache.ttl") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value <= 0
    ) {
      throw new Error("cache.ttl must be a positive integer");
    }
  }
  if (key === "list.sort" && value !== "edited" && value !== "none") {
    throw new Error("list.sort must be one of: edited, none");
  }
  if (key === "list.database" && typeof value !== "string") {
    throw new Error("list.database must be a string");
  }
}

function setConfigValue(
  config: NotaConfig,
  key: string,
  value: boolean | number | string
): NotaConfig {
  const [section, field] = key.split(".") as [string, string];
  if (section === "cache") {
    const nextCache = { ...(config.cache ?? {}) };
    if (field === "enabled") {
      nextCache.enabled = value as boolean;
    } else if (field === "ttl") {
      nextCache.ttl = value as number;
    }
    return { ...config, cache: nextCache };
  }

  if (section === "list") {
    const nextList = { ...(config.list ?? {}) };
    if (field === "sort") {
      nextList.sort = value as "edited" | "none";
    } else if (field === "database") {
      nextList.database = value as string;
    }
    return { ...config, list: nextList };
  }

  return config;
}

function unsetConfigValue(config: NotaConfig, key: string): NotaConfig {
  const nextConfig: NotaConfig = {
    ...config,
    cache: config.cache ? { ...config.cache } : undefined,
    list: config.list ? { ...config.list } : undefined,
  };

  if (key === "cache.enabled" && nextConfig.cache) {
    delete nextConfig.cache.enabled;
  } else if (key === "cache.ttl" && nextConfig.cache) {
    delete nextConfig.cache.ttl;
  } else if (key === "list.sort" && nextConfig.list) {
    delete nextConfig.list.sort;
  } else if (key === "list.database" && nextConfig.list) {
    delete nextConfig.list.database;
  }

  if (nextConfig.cache && Object.keys(nextConfig.cache).length === 0) {
    delete nextConfig.cache;
  }
  if (nextConfig.list && Object.keys(nextConfig.list).length === 0) {
    delete nextConfig.list;
  }

  return nextConfig;
}

export function registerConfigCommand(program: Command): void {
  const configCommand = program.command("config").description("Manage config");

  configCommand
    .command("show")
    .description("Print current config")
    .action(() => {
      try {
        const config = loadConfig();
        console.log(
          JSON.stringify(
            {
              path: getConfigPath(),
              config,
            },
            null,
            2
          )
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });

  configCommand
    .command("set <key> <value>")
    .description("Set a config value")
    .action((key: string, rawValue: string) => {
      try {
        assertSupportedKey(key);
        const value = coerceValue(rawValue);
        validateValueForKey(key, value);

        const config = loadConfig();
        const nextConfig = setConfigValue(config, key, value);
        saveConfig(nextConfig);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });

  configCommand
    .command("unset <key>")
    .description("Unset a config value")
    .action((key: string) => {
      try {
        assertSupportedKey(key);
        const config = loadConfig();
        const nextConfig = unsetConfigValue(config, key);
        saveConfig(nextConfig);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });
}
