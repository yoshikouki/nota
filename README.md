# nota

A Notion CLI built on [Bun](https://bun.sh). Reads your Notion pages directly — no sync, no lag, no middleman.

> *nota* — Latin, Spanish, and Italian for "note"

---

## Why

The typical pattern for using Notion data in scripts is: sync pages to git → read local files. It works until it doesn't. Sync jobs fail silently. Files go stale. The lag between writing and reading is unpredictable.

`nota` talks to the Notion API directly. When you run `nota show <id>`, you get the page. When you run `nota list`, you get your most recently edited pages. The local cache makes repeated reads fast; the API makes truth authoritative.

---

## Features

```
nota list [--search <query>] [--sort edited|created|none] [--json] [--cache]
nota show <page-id> [--cache] [--raw]
nota tree [--root <page-id>] [--depth <n>] [--cache]
nota create <title> [--parent <id>] [--content <markdown>] [--json]
nota edit <page-id> [--title <new-title>] [--editor] [--append]
nota delete <page-id> [--force]
nota blocks list <page-id> [--json]
nota blocks get <block-id>
nota blocks update <block-id> [--content <text>] [--json]
nota blocks delete <block-id> [--force]
nota blocks append <page-id> [--content <markdown>]
nota stats [--no-api]
nota cache status
nota cache clear [--force] [--page <id>]
nota config show
nota config set <key> <value>
nota config unset <key>
```

---

## Install

```bash
brew install yoshikouki/tap/nota
```

Then set your Notion API token:

```bash
export NOTION_TOKEN="secret_..."
# or add to ~/.zshenv / ~/.zshrc / ~/.bashrc
```

Get a token at: https://www.notion.so/my-integrations

### From source (Bun required)

```bash
git clone https://github.com/yoshikouki/nota
cd nota
bun install
ln -s $(pwd)/src/index.ts ~/.local/bin/nota
```

---

## Usage

```bash
# List your 10 most recently edited pages
nota list

# Search and return JSON (pipe-friendly)
nota list --search "project" --json

# Show a page as Markdown
nota show abc123def456

# Tree view from a root page
nota tree --root abc123def456 --depth 3

# Cache makes repeated reads ~15× faster
nota list --cache
nota show abc123def456 --cache

# Update a page title
nota edit abc123def456 --title "New title"

# Edit page content in $EDITOR (opens current content as Markdown)
nota edit abc123def456 --editor

# Replace or append page content via stdin
cat new-content.md | nota edit abc123def456           # replace all blocks
cat appendix.md    | nota edit abc123def456 --append  # append to existing

# Create a new page (parent required)
nota create "Today's notes" --parent <page-or-database-id>
nota create "Meeting memo" --parent <id> --content "## Agenda\n- item 1"
cat draft.md | nota create "Today's notes" --parent <id>  # stdin as content

# Set a default parent so you can omit --parent
nota config set create.parent <page-or-database-id>
nota config set create.parentType page   # or: database
nota create "Quick note"                 # uses default parent

# Archive (soft-delete) a page
nota delete abc123def456
nota delete abc123def456 --force  # skip confirmation

# Block-level operations
nota blocks list abc123def456                       # list blocks with IDs and types
nota blocks get <block-id>                          # retrieve single block as JSON
echo "updated text" | nota blocks update <block-id> # update block text
nota blocks delete <block-id> --force               # delete a single block
cat appendix.md | nota blocks append abc123def456   # append markdown blocks

# API status, cache breakdown, and page analytics
nota stats
nota stats --no-api  # skip connectivity check

# Manage config
nota config show
nota config set cache.enabled true
nota config set list.sort edited
nota config set list.database <database-id>
nota config unset list.database
nota config set create.parent <page-or-database-id>
nota config set create.parentType page   # or: database (skip auto-detect)
nota config unset create.parent
```

---

## Cache design

`nota` caches raw Notion SDK responses — not the converted Markdown or any application-specific type. The cache is a snapshot of what the API returned.

This matters for longevity: if rendering logic changes, or a new field is needed, the cache stays valid and can be re-processed from the stored raw response. The cache doesn't need to be invalidated every time the tool evolves.

Cache lives at `~/.cache/nota/` (XDG-compliant), split by request type:

```
~/.cache/nota/
  pages/<page_id>.json     # pages.retrieve() response
  blocks/<page_id>.json    # blocks.children.list() response (recursive)
  searches/<hash>.json     # search(query, sort) response
```

TTL: 5 minutes for pages/blocks, 1 minute for searches. Pass `--cache` to serve stale data immediately and revalidate in the background.

---

## Tech stack

- **Runtime:** Bun
- **Language:** TypeScript
- **Notion SDK:** [@notionhq/client](https://github.com/makenotion/notion-sdk-js)
- **Markdown conversion:** [notion-to-md](https://github.com/souvikinator/notion-to-md) + [@tryfabric/martian](https://github.com/tryfabric/martian)
- **CLI framework:** [commander](https://github.com/tj/commander.js)

`commander` over `oclif` because `bun build --compile` produces a single self-contained binary and oclif's plugin machinery assumes Node. The goal is a brew-installable binary; the shortest path is the right one.

---

## Status

**Read features:** done  
**Write features:** done (`nota create`, `nota edit`, `nota delete`, `nota blocks list/get/update/delete/append`)  
**Brew distribution:** done (`brew install yoshikouki/tap/nota`)

---

## License

MIT
