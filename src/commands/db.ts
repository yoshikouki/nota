import { Command } from "commander";
import {
  type QueryFilter,
  type DataSourceRef,
  getDatabaseSchema,
  getDataSources,
  listTemplates,
  queryDatabase,
  searchDatabases,
  toNotaDatabase,
  updateDatabase,
} from "../api/databases";
import { toNotaPage } from "../api/pages";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString("sv-SE");
}

type SortEntry =
  | { property: string; direction: "ascending" | "descending" }
  | { timestamp: "created_time" | "last_edited_time"; direction: "ascending" | "descending" };

function parseSort(raw: string): SortEntry {
  const [field, dir = "ascending"] = raw.split(":");
  const direction = (dir === "desc" || dir === "descending")
    ? "descending" as const
    : "ascending" as const;

  if (field === "created_time" || field === "last_edited_time") {
    return { timestamp: field, direction };
  }
  return { property: field ?? raw, direction };
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * When a data_source_id operation fails with object_not_found, check whether
 * the ID is actually a database_id (container). If so, print actionable hints
 * for AI agents and users who copied the ID from a Notion URL.
 *
 * Notion API 2025-09-03: database_id ≠ data_source_id.
 * URL IDs are database_ids; nota db query/schema require data_source_ids.
 */
async function hintIfDatabaseId(id: string): Promise<void> {
  try {
    const sources = await getDataSources(id);
    if (sources.length === 0) return;
    console.error(`\n"${id}" is a database_id (Notion container), not a data_source_id.`);
    console.error(`nota db query and schema require a data_source_id.\n`);
    console.error(`Data sources for this database:`);
    for (const s of sources) {
      console.error(`  ${s.id}  ${s.name}`);
    }
    console.error(`\nRun: nota db sources ${id}  # to see this list`);
    console.error(`Then: nota db query <data_source_id>`);
    process.exit(1);
  } catch {
    // Not a database_id either — let the original error propagate
  }
}

// ── register ──────────────────────────────────────────────────────────────────

export function registerDbCommand(program: Command): void {
  const db = program.command("db").description("Database operations");

  // ── nota db list ────────────────────────────────────────────────────────────
  db.command("list")
    .description("List databases the integration can access")
    .option("--json", "Output as JSON")
    .action(async (options: { json?: boolean }) => {
      try {
        const dbs = await searchDatabases();
        if (options.json) {
          console.log(JSON.stringify(dbs.map(toNotaDatabase), null, 2));
          return;
        }
        if (dbs.length === 0) {
          console.log("No databases found.");
          return;
        }
        const dateWidth = 10;
        const idWidth = 36;
        for (const db of dbs) {
          const d = toNotaDatabase(db);
          const date = formatDate(d.lastEditedAt).padEnd(dateWidth);
          const id = d.id.padEnd(idWidth);
          const props = `(${d.propertyCount} props)`.padStart(12);
          console.log(`  ${date}  ${id}  ${props}  ${d.title}`);
        }
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // ── nota db schema ──────────────────────────────────────────────────────────
  db.command("schema <database-id>")
    .description("Show database properties (useful for building filters)")
    .option("--json", "Output raw schema as JSON")
    .action(async (databaseId: string, options: { json?: boolean }) => {
      try {
        const schema = await getDatabaseSchema(databaseId);

        if (options.json) {
          console.log(JSON.stringify(schema, null, 2));
          return;
        }

        const title = schema.title.map((t) => t.plain_text).join("") || "(Untitled)";
        console.log(`Database: ${title}`);
        console.log(`ID:       ${schema.id}`);
        console.log(`URL:      ${schema.url}`);
        console.log(`\nProperties:`);

        const props = schema.properties as Record<string, { type: string }>;
        const nameWidth = Math.max(...Object.keys(props).map((k) => k.length), 4);
        for (const [name, prop] of Object.entries(props)) {
          console.log(`  ${name.padEnd(nameWidth)}  ${prop.type}`);
        }

        console.log(`\nFilter example:`);
        console.log(`  nota db query ${schema.id} --filter '{"property":"<name>","<type>":{"equals":"<value>"}}'`);
      } catch (err: unknown) {
        await hintIfDatabaseId(databaseId);
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    })
    .addHelpText(
      "after",
      `
Getting database-id:
  Run \`nota db list\` to see database IDs (2nd column).
  Note: Notion URL IDs are database_ids. If schema returns an error, resolve
  to data_source_id first via \`nota db sources <database-id>\`.

Examples:
  nota db schema <database-id>          # show property names and types
  nota db schema <database-id> --json   # raw JSON schema (for scripting)
  nota db schema <data_source_id>       # also works with data_source_id`
    );

  // ── nota db query ───────────────────────────────────────────────────────────
  db.command("query <database-id>")
    .description("Query rows from a database")
    .option("--filter <json>", "Notion API filter object (JSON string)")
    .option(
      "--sort <prop:dir>",
      "Sort by property (e.g. Date:descending, last_edited_time:desc)",
      (val: string, prev: string[]) => [...prev, val],
      [] as string[]
    )
    .option("--limit <n>", "Maximum number of rows to return", parseInt)
    .option("--json", "Output rows as JSON array")
    .action(
      async (
        databaseId: string,
        options: { filter?: string; sort: string[]; limit?: number; json?: boolean }
      ) => {
        try {
          // Parse filter
          let filter: object | undefined;
          if (options.filter) {
            try {
              filter = JSON.parse(options.filter) as object;
            } catch {
              console.error("Error: --filter must be valid JSON");
              process.exit(1);
            }
          }

          // Parse sorts
          const sorts: SortEntry[] | undefined = options.sort.length > 0
            ? options.sort.map(parseSort)
            : undefined;

          const rows = await queryDatabase(databaseId, {
            filter: filter as QueryFilter,
            sorts,
            limit: options.limit,
          });

          if (options.json) {
            console.log(JSON.stringify(rows, null, 2));
            return;
          }

          if (rows.length === 0) {
            console.log("No rows found.");
            return;
          }

          const pages = rows.map(toNotaPage);
          const dateWidth = 10;
          const idWidth = 36;
          for (const p of pages) {
            const date = formatDate(p.lastEditedAt).padEnd(dateWidth);
            const id = p.id.padEnd(idWidth);
            console.log(`  ${date}  ${id}  ${p.title}`);
          }
          console.log(`\n  ${rows.length} row(s)`);
        } catch (err: unknown) {
          await hintIfDatabaseId(databaseId);
          console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      }
    )
    .addHelpText(
      "after",
      `
Getting database-id:
  Run \`nota db list\` to see database IDs.
  Notion URL IDs are database_ids. If query fails, resolve to data_source_id:
    nota db sources <database-id>   # find data_source_ids
    nota db query   <data_source_id>

Examples:
  nota db query <database-id>                         # all rows
  nota db query <database-id> --limit 10              # first 10 rows
  nota db query <database-id> --json                  # output as JSON
  nota db query <database-id> --sort "last_edited_time:desc"
  nota db query <database-id> --filter '{"property":"Status","select":{"equals":"Done"}}'

  # AI-agent workflow: pipe IDs for further processing
  nota db query <database-id> --json | jq '.[].id'`
    );

  // ── nota db update ──────────────────────────────────────────────────────────
  db.command("update <database-id>")
    .description("Update a database title or properties schema")
    .option("--title <title>", "New database title")
    .option(
      "--schema <json>",
      "Properties schema update as JSON (Notion API format)"
    )
    .option("--json", "Output updated database as JSON")
    .action(
      async (
        databaseId: string,
        options: { title?: string; schema?: string; json?: boolean }
      ) => {
        try {
          if (!options.title && !options.schema) {
            console.error(
              "Error: specify --title and/or --schema\n" +
              "  nota db update <id> --title \"New name\"\n" +
              "  nota db update <id> --schema '{\"Status\":{\"select\":{}}}'"
            );
            process.exit(1);
          }

          let properties: Record<string, unknown> | undefined;
          if (options.schema) {
            try {
              properties = JSON.parse(options.schema) as Record<string, unknown>;
            } catch {
              console.error("Error: --schema must be valid JSON");
              process.exit(1);
            }
          }

          const updated = await updateDatabase(databaseId, {
            title: options.title,
            properties,
          });

          if (options.json) {
            console.log(JSON.stringify(updated, null, 2));
          } else {
            const d = toNotaDatabase(updated);
            console.log(`Updated: "${d.title}" (${d.id})`);
            if (options.title) console.log(`  Title: ${d.title}`);
            if (options.schema) console.log(`  Schema updated`);
          }
        } catch (err: unknown) {
          console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      }
    )
    .addHelpText(
      "after",
      `
Getting database-id:
  Run \`nota db list\` to see database IDs (2nd column).

Examples:
  nota db update <database-id> --title "New name"
  nota db update <database-id> --schema '{"Status":{"select":{}}}'
  nota db update <database-id> --title "New" --schema '{"Done":{"checkbox":{}}}' --json`
    );

  // ── nota db sources ─────────────────────────────────────────────────────────
  db.command("sources <database-id>")
    .description(
      "List data_source_id(s) for a database_id (Notion URL ID → data_source_id)"
    )
    .option("--json", "Output as JSON")
    .action(async (databaseId: string, options: { json?: boolean }) => {
      try {
        const sources = await getDataSources(databaseId);
        if (options.json) {
          console.log(JSON.stringify(sources, null, 2));
          return;
        }
        if (sources.length === 0) {
          console.log(`No data sources found for database ${databaseId}.`);
          console.log("(This database may not be accessible via the dataSources API.)");
          return;
        }
        console.log(`Data sources for database ${databaseId}:\n`);
        for (const s of sources as DataSourceRef[]) {
          console.log(`  ${s.id}  ${s.name}`);
        }
        console.log(`\nUse the data_source_id above with:`);
        console.log(`  nota db schema <data_source_id>`);
        console.log(`  nota db query  <data_source_id>`);
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    })
    .addHelpText(
      "after",
      `
Background:
  Notion API 2025-09-03 introduced data_source_id (different from database_id).
  Notion URL IDs are database_ids; \`nota db query/schema\` may require data_source_id.
  Use this command to bridge between database_id (from URL) and data_source_id.

Getting database-id:
  From the Notion page URL: https://notion.so/<workspace>/<database-id>?v=...
  Or: nota db list --json | jq '.[].id'

Examples:
  nota db sources <database-id>         # list data_source_ids for a database
  nota db sources <database-id> --json  # JSON output for scripting

  # Typical workflow:
  nota db sources <database-id>         # get data_source_id
  nota db schema  <data_source_id>      # inspect schema
  nota db query   <data_source_id>      # query rows`
    );

  db.addHelpText(
    "after",
    `
Examples:
  # Discover accessible databases
  nota db list

  # Inspect schema before querying (shows property names and types)
  nota db schema <database-id>

  # Query all rows
  nota db query <database-id>

  # Filter rows using Notion filter JSON
  nota db query <database-id> --filter '{"property":"Status","select":{"equals":"Done"}}'

  # Sort rows
  nota db query <database-id> --sort "Date:descending"

  # Notion URL IDs are database_ids — resolve to data_source_id first
  nota db sources <database_id>            # list data_source_ids
  nota db schema  <data_source_id>         # inspect schema
  nota db query   <data_source_id>         # query rows

  # Typical AI-agent workflow
  nota db list --json | jq '.[0].id' | xargs nota db query`
  );

  // ── nota db templates ───────────────────────────────────────────────────────
  db.command("templates <database-id>")
    .description("List page templates available in a database")
    .option("--json", "Output as JSON")
    .action(async (databaseId: string, options: { json?: boolean }) => {
      try {
        const templates = await listTemplates(databaseId);

        if (options.json) {
          console.log(JSON.stringify(templates, null, 2));
          return;
        }
        if (templates.length === 0) {
          console.log("No templates found.");
          return;
        }
        for (const t of templates) {
          const def = t.isDefault ? " (default)" : "";
          console.log(`  ${t.id}  ${t.name}${def}`);
        }
        console.log(`\n  ${templates.length} template(s)`);
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    })
    .addHelpText(
      "after",
      `
Getting database-id:
  Run \`nota db list\` to see database IDs (2nd column).

Examples:
  nota db templates <database-id>         # list templates (name + id)
  nota db templates <database-id> --json  # JSON output for scripting`
    );
}
