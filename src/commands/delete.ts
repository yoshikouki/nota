import { Command } from "commander";
import { fetchPageRaw, toNotaPage } from "../api/pages";
import { archivePage } from "../api/blocks";
import { archiveDatabase, toNotaDatabase } from "../api/databases";
import { getClient } from "../api/client";
import type { DataSourceObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { invalidatePage } from "../cache/store";
import { parseNotionUrl } from "../utils/parseNotionUrl";

interface DeleteOptions {
  force?: boolean;
}

async function confirm(prompt: string): Promise<boolean> {
  const { createInterface } = await import("node:readline");
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

type TargetKind =
  | { kind: "page"; title: string; url: string }
  | { kind: "database"; title: string; url: string };

/** Resolve whether the ID is a page or a database, return display info. */
async function resolveTarget(id: string): Promise<TargetKind> {
  // Try page first
  try {
    const raw = await fetchPageRaw(id);
    const page = toNotaPage(raw);
    return { kind: "page", title: page.title, url: page.url };
  } catch {
    // not a page
  }
  const client = getClient();
  // Try data source (SDK v5 connected databases)
  try {
    const raw = await client.dataSources.retrieve({ data_source_id: id });
    if (!("properties" in raw)) {
      throw new Error(`Received partial response for data source: ${id}`);
    }
    const db = toNotaDatabase(raw as DataSourceObjectResponse);
    return { kind: "database", title: db.title, url: db.url };
  } catch {
    // not a data source
  }
  // Try legacy database (created via databases.create — object:"database" format)
  try {
    const raw = await client.databases.retrieve({ database_id: id });
    const titleArr = (raw as unknown as { title?: Array<{ plain_text: string }> }).title ?? [];
    const title = titleArr.map((t) => t.plain_text).join("") || "(Untitled)";
    const url = (raw as unknown as { url?: string }).url ?? "";
    return { kind: "database", title, url };
  } catch {
    // not a legacy database either
  }
  throw new Error(
    `Could not find a page or database with id: ${id}\n\n` +
    "Make sure the integration has access to it, then find the correct ID:\n" +
    "  nota list --json | jq '.[] | {id, title}'   # page IDs\n" +
    "  nota db list --json | jq '.[] | {id, title}' # database IDs\n\n" +
    "Note: Notion URL IDs are database_ids, not data_source_ids.\n" +
    "  nota db sources <database_id>  # resolve URL ID → data_source_id"
  );
}

export function registerDeleteCommand(program: Command): void {
  program
    .command("delete <id>")
    .description("Archive (soft-delete) a Notion page or database")
    .option("--force", "Skip confirmation prompt")
    .action(async (id: string, options: DeleteOptions) => {
      try {
        id = parseNotionUrl(id);
        const target = await resolveTarget(id);

        if (!options.force) {
          const ok = await confirm(
            `Archive ${target.kind} "${target.title}" (${id})?\n  ${target.url}\nProceed?`
          );
          if (!ok) {
            console.log("Cancelled.");
            return;
          }
        }

        if (target.kind === "page") {
          await archivePage(id);
          invalidatePage(id);
        } else {
          await archiveDatabase(id);
        }

        console.log(`Archived: "${target.title}" (${id})`);
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
  nota delete <page-id>       # archive a page (with confirmation)
  nota delete <database-id>   # archive a database (with confirmation)
  nota delete <id> --force    # skip confirmation prompt`
    );
}
