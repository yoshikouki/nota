import { Command } from "commander";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fetchPageRaw, toNotaPage } from "../api/pages";
import { getClient } from "../api/client";
import { updatePageTitle } from "../api/blocks";
import { invalidatePage } from "../cache/store";
import { isStdinPiped, readStdin } from "../utils/stdin";
import { parseNotionUrl } from "../utils/parseNotionUrl";

interface EditOptions {
  title?: string;
  editor?: boolean;
  append?: boolean;
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

/**
 * Build an ellipsis-based content_range that covers the full markdown content.
 * Used with replace_content_range to replace the entire page content.
 *
 * Format: "firstLine...lastLine" (or just "singleLine" for single-line content)
 */
function buildFullContentRange(markdown: string): string {
  const lines = markdown.trimEnd().split("\n");
  const firstLine = lines[0] ?? "";
  const lastLine = lines[lines.length - 1] ?? "";
  if (firstLine === lastLine) return firstLine;
  return `${firstLine}...${lastLine}`;
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
    .option("--append", "Append piped content instead of replacing")
    .action(async (pageId: string, options: EditOptions) => {
      try {
        pageId = parseNotionUrl(pageId);
        const stdinPiped = isStdinPiped();

        if (!options.title && !options.editor && !stdinPiped) {
          console.error(
            "Error: specify --title <title>, --editor, or pipe content via stdin\n" +
            "  nota edit <id> --title \"New title\"\n" +
            "  nota edit <id> --editor\n" +
            "  cat file.md | nota edit <id>\n" +
            "  cat file.md | nota edit <id> --append"
          );
          process.exit(1);
        }

        const client = getClient();

        // ── stdin pipe flow ────────────────────────────────────────────
        if (stdinPiped && !options.editor) {
          const markdown = await readStdin();
          if (!markdown.trim()) {
            console.error("Error: stdin is empty.");
            process.exit(1);
          }

          if (options.append) {
            // Append to end of page using insert_content without `after`
            process.stderr.write(`Appending content…\n`);
            await client.pages.updateMarkdown({
              page_id: pageId,
              type: "insert_content",
              insert_content: { content: markdown.trimEnd() },
            });
          } else {
            // Replace entire page content
            process.stderr.write(`Replacing content…\n`);
            const current = await client.pages.retrieveMarkdown({ page_id: pageId });
            const currentTrimmed = current.markdown.trim();

            if (!currentTrimmed) {
              // Empty page: use insert_content
              await client.pages.updateMarkdown({
                page_id: pageId,
                type: "insert_content",
                insert_content: { content: markdown.trimEnd() },
              });
            } else {
              // Non-empty page: replace full content range
              await client.pages.updateMarkdown({
                page_id: pageId,
                type: "replace_content_range",
                replace_content_range: {
                  content: markdown.trimEnd(),
                  content_range: buildFullContentRange(currentTrimmed),
                  allow_deleting_content: true,
                },
              });
            }
          }
          invalidatePage(pageId);
          console.log(`Page updated.`);
          return;
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

          // Get current markdown via Markdown Content API
          const response = await client.pages.retrieveMarkdown({ page_id: pageId });
          const currentMarkdown = response.markdown;

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

            // Replace page content via Markdown Content API
            process.stderr.write(`Replacing content…\n`);
            const currentTrimmed = originalBody.trim();

            if (!currentTrimmed) {
              // Empty page: use insert_content
              await client.pages.updateMarkdown({
                page_id: pageId,
                type: "insert_content",
                insert_content: { content: editorBody },
              });
            } else {
              // Non-empty page: replace full content range
              await client.pages.updateMarkdown({
                page_id: pageId,
                type: "replace_content_range",
                replace_content_range: {
                  content: editorBody,
                  content_range: buildFullContentRange(currentTrimmed),
                  allow_deleting_content: true,
                },
              });
            }

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
    })
    .addHelpText(
      "after",
      `
Environment:
  NOTION_TOKEN=secret_xxxx  Required. See \`nota --help\` Setup section for details.

Getting page-id:
  Run \`nota list\` to see page IDs (3rd column), or:
    nota list --json | jq '.[] | {id, title}'

Examples:
  # Open current content in \$EDITOR, save on exit to replace
  nota edit <page-id> --editor

  # Replace entire content via stdin (pipe a Markdown file)
  cat updated.md | nota edit <page-id>

  # Append to existing content instead of replacing
  cat addendum.md | nota edit <page-id> --append

  # Update only the title
  nota edit <page-id> --title "New title"`
    );
}
