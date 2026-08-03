# Step 8 — Preserve Mermaid diagrams (React-fiber source)

## Symptom

Saved Devin pages or full wikis showed:

```text
📊 Diagram omitted — view it on the source page
```

instead of fenced ` ```mermaid ` source. DeepWiki full-wiki saves did not have
this problem because DeepWiki exposes its original Markdown through the RSC
stream.

## Root cause

Devin renders Mermaid as inline `<svg class="flowchart">`; the **original
Markdown source is not in the DOM**. It lives in the page's React props. The
content script runs in an **isolated world**, which cannot read React fiber
expandos attached by the page, so DOM→Turndown conversion can only replace the
rendered SVG with a placeholder.

The first implementation added a MAIN-world probe but was too narrow: it chose
the first `.prose-main`, walked only the direct ancestor chain, and inspected a
small list of direct prop values. Devin can keep hidden routes mounted and can
nest the page source several objects deep, so some full-wiki sections returned
`null` and silently fell back to lossy DOM conversion.

## Fix — hardened MAIN-world Markdown probe

| File | Change |
|---|---|
| `src/content/devinFiberMarkdown.ts` | Selects the visible article, finds the nearest React fiber expando, recursively inspects nested props, and performs a bounded ancestor/subtree traversal. Candidates must match the visible `h1`; the longest matching page source wins. |
| `src/content/devinSourceProbe.ts` | Thin MAIN-world request listener that calls `extractDevinPageMarkdown(document)` and posts the Markdown back to the isolated content script. |
| `src/content/probe.ts` | Correlates requests by ID and URL. A `null` response is retried briefly while a newly selected SPA section finishes committing; a complete timeout stops immediately. |
| `scripts/build.mjs` | Builds `dist/devinSourceProbe.js` as an IIFE. |
| `public/manifest.json` | Injects `devinSourceProbe.js` with `world: "MAIN"` on `app.devin.ai/org/*/wiki/*`. |
| `src/parser/deepwikiWikiParser.ts` | A supplied fiber Markdown string wins over RSC and DOM conversion and produces `markdownSource: "fiber"`. |
| `src/parser/devinWikiParser.ts` | Requests original Markdown for every full-wiki section. The full snapshot is marked `fiber` only when **all** saved sections came from fiber; mixed snapshots are marked `dom` so a hidden placeholder is not mislabeled as rich source. |
| `src/storage/pageRepository.ts` | Treats `rsc` and `fiber` as rich sources and prevents a later lossy DOM snapshot from overwriting them. |

## Why a MAIN-world probe is required

Content scripts get a separate JavaScript context. React's `__reactFiber$…`
expandos are visible only to code running in the page's MAIN world. This is the
same reason DeepWiki uses `pageWorldProbe.js` for `window.__next_f`.

## Automated verification

```bash
nix develop -c npx vitest run \
  tests/devinFiberMarkdown.test.ts \
  tests/devinWikiParser.test.ts \
  tests/wikiUrl.test.ts
nix develop -c npm run typecheck
nix develop -c npm run build
```

The regression tests cover nested props, bounded fiber traversal, hidden cached
routes, exact heading selection, `/page/10` and `/page/9.2` URLs, full-wiki
Mermaid preservation, and mixed fiber/DOM source reporting.

## Manual verification

1. Build and reload the unpacked extension.
2. Hard-reload the Devin wiki tab so both `content.js` and the MAIN-world probe
   are reinjected.
3. Delete or refresh the previously saved lossy full-wiki record.
4. Save the full wiki again and export its Markdown.

Expected result:

- Markdown contains ` ```mermaid ` blocks.
- It does not contain `Diagram omitted` for diagram sections.
- A fully rich save reports `markdownSource: "fiber"`.
- `hasDiagrams` is `true`.
