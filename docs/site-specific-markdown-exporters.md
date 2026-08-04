# Site-specific Markdown exporters

## Goal

DeepWiki and Devin have different capture mechanisms and evolve independently.
Their Markdown exports must therefore have separate policy owners, while stable
low-level Markdown mechanics remain shared.

This architecture covers both session exports and wiki-page exports.

## Source identity

Sessions persist an explicit source:

```ts
export type ConversationSource = "deepwiki" | "devin";
```

`CapturePayload.source` is set at the capture boundary:

- the DeepWiki API and DOM fallback set `"deepwiki"`;
- the authenticated Devin API + rendered transcript path sets `"devin"`.

Legacy records without a source are migrated from their URL host. The
conversation schema is version 4. Existing conversation IDs keep the historical
`deepwiki:` prefix in this refactor because changing IDs also requires rewriting
all message foreign keys in one IndexedDB transaction.

Wiki pages already persist explicit source identity:

```ts
"deepwiki-wiki" | "devin-wiki"
```

No IndexedDB version bump or new source index is required.

## Export modules

```text
src/export/markdown/
├── shared.ts
├── session/
│   ├── deepwikiSessionExporter.ts
│   ├── devinSessionExporter.ts
│   └── index.ts
└── wiki/
    ├── deepwikiWikiExporter.ts
    ├── devinWikiExporter.ts
    └── index.ts
```

`shared.ts` owns only platform-neutral mechanics:

- filename sanitization;
- role headings and separators;
- saved-date formatting;
- citation deduplication/rendering;
- common session/wiki layout;
- the exporter interfaces and result type.

The site modules own policy. Background handlers call only the registries:

```ts
exportSessionMarkdown(conversation, messages)
exportWikiMarkdown(page)
```

They do not infer a site from a URL and do not know filename or metadata rules.

## Current site policies

### DeepWiki sessions

- filename prefix: `wikeep-deepwiki-session-`;
- explicit `Platform: DeepWiki` metadata;
- API citation blocks are rendered and deduplicated.

### Devin sessions

- filename prefix: `wikeep-devin-session-`;
- explicit `Platform: Devin` metadata;
- rendered fenced code remains unchanged;
- a defensive exporter rule removes legacy raw `<details>` blocks containing a
  Devin Thinking-process trace. The primary omission still happens during Devin
  DOM capture.

### DeepWiki wiki pages

- filename prefix: `wikeep-deepwiki-`;
- DeepWiki section slug remains the filename discriminator;
- indexed commit metadata remains present;
- RSC versus rendered-DOM capture source is explicit.

### Devin wiki pages

- filename prefix: `wikeep-devin-`;
- page title and numeric section path remain in the filename;
- branch is read from the Devin URL query;
- React-fiber versus rendered-DOM capture source is explicit.

## Safe startup migration

`pruneLegacyConversationData()` is idempotent and conversation-only:

- it updates only records older than the current conversation schema;
- it never opens, clears, or rewrites the messages store;
- it is safe when the Manifest V3 service worker starts repeatedly.

This corrects the previous behavior that cleared all saved session messages on
routine worker initialization.

## Tests

Golden tests lock complete Markdown output separately for each site:

```text
tests/deepwikiSessionExporter.test.ts
tests/devinSessionExporter.test.ts
tests/deepwikiWikiExporter.test.ts
tests/devinWikiExporter.test.ts
tests/markdownExporterRegistry.test.ts
tests/conversationSourceMigration.test.ts
```

A policy update should modify only its site exporter and its corresponding
golden fixture. The registry test ensures every persisted source has exactly one
exporter.

## Verification

```bash
nix develop -c npx vitest run \
  tests/conversationSourceMigration.test.ts \
  tests/conversationMapper.test.ts \
  tests/conversationRepository.test.ts \
  tests/deepwikiApi.test.ts \
  tests/deepwikiSessionExporter.test.ts \
  tests/devinSessionExporter.test.ts \
  tests/deepwikiWikiExporter.test.ts \
  tests/devinWikiExporter.test.ts \
  tests/markdownExporterRegistry.test.ts
nix develop -c npm run typecheck
nix develop -c npm run build
```
