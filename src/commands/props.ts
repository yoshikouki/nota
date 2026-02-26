import { Command } from "commander";
import { fetchPageRaw, getPageProperty, toNotaPage } from "../api/pages";
import { parseNotionUrl } from "../utils/parseNotionUrl";

export function registerPropsCommand(program: Command): void {
  const props = program
    .command("props")
    .description("Page property operations")
    .addHelpText(
      "after",
      `
Getting page-id:
  nota list --json | jq '.[] | {id, title}'

Getting property-id:
  nota props list <page-id>   # shows property IDs and types

Examples:
  nota props list <page-id>                     # list all properties with IDs
  nota props get  <page-id> <property-id>       # retrieve property value as JSON`
    );

  // ── nota props list <page-id> ──────────────────────────────────────────────
  props
    .command("list <page-id>")
    .description("List all properties of a page")
    .action(async (pageId: string) => {
      try {
        pageId = parseNotionUrl(pageId);
        const raw = await fetchPageRaw(pageId);
        const page = toNotaPage(raw);
        console.log(`Page: ${page.title} (${page.id})`);
        console.log("\nProperties:");

        const nameWidth = Math.max(
          ...Object.keys(raw.properties).map((k) => k.length),
          4
        );
        for (const [name, prop] of Object.entries(raw.properties)) {
          const p = prop as { type: string; id: string };
          console.log(`  ${name.padEnd(nameWidth)}  type=${p.type}  id=${p.id}`);
        }
        console.log(
          "\nTo retrieve a property value:\n" +
          `  nota props get ${pageId} <property-id>`
        );
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    })
    .addHelpText(
      "after",
      `
Getting page-id:
  nota list --json | jq '.[] | {id, title}'

Examples:
  nota props list <page-id>   # shows property name, type, and property-id`
    );

  // ── nota props get <page-id> <property-id> ────────────────────────────────
  props
    .command("get <page-id> <property-id>")
    .description(
      "Retrieve a page property value (handles paginated results for relations etc.)"
    )
    .action(async (pageId: string, propertyId: string) => {
      try {
        pageId = parseNotionUrl(pageId);
        const value = await getPageProperty(pageId, propertyId);
        console.log(JSON.stringify(value, null, 2));
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    })
    .addHelpText(
      "after",
      `
Getting page-id:
  nota list --json | jq '.[] | {id, title}'

Getting property-id:
  nota props list <page-id>   # shows property IDs in "id=<property-id>" column

Examples:
  nota props get <page-id> <property-id>        # retrieve property value as JSON
  nota props get <page-id> <property-id> | jq . # pretty-print value`
    );
}
