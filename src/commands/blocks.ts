import { Command } from "commander";
import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import {
  fetchTopLevelBlocks,
  retrieveBlock,
  deleteBlock,
  updateBlockText,
  appendBlocks,
} from "../api/blocks";
import { markdownToNotionBlocks } from "../render/markdown";
import { isStdinPiped, readStdin } from "../utils/stdin";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Extract a short text preview from a block for display. */
function blockPreview(block: BlockObjectResponse): string {
  const b = block as Record<string, unknown>;
  const inner = b[block.type] as Record<string, unknown> | undefined;
  if (!inner) return "";

  // rich_text-based blocks
  const richText = inner["rich_text"];
  if (Array.isArray(richText)) {
    return richText
      .map((t: unknown) => {
        const item = t as Record<string, unknown>;
        const textObj = item["text"] as Record<string, unknown> | undefined;
        return typeof textObj?.["content"] === "string" ? textObj["content"] : "";
      })
      .join("")
      .slice(0, 60);
  }

  // title-based (child_page, child_database)
  const title = inner["title"];
  if (typeof title === "string") return title.slice(0, 60);

  return "";
}

// ── register ──────────────────────────────────────────────────────────────────

export function registerBlocksCommand(program: Command): void {
  const blocks = program
    .command("blocks")
    .description("Block-level operations")
    .addHelpText(
      "after",
      `
Getting page-id:
  nota list --json | jq '.[] | {id, title}'

Getting block-id:
  nota blocks list <page-id>   # shows block IDs (3rd column)

Subcommands:
  nota blocks list <page-id>                  # list top-level blocks
  nota blocks get  <block-id>                 # retrieve block JSON
  nota blocks append <page-id> --content "…" # append Markdown blocks
  nota blocks update <block-id> --content "…" # update block text
  nota blocks delete <block-id>               # delete block (permanent)`
    );

  // ── nota blocks list ────────────────────────────────────────────────────────
  blocks
    .command("list <page-id>")
    .description("List top-level blocks of a page")
    .option("--json", "Output as JSON array")
    .action(async (pageId: string, options: { json?: boolean }) => {
      try {
        const list = await fetchTopLevelBlocks(pageId);
        if (options.json) {
          console.log(JSON.stringify(list, null, 2));
          return;
        }
        if (list.length === 0) {
          console.log("(no blocks)");
          return;
        }
        list.forEach((b, i) => {
          const idx = String(i + 1).padStart(3);
          const type = b.type.padEnd(24);
          const id = b.id;
          const preview = blockPreview(b);
          const suffix = preview ? `  ${preview.replace(/\n/g, " ")}` : "";
          console.log(`${idx}  ${type}  ${id}${suffix}`);
        });
        console.log(`\n  ${list.length} block(s)`);
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
  nota blocks list <page-id>            # list blocks (shows block-ids)
  nota blocks list <page-id> --json     # raw JSON for scripting
  nota blocks list <page-id> --json | jq '.[].id'  # extract block IDs`
    );

  // ── nota blocks get ─────────────────────────────────────────────────────────
  blocks
    .command("get <block-id>")
    .description("Retrieve a single block as JSON")
    .action(async (blockId: string) => {
      try {
        const block = await retrieveBlock(blockId);
        console.log(JSON.stringify(block, null, 2));
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    })
    .addHelpText(
      "after",
      `
Getting block-id:
  nota blocks list <page-id>   # shows block IDs (3rd column)

Examples:
  nota blocks get <block-id>            # retrieve full block JSON
  nota blocks get <block-id> | jq '.type'  # extract block type`
    );

  // ── nota blocks delete ──────────────────────────────────────────────────────
  blocks
    .command("delete <block-id>")
    .description("Delete a block (permanent)")
    .option("--force", "Skip confirmation")
    .action(async (blockId: string, options: { force?: boolean }) => {
      try {
        if (!options.force) {
          // Peek at the block to show what will be deleted
          const block = await retrieveBlock(blockId);
          const preview = blockPreview(block);
          const label = preview ? `"${preview.slice(0, 50)}"` : `[${block.type}]`;
          process.stdout.write(`Delete block ${label} (${blockId})? [y/N] `);

          const { createInterface } = await import("node:readline");
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const answer = await new Promise<string>((resolve) => {
            rl.question("", resolve);
          });
          rl.close();

          if (answer.trim().toLowerCase() !== "y") {
            console.log("Cancelled.");
            return;
          }
        }

        await deleteBlock(blockId);
        console.log(`Deleted: ${blockId}`);
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    })
    .addHelpText(
      "after",
      `
Getting block-id:
  nota blocks list <page-id>   # shows block IDs (3rd column)

Examples:
  nota blocks delete <block-id>          # interactive confirmation
  nota blocks delete <block-id> --force  # skip confirmation (for scripting)`
    );

  // ── nota blocks update ──────────────────────────────────────────────────────
  blocks
    .command("update <block-id>")
    .description("Update the text content of a block (stdin or --content)")
    .option("--content <text>", "New text content")
    .option("--json", "Output updated block as JSON")
    .action(
      async (blockId: string, options: { content?: string; json?: boolean }) => {
        try {
          let text = options.content;
          if (!text && isStdinPiped()) {
            text = (await readStdin()).trimEnd();
          }
          if (!text) {
            console.error(
              "Error: provide text via --content or stdin\n" +
              "  nota blocks update <id> --content \"new text\"\n" +
              "  echo \"new text\" | nota blocks update <id>"
            );
            process.exit(1);
          }

          const updated = await updateBlockText(blockId, text);
          if (options.json) {
            console.log(JSON.stringify(updated, null, 2));
          } else {
            console.log(`Updated: ${blockId}`);
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
Getting block-id:
  nota blocks list <page-id>   # shows block IDs (3rd column)

Examples:
  nota blocks update <block-id> --content "new text"
  echo "new text" | nota blocks update <block-id>
  nota blocks update <block-id> --content "edited" --json  # return updated block`
    );

  // ── nota blocks append ──────────────────────────────────────────────────────
  blocks
    .command("append <page-id>")
    .description("Append Markdown blocks to a page (stdin or --content)")
    .option("--content <markdown>", "Markdown text to append")
    .action(async (pageId: string, options: { content?: string }) => {
      try {
        let markdown = options.content;
        if (!markdown && isStdinPiped()) {
          markdown = (await readStdin()).trimEnd();
        }
        if (!markdown) {
          console.error(
            "Error: provide markdown via --content or stdin\n" +
            "  nota blocks append <id> --content \"# heading\"\n" +
            "  cat file.md | nota blocks append <id>"
          );
          process.exit(1);
        }

        const newBlocks = markdownToNotionBlocks(markdown);
        if (newBlocks.length === 0) {
          console.error("Error: could not parse any blocks from the input.");
          process.exit(1);
        }

        await appendBlocks(pageId, newBlocks);
        console.log(`Appended ${newBlocks.length} block(s) to ${pageId}`);
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
  nota blocks append <page-id> --content "# New Section"
  cat file.md | nota blocks append <page-id>
  echo "- item 1\n- item 2" | nota blocks append <page-id>`
    );
}
