import { Command } from "commander";
import { getClient, withRetry } from "../api/client";
import { searchDatabases } from "../api/databases";
import { loadConfig } from "../utils/config";
import { loadConfig as loadNotaConfig } from "../utils/config-file";
import { getPagesDir } from "../utils/xdg";
import { readdirSync } from "fs";

// ── result types ──────────────────────────────────────────────────────────────

type CheckStatus = "pass" | "fail" | "warn";

interface CheckResult {
  name: string;
  status: CheckStatus;
  value: string;
  hints: string[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

function icon(status: CheckStatus): string {
  return status === "pass" ? "✓" : status === "warn" ? "⚠" : "✗";
}

function countCachedPages(): number {
  try {
    return readdirSync(getPagesDir()).filter((f) => f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

// ── individual checks ─────────────────────────────────────────────────────────

function checkToken(): CheckResult {
  try {
    const { notionToken } = loadConfig();
    const hint = `${notionToken.slice(0, 10)}…${notionToken.slice(-4)}`;
    return { name: "NOTION_TOKEN", status: "pass", value: `set (${hint})`, hints: [] };
  } catch {
    return {
      name: "NOTION_TOKEN",
      status: "fail",
      value: "not set",
      hints: [
        "export NOTION_TOKEN=secret_xxxx",
        "Find your token: Notion → Settings → Connections → Your integrations → show token",
      ],
    };
  }
}

async function checkConnectivity(): Promise<CheckResult> {
  try {
    const client = getClient();
    const start = Date.now();
    await withRetry(() =>
      client.search({ filter: { value: "page", property: "object" }, page_size: 1 })
    );
    const ms = Date.now() - start;
    return { name: "API connectivity", status: "pass", value: `connected (${ms}ms)`, hints: [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: "API connectivity",
      status: "fail",
      value: "failed",
      hints: [
        `Error: ${msg}`,
        "Check that NOTION_TOKEN is valid and not expired",
        "Rotate token: Notion → Settings → Connections → Your integrations",
      ],
    };
  }
}

async function checkDatabases(): Promise<CheckResult> {
  try {
    const dbs = await searchDatabases();
    if (dbs.length === 0) {
      return {
        name: "Accessible databases",
        status: "warn",
        value: "0 databases found",
        hints: [
          "Share at least one database with your integration:",
          "  Open a Notion database → ··· → Connect to → select your integration",
          "  Or share a parent page to grant access to all child databases",
        ],
      };
    }
    return {
      name: "Accessible databases",
      status: "pass",
      value: `${dbs.length} database${dbs.length === 1 ? "" : "s"} found`,
      hints: [],
    };
  } catch {
    return {
      name: "Accessible databases",
      status: "fail",
      value: "could not fetch",
      hints: ["Run `nota db list` to see the detailed error"],
    };
  }
}

function checkDefaultParent(): CheckResult {
  const config = loadNotaConfig();
  const parentId = config.create?.parent;
  if (parentId) {
    const type = config.create?.parentType ?? "auto-detect";
    return {
      name: "Default parent",
      status: "pass",
      value: `${parentId.slice(0, 8)}… (${type})`,
      hints: [],
    };
  }
  return {
    name: "Default parent",
    status: "warn",
    value: "not configured (optional)",
    hints: [
      "nota db list                                  # find a database ID",
      "nota config set create.parent <database-id>  # set as default",
      "nota config set create.parentType database",
    ],
  };
}

function checkCache(): CheckResult {
  const count = countCachedPages();
  if (count === 0) {
    return {
      name: "Cache",
      status: "warn",
      value: "empty",
      hints: ["Run `nota list` to populate the cache"],
    };
  }
  return {
    name: "Cache",
    status: "pass",
    value: `${count.toLocaleString("en-US")} pages cached`,
    hints: [],
  };
}

// ── render ────────────────────────────────────────────────────────────────────

function printResult(r: CheckResult, nameWidth: number): void {
  const ic = icon(r.status);
  const name = r.name.padEnd(nameWidth);
  console.log(`  ${ic}  ${name}  ${r.value}`);
  for (const hint of r.hints) {
    console.log(`       ${" ".repeat(nameWidth)}  ${hint}`);
  }
}

// ── command ───────────────────────────────────────────────────────────────────

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check configuration and connectivity; print hints for any issues")
    .option("--json", "Output results as JSON")
    .action(async (options: { json?: boolean }) => {
      process.stderr.write("Running checks…\r");

      const tokenResult = checkToken();
      const connectivityResult =
        tokenResult.status === "pass"
          ? await checkConnectivity()
          : { name: "API connectivity", status: "fail" as const, value: "skipped (no token)", hints: [] };
      const databasesResult =
        connectivityResult.status === "pass"
          ? await checkDatabases()
          : { name: "Accessible databases", status: "fail" as const, value: "skipped", hints: [] };
      const defaultParentResult = checkDefaultParent();
      const cacheResult = checkCache();

      process.stderr.write("             \r");

      const results: CheckResult[] = [
        tokenResult,
        connectivityResult,
        databasesResult,
        defaultParentResult,
        cacheResult,
      ];

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      const nameWidth = Math.max(...results.map((r) => r.name.length));
      console.log("nota doctor — configuration check\n");
      for (const r of results) {
        printResult(r, nameWidth);
      }

      const failures = results.filter((r) => r.status === "fail").length;
      const warnings = results.filter((r) => r.status === "warn").length;

      console.log("");
      if (failures > 0) {
        console.log(`${failures} check(s) failed. Fix the issues above and re-run \`nota doctor\`.`);
        process.exit(1);
      } else if (warnings > 0) {
        console.log(`All required checks passed. ${warnings} optional hint(s) above.`);
      } else {
        console.log("All checks passed. nota is ready to use.");
      }
    })
    .addHelpText(
      "after",
      `
Examples:
  nota doctor            # run all checks and print hints
  nota doctor --json     # machine-readable output for scripts / AI agents`
    );
}
