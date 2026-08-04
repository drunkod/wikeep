import { describe, expect, it } from "vitest";
import {
  exportSessionMarkdown,
  sessionMarkdownExporters,
} from "../src/export/markdown/session";
import {
  exportWikiMarkdown,
  wikiMarkdownExporters,
} from "../src/export/markdown/wiki";
import type { Conversation, WikiPage } from "../src/shared/types";

const timestamp = Date.UTC(2026, 7, 4, 8, 0, 0);

function conversation(source: Conversation["source"]): Conversation {
  return {
    id: `deepwiki:${source}`,
    source,
    question: "Question",
    sourceUrl:
      source === "devin"
        ? "https://app.devin.ai/search/id"
        : "https://deepwiki.com/search/id",
    createdAt: timestamp,
    updatedAt: timestamp,
    schemaVersion: 4,
  };
}

function page(source: WikiPage["source"]): WikiPage {
  return {
    id: `wiki:${source}`,
    source,
    kind: "page",
    owner: "org",
    repo: "repo",
    repoFullName: "org/repo",
    title: "Overview",
    url:
      source === "devin-wiki"
        ? "https://app.devin.ai/org/x/wiki/org/repo"
        : "https://deepwiki.com/org/repo",
    markdown: "# Overview",
    contentHash: "hash",
    wordCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastCheckedAt: timestamp,
    schemaVersion: 1,
  };
}

describe("Markdown exporter registries", () => {
  it("has one explicit exporter for each session source", () => {
    expect(Object.keys(sessionMarkdownExporters).sort()).toEqual([
      "deepwiki",
      "devin",
    ]);

    expect(exportSessionMarkdown(conversation("deepwiki"), []).filename).toMatch(
      /^wikeep-deepwiki-session-/,
    );
    expect(exportSessionMarkdown(conversation("devin"), []).filename).toMatch(
      /^wikeep-devin-session-/,
    );
  });

  it("has one explicit exporter for each wiki source", () => {
    expect(Object.keys(wikiMarkdownExporters).sort()).toEqual([
      "deepwiki-wiki",
      "devin-wiki",
    ]);

    expect(exportWikiMarkdown(page("deepwiki-wiki")).filename).toMatch(
      /^wikeep-deepwiki-/,
    );
    expect(exportWikiMarkdown(page("devin-wiki")).filename).toMatch(
      /^wikeep-devin-/,
    );
  });
});
