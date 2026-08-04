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
- **Platform**: Devin

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

  it("removes legacy Devin Thinking-process details at export time", () => {
    const legacyAssistant: Message = {
      ...messages[1],
      content:
        "<details><summary>Thinking process (3 tools used)</summary>secret trace</details>\n\nVisible answer.",
    };

    const markdown = devinSessionExporter.export(conversation, [
      legacyAssistant,
    ]).markdown;

    expect(markdown).toContain("Visible answer.");
    expect(markdown).not.toContain("secret trace");
    expect(markdown).not.toContain("Thinking process");
  });

  it("preserves unrelated details adjacent to a Thinking-process block", () => {
    const legacyAssistant: Message = {
      ...messages[1],
      content: [
        "<details><summary>Implementation notes</summary>Keep this explanation.</details>",
        "<details><summary><strong>Thinking process</strong> (2 tools used)</summary>remove this trace</details>",
        "Visible answer.",
      ].join("\n\n"),
    };

    const markdown = devinSessionExporter.export(conversation, [
      legacyAssistant,
    ]).markdown;

    expect(markdown).toContain("Implementation notes");
    expect(markdown).toContain("Keep this explanation.");
    expect(markdown).toContain("Visible answer.");
    expect(markdown).not.toContain("remove this trace");
    expect(markdown).not.toContain("Thinking process");
  });

  it("removes an outer Thinking-process block containing nested details", () => {
    const legacyAssistant: Message = {
      ...messages[1],
      content: [
        "<details>",
        "<summary>Thinking process (4 tools used)</summary>",
        "secret before nested block",
        "<details><summary>Tool result</summary>nested secret</details>",
        "secret after nested block",
        "</details>",
        "Visible answer after the nested trace.",
      ].join("\n"),
    };

    const markdown = devinSessionExporter.export(conversation, [
      legacyAssistant,
    ]).markdown;

    expect(markdown).toContain("Visible answer after the nested trace.");
    expect(markdown).not.toContain("secret before nested block");
    expect(markdown).not.toContain("nested secret");
    expect(markdown).not.toContain("secret after nested block");
    expect(markdown).not.toContain("Thinking process");
  });

  it("removes a nested Thinking-process block while preserving its parent", () => {
    const legacyAssistant: Message = {
      ...messages[1],
      content: [
        "<details>",
        "<summary>Implementation notes</summary>",
        "Keep before nested trace.",
        "<details><summary>Thinking process</summary>nested trace</details>",
        "Keep after nested trace.",
        "</details>",
      ].join("\n"),
    };

    const markdown = devinSessionExporter.export(conversation, [
      legacyAssistant,
    ]).markdown;

    expect(markdown).toContain("Implementation notes");
    expect(markdown).toContain("Keep before nested trace.");
    expect(markdown).toContain("Keep after nested trace.");
    expect(markdown).not.toContain("nested trace");
    expect(markdown).not.toContain("Thinking process");
  });
});
