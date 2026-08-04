import { beforeEach, describe, expect, it } from "vitest";
import { enrichDevinSessionSnapshotFromDom } from "../src/parser/devinSessionDomParser";
import type { CapturePayload, ParsedMessage } from "../src/shared/types";

function snapshot(messages: ParsedMessage[]): CapturePayload {
  return {
    title: "Devin review session",
    sourceUrl: "https://app.devin.ai/search/example-session",
    sourceHost: "app.devin.ai",
    sourceSessionId: "example-session",
    metadata: { repoNames: ["drunkod/repo-harness"] },
    messages,
    capturedAt: 1,
  };
}

function user(content: string, order: number, id: string): ParsedMessage {
  return {
    role: "user",
    content,
    order,
    externalId: `${id}:user`,
  };
}

function assistant(
  content: string,
  order: number,
  id: string,
): ParsedMessage {
  return {
    role: "assistant",
    content,
    order,
    externalId: `${id}:assistant`,
    metadata: {
      engineId: "omni",
      citations: [
        {
          filePath: "src/example.ts",
          rangeStart: 1,
          rangeEnd: 4,
        },
      ],
    },
  };
}

describe("enrichDevinSessionSnapshotFromDom", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("adds a visible assistant answer and preserves fenced code blocks", () => {
    document.body.innerHTML = `
      <div data-query-display id="turn-review">
        <div>
          <div>
            <div data-role="user"><p>Rewrite the plan</p></div>
            <div>Deep</div>
            <div data-role="assistant" class="prose">
              <details>
                <summary>Thinking process (15 tools used)</summary>
                <p>Private tool trace that must not be exported.</p>
              </details>
              <h2>Review of commit</h2>
              <p>The answer explains the architectural issue.</p>
              <pre><code class="language-ts">export const fixed = true;</code></pre>
              <button>Copy</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const result = enrichDevinSessionSnapshotFromDom(
      document,
      snapshot([user("Rewrite the plan", 0, "message-1")]),
      1,
    );

    expect(result.apiAssistantCount).toBe(0);
    expect(result.domAssistantCount).toBe(1);
    expect(result.capturedAssistantCount).toBe(1);
    expect(result.snapshot.messages).toHaveLength(2);
    expect(result.snapshot.messages[1]).toMatchObject({
      role: "assistant",
      externalId: "message-1:assistant",
    });
    expect(result.snapshot.messages[1].content).toContain(
      "## Review of commit",
    );
    expect(result.snapshot.messages[1].content).toContain("```ts");
    expect(result.snapshot.messages[1].content).toContain(
      "export const fixed = true;",
    );
    expect(result.snapshot.messages[1].content).not.toContain(
      "Thinking process",
    );
    expect(result.snapshot.messages[1].content).not.toContain("Copy");
  });

  it("uses the richer rendered answer while retaining API metadata", () => {
    document.body.innerHTML = `
      <article data-testid="conversation-turn">
        <div data-testid="user-message">Please review the commit</div>
        <div data-testid="assistant-message" class="prose-main">
          <h2>Findings</h2>
          <p>The complete answer contains more detail than the API chunk.</p>
          <pre><code class="language-bash">bun run check:type</code></pre>
        </div>
      </article>
    `;

    const result = enrichDevinSessionSnapshotFromDom(
      document,
      snapshot([
        user("Please review the commit", 0, "message-2"),
        assistant("The complete answer", 1, "message-2"),
      ]),
      1,
    );

    const savedAssistant = result.snapshot.messages[1];
    expect(savedAssistant.content).toContain("## Findings");
    expect(savedAssistant.content).toContain("```bash");
    expect(savedAssistant.metadata?.engineId).toBe("omni");
    expect(savedAssistant.metadata?.citations).toHaveLength(1);
    expect(savedAssistant.externalId).toBe("message-2:assistant");
  });

  it("appends code shown beside the answer when it is outside the prose node", () => {
    document.body.innerHTML = `
      <article data-testid="conversation-turn">
        <div data-testid="user-message">Show the implementation</div>
        <div data-testid="assistant-message" class="prose">
          <p>The implementation changes only session capture.</p>
        </div>
        <aside>
          <pre><code class="language-ts">function saveAnswer() { return true; }</code></pre>
        </aside>
      </article>
    `;

    const result = enrichDevinSessionSnapshotFromDom(
      document,
      snapshot([user("Show the implementation", 0, "message-3")]),
      1,
    );

    expect(result.snapshot.messages[1].content).toContain(
      "The implementation changes only session capture.",
    );
    expect(result.snapshot.messages[1].content).toContain("```ts");
    expect(result.snapshot.messages[1].content).toContain("saveAnswer");
  });

  it("aligns multiple turns by their user text", () => {
    document.body.innerHTML = `
      <div data-query-display id="turn-one">
        <div><div>
          <div><p>First request</p></div>
          <div>Deep</div>
          <div><p>First visible answer</p></div>
        </div></div>
      </div>
      <div data-query-display id="turn-two">
        <div><div>
          <div><p>Second request</p></div>
          <div>Deep</div>
          <div><p>Second visible answer with the final review.</p></div>
        </div></div>
      </div>
    `;

    const result = enrichDevinSessionSnapshotFromDom(
      document,
      snapshot([
        user("First request", 0, "message-4"),
        assistant("First visible answer", 1, "message-4"),
        user("Second request", 2, "message-5"),
      ]),
      2,
    );

    expect(result.snapshot.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(result.snapshot.messages[1].content).toContain(
      "First visible answer",
    );
    expect(result.snapshot.messages[3].content).toContain(
      "Second visible answer with the final review.",
    );
    expect(result.capturedAssistantCount).toBe(2);
  });

  it("reports an incomplete finished transcript instead of inventing an answer", () => {
    document.body.innerHTML = `<main><p>Unrelated page content</p></main>`;

    const result = enrichDevinSessionSnapshotFromDom(
      document,
      snapshot([user("Missing answer", 0, "message-6")]),
      1,
    );

    expect(result.snapshot.messages).toHaveLength(1);
    expect(result.capturedAssistantCount).toBe(0);
    expect(result.completedTurnCount).toBe(1);
  });

  it("removes stray control characters from saved session messages", () => {
    document.body.innerHTML = `
      <div data-query-display>
        <div><div>
          <div><p>Clean this prompt</p></div>
          <div>Deep</div>
          <div><p>Clean answer</p></div>
        </div></div>
      </div>
    `;

    const result = enrichDevinSessionSnapshotFromDom(
      document,
      snapshot([user("Clean this prompt\b\u001c", 0, "message-7")]),
      1,
    );

    expect(result.snapshot.messages[0].content).toBe("Clean this prompt");
    expect(result.snapshot.messages[1].content).toContain("Clean answer");
  });
});
