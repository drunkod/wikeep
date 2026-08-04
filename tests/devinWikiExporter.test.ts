import { describe, expect, it } from "vitest";
import { devinWikiExporter } from "../src/export/markdown/wiki/devinWikiExporter";
import type { WikiPage } from "../src/shared/types";

const updatedAt = Date.UTC(2026, 7, 4, 8, 0, 0);

const page: WikiPage = {
  id: "wiki:devin:drunkod/repo-harness/9.2",
  source: "devin-wiki",
  kind: "page",
  owner: "drunkod",
  repo: "repo-harness",
  repoFullName: "drunkod/repo-harness",
  sectionPath: "9.2",
  title: "Architecture Diagrams",
  url: "https://app.devin.ai/org/example/wiki/drunkod/repo-harness/page/9.2?branch=main",
  markdown: "# Architecture Diagrams\n\n```mermaid\ngraph TD\nA --> B\n```",
  markdownSource: "fiber",
  contentHash: "hash",
  hasDiagrams: true,
  wordCount: 8,
  createdAt: updatedAt,
  updatedAt,
  lastCheckedAt: updatedAt,
  schemaVersion: 1,
};

describe("devinWikiExporter", () => {
  it("matches the complete Devin wiki Markdown contract", () => {
    const result = devinWikiExporter.export(page);
    const savedAt = new Date(updatedAt).toLocaleString("en-US");

    expect(result).toEqual({
      filename:
        "wikeep-devin-drunkod_repo-harness-Architecture Diagrams-9.2-2026-08-04.md",
      markdown: `# Architecture Diagrams

- **Repository**: drunkod/repo-harness
- **Source**: https://app.devin.ai/org/example/wiki/drunkod/repo-harness/page/9.2?branch=main
- **Section**: 9.2
- **Saved at**: ${savedAt}
- **Platform**: Devin
- **Branch**: main
- **Capture source**: React fiber

---

# Architecture Diagrams

\`\`\`mermaid
graph TD
A --> B
\`\`\`
`,
    });
  });
});
