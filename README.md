# nota

A CLI tool for Notion. Read, list, tree-view, edit, and cache your Notion pages from the terminal.

> *nota* — Latin, Spanish, and Italian for "note"

## Features (planned)

- `nota list` — List pages (with optional database/search filters)
- `nota show <id>` — Display page content as Markdown
- `nota tree` — Tree view of page hierarchy
- `nota edit <id>` — Edit page title or content via `$EDITOR`
- `nota delete <id>` — Archive (soft-delete) a page
- `nota cache` — Manage local JSON cache

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Language:** TypeScript
- **Notion SDK:** [@notionhq/client](https://github.com/makenotion/notion-sdk-js)
- **Markdown:** [notion-to-md](https://github.com/souvikinator/notion-to-md)
- **CLI:** [commander](https://github.com/tj/commander.js)

## Setup

```bash
# Set your Notion integration token
export NOTION_TOKEN="your-token-here"
```

## License

MIT
