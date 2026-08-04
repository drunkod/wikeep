import { describe, expect, it } from "vitest";
import { deepwikiWikiExporter } from "../src/export/markdown/wiki/deepwikiWikiExporter";
import type { WikiPage } from "../src/shared/types";

const updatedAt = Date.UTC(2026, 7, 4, 8, 0, 0);

const page: WikiPage = {
  id: "wiki:facebook/react/1.1-structure",
  source: "deepwiki-wiki",
  kind: "page",
  owner: "facebook",
  repo: "react",
  repoFullName: "facebook/react",
  sectionPath: "1.1-structure",
  title: "Repository Structure",
  url: "https://deepwiki.com/facebook/react/1.1-structure",
  markdown: "# Repository Structure\n\nContent.",
  markdownSource: "rsc",
  contentHash: "hash",
  indexedCommit: "abc123",
  wordCount: 3,
  createdAt: updatedAt,
  updatedAt,
  lastCheckedAt: updatedAt,
  schemaVersion: 1,
};

describe("deepwikiWikiExporter", () => {
  it("matches the complete DeepWiki wiki Markdown contract", () => {
    const result = deepwikiWikiExporter.export(page);
    const savedAt = new Date(updatedAt).toLocaleString("en-US");

    expect(result).toEqual({
      filename: "wikeep-deepwiki-facebook_react-1.1-structure-2026-08-04.md",
      markdown: `# Repository Structure

- **Repository**: facebook/react
- **Source**: https://deepwiki.com/facebook/react/1.1-structure
- **Section**: 1.1-structure
- **Indexed commit**: abc123
- **Saved at**: ${savedAt}

---

# Repository Structure

Content.
`,
    });
  });
});
