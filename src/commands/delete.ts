import { Command } from "commander";
import { fetchPageRaw, toNotaPage } from "../api/pages";
import { archivePage } from "../api/blocks";
import { invalidatePage } from "../cache/store";

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

export function registerDeleteCommand(program: Command): void {
  program
    .command("delete <page-id>")
    .description("Archive (soft-delete) a Notion page")
    .option("--force", "Skip confirmation prompt")
    .action(async (pageId: string, options: DeleteOptions) => {
      try {
        // Fetch page info to show a human-readable name in the prompt
        const rawPage = await fetchPageRaw(pageId);
        const page = toNotaPage(rawPage);

        if (!options.force) {
          const ok = await confirm(
            `Archive "${page.title}" (${page.id})?\n  ${page.url}\nProceed?`
          );
          if (!ok) {
            console.log("Cancelled.");
            return;
          }
        }

        await archivePage(pageId);
        invalidatePage(pageId);

        console.log(`Archived: "${page.title}" (${page.id})`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });
}
