import { beforeEach, describe, expect, it } from "vitest";
import {
  extractDevinPageMarkdown,
  type DevinFiber,
} from "../src/content/devinFiberMarkdown";

function setPage(heading: string): HTMLElement {
  document.body.innerHTML = `
    <main id="page-host">
      <div class="prose-main">
        <h1>${heading}<button aria-hidden="true">copy</button></h1>
        <p>${"Visible rendered page content. ".repeat(20)}</p>
      </div>
    </main>
  `;
  return document.querySelector<HTMLElement>(".prose-main")!;
}

function attachFiber(element: Element, fiber: DevinFiber): void {
  Object.defineProperty(element, "__reactFiber$wikeepTest", {
    configurable: true,
    enumerable: true,
    value: fiber,
  });
}

describe("extractDevinPageMarkdown", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds nested current-page Markdown and preserves Mermaid fences", () => {
    const host = setPage("Glossary");
    const currentMarkdown = [
      "# Glossary",
      "",
      "Definitions and domain concepts used throughout the repository. ".repeat(4),
      "",
      "```mermaid",
      "graph TD",
      "  Terms --> Implementations",
      "```",
    ].join("\n");
    const staleMarkdown = [
      "# Repository Overview",
      "",
      "This is a much longer cached route and must not be selected. ".repeat(20),
    ].join("\n");

    const root: DevinFiber = {
      memoizedProps: { cachedRoute: { markdown: staleMarkdown } },
    };
    const renderer: DevinFiber = {
      memoizedProps: {
        loaderData: {
          page: {
            renderer: {
              payload: { content: currentMarkdown },
            },
          },
        },
      },
      return: root,
    };
    const hostFiber: DevinFiber = { return: renderer };
    root.child = renderer;
    renderer.child = hostFiber;
    attachFiber(host, hostFiber);

    const result = extractDevinPageMarkdown(document);

    expect(result).toBe(currentMarkdown);
    expect(result).toContain("```mermaid");
    expect(result).not.toContain("cached route");
  });

  it("searches a bounded descendant subtree when the ancestor props are wrappers", () => {
    const host = setPage("Core Architecture");
    const currentMarkdown = [
      "# Core Architecture",
      "",
      "The architecture coordinates workers, storage, and execution. ".repeat(5),
      "",
      "```mermaid",
      "flowchart LR",
      "  Worker --> Storage",
      "```",
    ].join("\n");

    const sourceFiber: DevinFiber = {
      memoizedProps: {
        children: [{ component: { props: { rawMarkdown: currentMarkdown } } }],
      },
    };
    const wrapperFiber: DevinFiber = {
      memoizedProps: { children: { type: "MarkdownRenderer" } },
      child: sourceFiber,
    };
    const hostFiber: DevinFiber = { return: wrapperFiber };
    wrapperFiber.child = sourceFiber;
    sourceFiber.sibling = hostFiber;

    // The real React expando can be on a host ancestor rather than `.prose-main`.
    attachFiber(document.querySelector("#page-host")!, hostFiber);

    expect(extractDevinPageMarkdown(document)).toBe(currentMarkdown);
  });

  it("rejects cached Markdown whose heading does not match the visible page", () => {
    const host = setPage("Glossary");
    const staleMarkdown = [
      "# Overview",
      "",
      "Cached content from another mounted SPA route. ".repeat(10),
    ].join("\n");
    const hostFiber: DevinFiber = {
      memoizedProps: { content: staleMarkdown },
    };
    attachFiber(host, hostFiber);

    expect(extractDevinPageMarkdown(document)).toBeNull();
  });
});
