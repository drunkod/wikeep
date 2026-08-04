import { describe, expect, it } from "vitest";
import { deepwikiSessionExporter } from "../src/export/markdown/session/deepwikiSessionExporter";
import type { Conversation, Message } from "../src/shared/types";

const updatedAt = Date.UTC(2026, 7, 4, 8, 0, 0);

const conversation: Conversation = {
  id: "deepwiki:deep-session",
  source: "deepwiki",
  question: "Review the parser",
  sourceUrl: "https://deepwiki.com/search/deep-session",
  sourceSessionId: "deep-session",
  createdAt: updatedAt,
  updatedAt,
  metadata: { repoNames: ["drunkod/wikeep"] },
  schemaVersion: 4,
};

const messages: Message[] = [
  {
    id: "u1",
    conversationId: conversation.id,
    role: "user",
    content: "Please review it.",
    contentHash: "u",
    order: 0,
    createdAt: updatedAt,
    updatedAt,
    schemaVersion: 4,
  },
  {
    id: "a1",
    conversationId: conversation.id,
    role: "assistant",
    content: "The parser is correct.",
    contentHash: "a",
    order: 1,
    metadata: {
      citations: [
        { filePath: "src/parser.ts", rangeStart: 10, rangeEnd: 20 },
        { filePath: "src/parser.ts", rangeStart: 10, rangeEnd: 20 },
      ],
    },
    createdAt: updatedAt,
    updatedAt,
    schemaVersion: 4,
  },
];

describe("deepwikiSessionExporter", () => {
  it("matches the complete DeepWiki Markdown contract", () => {
    const result = deepwikiSessionExporter.export(conversation, messages);
    const savedAt = new Date(updatedAt).toLocaleString("en-US");

    expect(result).toEqual({
      filename: "wikeep-deepwiki-session-drunkod_wikeep-Review the parser-2026-08-04.md",
      markdown: `# Review the parser

- **Repository**: drunkod/wikeep
- **Source**: https://deepwiki.com/search/deep-session
- **Saved at**: ${savedAt}

---

## User

Please review it.

---

## Assistant

The parser is correct.

**Sources:**

- \`src/parser.ts\` [10-20]()

---
`,
    });
  });
});
