import { Command } from "commander";
import { createPage, detectParentType } from "../api/pages";
import { loadConfig } from "../utils/config-file";
import { isStdinPiped, readStdin } from "../utils/stdin";

export function registerCreateCommand(program: Command): void {
  program
    .command("create <title>")
    .description("Create a new Notion page")
    .option("--parent <id>", "Parent page or database ID (overrides config)")
    .option("--content <markdown>", "Initial page content as Markdown text")
    .option("--json", "Output created page as JSON")
    .action(
      async (
        title: string,
        options: { parent?: string; content?: string; json?: boolean }
      ) => {
        try {
          const config = loadConfig();

          // Resolve parent ID: flag > config
          const parentId = options.parent ?? config.create?.parent;
          if (!parentId) {
            console.error(
              "Error: No parent specified.\n" +
              "  Pass --parent <id>, or set a default:\n" +
              "    nota config set create.parent <page-or-database-id>"
            );
            process.exit(1);
          }

          // Resolve parent type: stored config > auto-detect
          let parentType = config.create?.parentType;
          if (!parentType || options.parent) {
            // Always auto-detect when --parent flag is used (may differ from config)
            process.stderr.write("Detecting parent type…\r");
            parentType = await detectParentType(parentId);
            process.stderr.write("                      \r");
          }

          // Resolve content: flag > stdin pipe > none
          let content = options.content;
          if (!content && isStdinPiped()) {
            content = await readStdin();
          }

          process.stderr.write(`Creating page in ${parentType}: ${parentId}…\r`);
          const page = await createPage(title, parentId, parentType, content);
          process.stderr.write("                                              \r");

          if (options.json) {
            console.log(JSON.stringify(page, null, 2));
          } else {
            console.log(`Created: "${title}"`);
            console.log(`  ID:  ${page.id}`);
            console.log(`  URL: ${page.url}`);
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Error: ${message}`);
          process.exit(1);
        }
      }
    )
    .addHelpText(
      "after",
      `
Examples:
  # Find database / page IDs first
  nota db list
  nota list --json | jq '.[].id'

  # Create a page in a database
  nota create "Meeting notes" --parent <database-id>

  # Create with inline Markdown content
  nota create "Quick note" --parent <id> --content "## Summary\n\nKey points here."

  # Pipe a Markdown file as the initial content
  cat draft.md | nota create "My post" --parent <id>

  # Set a default parent so --parent can be omitted
  nota config set create.parent <id>
  nota config set create.parentType database
  nota create "New page"`
    );
}
