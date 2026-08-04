import { describe, expect, it } from "vitest";
import {
  renderSessionMarkdown,
  sanitizeFilename,
} from "../src/export/markdown/shared";
import type { Conversation, Message } from "../src/shared/types";

const updatedAt = Date.UTC(2026, 7, 4, 8, 0, 0);

const conversation: Conversation = {
  id: "deepwiki:transform-contract",
  source: "devin",
  question: "Transform contract",
  sourceUrl: "https://app.devin.ai/search/transform-contract",
  createdAt: updatedAt,
  updatedAt,
  schemaVersion: 4,
};

const assistant: Message = {
  id: "assistant",
  conversationId: conversation.id,
  role: "assistant",
  content: "Stored content",
  contentHash: "hash",
  order: 0,
  createdAt: updatedAt,
  updatedAt,
  schemaVersion: 4,
};

describe("shared Markdown exporter contracts", () => {
  it("preserves internal whitespace returned by a site transform", () => {
    const result = renderSessionMarkdown(conversation, [assistant], {
      sourceLabel: "devin",
      transformMessageContent: () => "Line one\n\n\nLine two",
    });

    expect(result.markdown).toContain("Line one\n\n\nLine two");
  });

  it("omits a message when a site transform returns only whitespace", () => {
    const result = renderSessionMarkdown(conversation, [assistant], {
      sourceLabel: "devin",
      transformMessageContent: () => " \n\t ",
    });

    expect(result.markdown).not.toContain("## Assistant");
  });

  it("uses content-type-specific filename fallbacks", () => {
    expect(sanitizeFilename("")).toBe("session");
    expect(sanitizeFilename("", "wiki")).toBe("wiki");
  });
});
