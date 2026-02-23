import { Command } from "commander";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fetchPageRaw, toNotaPage } from "../api/pages";
import { fetchPageMarkdown } from "../api/content";
import { updatePageTitle, clearPageBlocks, appendBlocks } from "../api/blocks";
import { markdownToNotionBlocks } from "../render/markdown";
import { invalidatePage } from "../cache/store";

interface EditOptions {
  title?: string;
  editor?: boolean;
}

function openEditor(filePath: string): void {
  const editor = process.env.EDITOR ?? process.env.VISUAL ?? "vi";
  // spawnSync blocks until the editor process exits
  const proc = Bun.spawnSync([editor, filePath], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`Editor exited with code ${proc.exitCode}`);
  }
}

export function registerEditCommand(program: Command): void {
  program
    .command("edit <page-id>")
    .description("Edit a page title or content")
    .option("--title <title>", "Update the page title")
    .option(
      "--editor",
      "Open $EDITOR with the current page content; save to replace"
    )
    .action(async (pageId: string, options: EditOptions) => {
      try {
        if (!options.title && !options.editor) {
          console.error(
            "Error: specify --title <title> and/or --editor"
          );
          process.exit(1);
        }

        // ── title update ───────────────────────────────────────────────
        if (options.title) {
          process.stderr.write(`Updating title…\n`);
          await updatePageTitle(pageId, options.title);
          invalidatePage(pageId);
          console.log(`Title updated: "${options.title}"`);
        }

        // ── editor flow ────────────────────────────────────────────────
        if (options.editor) {
          process.stderr.write(`Fetching current page content…\n`);

          // Fetch page metadata for a helpful header comment
          const rawPage = await fetchPageRaw(pageId);
          const page = toNotaPage(rawPage);

          // Get current markdown
          const { markdown: currentMarkdown } = await fetchPageMarkdown(pageId);

          // Write to temp file
          const tmpDir = tmpdir();
          mkdirSync(tmpDir, { recursive: true });
          const tmpFile = join(
            tmpDir,
            `nota-edit-${pageId}-${Date.now()}.md`
          );
          const header = `<!-- nota: editing "${page.title}" (${page.id}) -->\n<!-- Delete all content to cancel -->\n\n`;
          writeFileSync(tmpFile, header + currentMarkdown, "utf-8");

          try {
            openEditor(tmpFile);

            const edited = readFileSync(tmpFile, "utf-8");

            // Strip the header comments before comparing
            const editorBody = edited
              .replace(/^<!--[\s\S]*?-->\n*/g, "")
              .trimEnd();
            const originalBody = currentMarkdown.trimEnd();

            if (editorBody === originalBody) {
              console.log("No changes detected. Page unchanged.");
              return;
            }

            if (!editorBody.trim()) {
              console.error(
                "Error: content is empty. Page unchanged. (To clear all content, use `nota edit --clear` — not yet implemented)"
              );
              process.exit(1);
            }

            // Convert Markdown → Notion blocks
            const blocks = markdownToNotionBlocks(editorBody);
            if (blocks.length === 0) {
              console.error("Error: could not parse any blocks from the edited content.");
              process.exit(1);
            }

            // Replace page content
            process.stderr.write(
              `Replacing content (${blocks.length} blocks)…\n`
            );
            await clearPageBlocks(pageId);
            await appendBlocks(pageId, blocks);

            // Invalidate cache so next `nota show` re-fetches
            invalidatePage(pageId);

            console.log(`Page updated: ${page.url}`);
          } finally {
            try {
              unlinkSync(tmpFile);
            } catch {
              // ignore cleanup failure
            }
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });
}
