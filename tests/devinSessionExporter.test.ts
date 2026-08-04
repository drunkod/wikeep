import { describe, expect, it } from "vitest";
import { devinSessionExporter } from "../src/export/markdown/session/devinSessionExporter";
import type { Conversation, Message } from "../src/shared/types";

const updatedAt = Date.UTC(2026, 7, 4, 8, 0, 0);

const conversation: Conversation = {
  id: "deepwiki:devin-session",
  source: "devin",
  question: "Apply the patch",
  sourceUrl: "https://app.devin.ai/search/devin-session",
  sourceSessionId: "devin-session",
  createdAt: updatedAt,
  updatedAt,
  metadata: { repoNames: ["drunkod/repo-harness"] },
  schemaVersion: 4,
};

const messages: Message[] = [
  {
    id: "u1",
    conversationId: conversation.id,
    role: "user",
    content: "Apply it.",
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
    content: "Implemented.\n\n```ts\nexport const fixed = true;\n```",
    contentHash: "a",
    order: 1,
    createdAt: updatedAt,
    updatedAt,
    schemaVersion: 4,
  },
];

describe("devinSessionExporter", () => {
  it("matches the complete Devin Markdown contract and preserves code", () => {
    const result = devinSessionExporter.export(conversation, messages);
    const savedAt = new Date(updatedAt).toLocaleString("en-US");

    expect(result).toEqual({
      filename: "wikeep-devin-session-drunkod_repo-harness-Apply the patch-2026-08-04.md",
      markdown: `# Apply the patch

- **Repository**: drunkod/repo-harness
- **Source**: https://app.devin.ai/search/devin-session
- **Saved at**: ${savedAt}

---

## User

Apply it.

---

## Assistant

Implemented.

\`\`\`ts
export const fixed = true;
\`\`\`

---
`,
    });
  });
});
