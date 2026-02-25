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
  "create.parent",
  "create.parentType",
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
  if (key === "create.parent" && typeof value !== "string") {
    throw new Error("create.parent must be a string (page or database ID)");
  }
  if (key === "create.parentType" && value !== "page" && value !== "database") {
    throw new Error('create.parentType must be one of: page, database');
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

  if (section === "create") {
    const nextCreate = { ...(config.create ?? {}) };
    if (field === "parent") {
      nextCreate.parent = value as string;
    } else if (field === "parentType") {
      nextCreate.parentType = value as "page" | "database";
    }
    return { ...config, create: nextCreate };
  }

  return config;
}

function unsetConfigValue(config: NotaConfig, key: string): NotaConfig {
  const nextConfig: NotaConfig = {
    ...config,
    cache: config.cache ? { ...config.cache } : undefined,
    list: config.list ? { ...config.list } : undefined,
    create: config.create ? { ...config.create } : undefined,
  };

  if (key === "cache.enabled" && nextConfig.cache) {
    delete nextConfig.cache.enabled;
  } else if (key === "cache.ttl" && nextConfig.cache) {
    delete nextConfig.cache.ttl;
  } else if (key === "list.sort" && nextConfig.list) {
    delete nextConfig.list.sort;
  } else if (key === "list.database" && nextConfig.list) {
    delete nextConfig.list.database;
  } else if (key === "create.parent" && nextConfig.create) {
    delete nextConfig.create.parent;
  } else if (key === "create.parentType" && nextConfig.create) {
    delete nextConfig.create.parentType;
  }

  if (nextConfig.cache && Object.keys(nextConfig.cache).length === 0) {
    delete nextConfig.cache;
  }
  if (nextConfig.list && Object.keys(nextConfig.list).length === 0) {
    delete nextConfig.list;
  }
  if (nextConfig.create && Object.keys(nextConfig.create).length === 0) {
    delete nextConfig.create;
  }

  return nextConfig;
}

export function registerConfigCommand(program: Command): void {
  const configCommand = program
    .command("config")
    .description("Manage config")
    .addHelpText(
      "after",
      `
Supported keys:
  cache.enabled      boolean   Enable cache by default (true/false)
  cache.ttl          number    Cache TTL in seconds (positive integer)
  list.sort          string    Default sort for \`nota list\`: edited | none
  list.database      string    Default database ID filter for \`nota list\`
  create.parent      string    Default parent page or database ID for \`nota create\`
  create.parentType  string    Parent type: page | database

Examples:
  nota config show                            # print current config as JSON
  nota config set cache.enabled true          # enable cache globally
  nota config set cache.ttl 300               # set TTL to 5 minutes
  nota config set list.sort edited            # default sort by last edited
  nota config set list.database <db-id>       # always filter by this database
  nota config set create.parent <page-id>     # default parent for new pages
  nota config set create.parentType page
  nota config unset cache.enabled             # remove setting (revert to default)`
    );

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
    })
    .addHelpText(
      "after",
      `
Examples:
  nota config show   # print config file path and all current settings as JSON`
    );

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
    })
    .addHelpText(
      "after",
      `
Supported keys and accepted values:
  cache.enabled      true | false
  cache.ttl          positive integer (seconds)
  list.sort          edited | none
  list.database      <database-id> (string)
  create.parent      <page-id or database-id> (string)
  create.parentType  page | database

Examples:
  nota config set cache.enabled true
  nota config set cache.ttl 300
  nota config set list.sort edited
  nota config set list.database <database-id>
  nota config set create.parent <page-id>
  nota config set create.parentType page`
    );

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
    })
    .addHelpText(
      "after",
      `
Supported keys:
  cache.enabled  cache.ttl  list.sort  list.database
  create.parent  create.parentType

Examples:
  nota config unset cache.enabled   # remove setting (revert to default)
  nota config unset list.database   # stop filtering by a specific database`
    );
}
