# Step 10 — Save complete Devin sessions (`app.devin.ai/search/*`)

## Goal

Capture the complete visible conversation on `app.devin.ai/search/<queryId>`:

- every user request,
- every assistant answer,
- Markdown structure,
- fenced code examples,
- repository metadata and source citations.

The capture correction remains limited to **Devin sessions**. A later exporter
refactor gives Devin and DeepWiki separate Markdown policy modules without
changing the session capture algorithm described here.

## Findings

- The page loads session metadata from
  **`https://app.devin.ai/api/ada/query/<queryId>`**.
- The endpoint is authenticated and needs `Authorization: Bearer <token>` and,
  when available, `x-cog-org-id: <orgId>` from the page's `localStorage`.
- The response resembles `DeepWikiQuerySession`, but it is **not always a
  complete rendering transcript**. The current Devin UI can display a finished
  assistant answer even when that answer is absent from the API events handled
  as `type: "chunk"`.
- The original implementation trusted the API snapshot completely. On “Save
  again”, `upsertCapturedSession` correctly replaced the old message set with
  the new snapshot, but the new snapshot could contain the follow-up user
  request without its visible assistant answer.
- Rendered assistant HTML is the reliable fallback for what the user actually
  sees. Converting that HTML with the existing Turndown/GFM converter preserves
  headings, lists, inline code, tables, and `<pre><code>` blocks as fenced
  Markdown.

## Corrected capture architecture

| File | Responsibility |
|---|---|
| `src/api/deepwikiApi.ts` | Fetch the authenticated Devin session and build a snapshot explicitly tagged with `source: "devin"`. The API remains authoritative for title, stable message IDs, repositories, citations, response metadata, and pending state. |
| `src/parser/devinSessionDomParser.ts` | Match rendered turns to API user requests, extract the visible assistant answer, remove controls and the collapsed Thinking-process UI, convert rendered HTML to Markdown, include missing `<pre><code>` blocks, and merge the richer answer with API metadata. |
| `src/content/index.ts` | Enrich only Devin session snapshots before `CAPTURE_DOM_SNAPSHOT`. If a finished query still has no captured assistant answer, do not overwrite the saved transcript; ask the user to reload and save again. |
| `src/parser/htmlToMarkdown.ts` | Existing converter used unchanged. Its fenced-code rule preserves code examples and language identifiers. |
| `src/storage/conversationRepository.ts` | Existing replacement semantics receive a complete Devin snapshot instead of an API-only partial snapshot. Startup migration is now idempotent and never clears messages. |
| `src/export/markdown/session/devinSessionExporter.ts` | Owns Devin Markdown policy, filename prefix, platform metadata, fenced-code pass-through, and defensive removal of legacy raw Thinking-process `<details>` blocks. |
| `src/export/markdown/session/index.ts` | Dispatches by persisted `Conversation.source`; it never infers the site from a URL. |

See [`../site-specific-markdown-exporters.md`](../site-specific-markdown-exporters.md)
for the complete exporter architecture and DeepWiki isolation rules.

## Why API + DOM instead of DOM only

The API provides durable identity and metadata that the rendered page may not
expose consistently. The DOM provides the final content visible to the user.
Merging the two keeps stable IDs/citations while ensuring that the saved session
matches the screen.

The API answer is retained when it is richer. The DOM answer wins when it:

- supplies an answer missing from the API,
- contains fenced code that the API answer lacks,
- contains the complete API text plus additional rendered content, or
- is otherwise the longer complete representation.

## Safety against destructive recapture

A finished Devin query is expected to have one saved assistant answer. If the
API omits it and the DOM has not rendered a capturable answer yet, capture stops
before persistence. This matters because session persistence intentionally
replaces the previous message set on each recapture; refusing an incomplete
finished snapshot preserves the previously saved complete record.

Pending sessions continue through the existing polling flow and are retried as
the answer renders.

## Automated verification

```bash
nix develop -c npx vitest run \
  tests/deepwikiApi.test.ts \
  tests/devinSessionDomParser.test.ts \
  tests/devinSessionExporter.test.ts \
  tests/conversationSourceMigration.test.ts \
  tests/conversationRepository.test.ts
nix develop -c npm run typecheck
nix develop -c npm run build
```

The regression tests cover:

- an API snapshot containing only the user request,
- recovery of the visible assistant answer,
- fenced TypeScript/Bash code preservation,
- code displayed beside the prose answer,
- multiple-turn alignment by user text,
- retention of API citations and message IDs,
- removal of stray control characters,
- refusal to invent or silently save a missing finished answer,
- Devin-specific export routing and Thinking-process defense.

## Manual verification

1. Build and reload the unpacked extension.
2. Hard-reload the `app.devin.ai/search/...` tab so the new content script is
   injected.
3. Wait until the assistant answer is fully visible.
4. Click **Save again**.
5. Export the session Markdown.

Expected result:

- each user request is followed by its assistant answer,
- headings and lists remain Markdown,
- visible code examples appear inside fenced code blocks,
- the exported file includes `Platform: Devin`,
- the exported file no longer ends after the user's follow-up request,
- collapsed Thinking-process/tool-trace content is not exported.
