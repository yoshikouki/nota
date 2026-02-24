import { Command } from "commander";
import {
  type QueryFilter,
  getDatabaseSchema,
  queryDatabase,
  searchDatabases,
  toNotaDatabase,
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
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

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
          console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      }
    );
}
