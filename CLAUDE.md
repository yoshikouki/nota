# nota — Agent Instructions

Read `DESIGN.md` before implementing anything. It contains the full architecture, command design, cache schema, API mapping, and error handling policy.

## Commands

```bash
bun run src/index.ts --help   # run CLI
bun run typecheck             # type check
bun test                      # run tests
bun run build                 # compile to dist/nota binary
```

## Key decisions

- CLI framework: `commander` (not oclif)
- Cache: JSON file at `~/.cache/nota/cache.json` (XDG-compliant)
- Markdown → Notion: `@tryfabric/martian`
- `nota delete` = `pages.update({ archived: true })` (Notion has no DELETE)
- Always output errors to stderr to keep pipes clean

## Implementation order

See `DESIGN.md` → "実装優先順位" section.
