import { Command } from "commander";
import { detectParentType, movePage, toNotaPage } from "../api/pages";

export function registerMoveCommand(program: Command): void {
  program
    .command("move <page-id>")
    .description("Move a page to a different parent")
    .requiredOption("--parent <id>", "New parent page or database ID")
    .option("--json", "Output moved page as JSON")
    .action(
      async (pageId: string, options: { parent: string; json?: boolean }) => {
        try {
          process.stderr.write("Detecting parent type…\r");
          const parentType = await detectParentType(options.parent);
          process.stderr.write("                      \r");

          process.stderr.write(`Moving page to ${parentType}: ${options.parent}…\r`);
          const res = await movePage(pageId, options.parent, parentType);
          process.stderr.write("                                                    \r");

          if (options.json) {
            console.log(JSON.stringify(res, null, 2));
          } else {
            const page = toNotaPage(res);
            console.log(`Moved: "${page.title}"`);
            console.log(`  New parent: ${options.parent} (${parentType})`);
            console.log(`  URL: ${page.url}`);
          }
        } catch (err: unknown) {
          console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      }
    );
}
