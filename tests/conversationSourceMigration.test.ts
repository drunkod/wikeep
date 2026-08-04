import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAllData,
  getConversationMessages,
  pruneLegacyConversationData,
} from "../src/storage/conversationRepository";
import { CONVERSATION_SCHEMA_VERSION } from "../src/storage/conversationMapper";
import { getDb } from "../src/storage/db";

beforeEach(async () => {
  await clearAllData();
});

afterEach(async () => {
  await clearAllData();
});

describe("conversation source migration", () => {
  it("infers source and preserves messages across repeated startup migrations", async () => {
    const db = await getDb();
    const conversationId = "deepwiki:legacy-session";

    // Deliberately omit source to represent a pre-v4 persisted record.
    await db.put("conversations", {
      id: conversationId,
      question: "Legacy session",
      sourceUrl: "https://app.devin.ai/search/legacy-session",
      sourceSessionId: "legacy-session",
      createdAt: 1,
      updatedAt: 2,
      schemaVersion: 1,
    } as never);
    await db.put("messages", {
      id: `${conversationId}:msg:1`,
      conversationId,
      role: "assistant",
      content: "This message must survive migration.",
      contentHash: "hash",
      order: 1,
      createdAt: 1,
      updatedAt: 1,
      schemaVersion: 1,
    });

    await pruneLegacyConversationData();
    await pruneLegacyConversationData();

    const storedConversation = await db.get("conversations", conversationId);
    const storedMessages = await getConversationMessages(conversationId);

    expect(storedConversation?.source).toBe("devin");
    expect(storedConversation?.schemaVersion).toBe(CONVERSATION_SCHEMA_VERSION);
    expect(storedMessages).toHaveLength(1);
    expect(storedMessages[0].content).toBe(
      "This message must survive migration.",
    );
  });
});
