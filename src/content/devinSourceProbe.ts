// MAIN-world probe for Devin wiki pages.
//
// Devin renders wiki pages from a raw Markdown string held in React props
// (including ```mermaid fences). That string only exists on the React fiber,
// which the isolated content-script world cannot read. This probe runs in the
// MAIN world, extracts the current page's Markdown on request, and posts it
// back to the isolated content script via window.postMessage.

interface DevinMdRequest {
  source?: string;
  requestId?: number;
}

type Fiber = {
  memoizedProps?: Record<string, unknown> | null;
  child?: Fiber | null;
  sibling?: Fiber | null;
  return?: Fiber | null;
} | null;

function getFiber(el: Element | null): Fiber {
  if (!el) return null;
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  return key ? ((el as unknown as Record<string, Fiber>)[key] ?? null) : null;
}

// Heuristic: a page-Markdown string is long and starts a line with a heading.
function looksLikeMarkdown(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 200 &&
    /(^|\n)#{1,3}\s/.test(value)
  );
}

const MD_PROP_KEYS = [
  "children",
  "content",
  "source",
  "markdown",
  "text",
  "value",
];

function normalizeHeading(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The clean text of the visible <h1>, ignoring copy-link controls/icons. */
function visibleHeading(host: Element): string {
  const h1 = host.querySelector("h1");
  if (!h1) return "";
  const clone = h1.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll("a, button, svg, [role='button'], [aria-hidden='true']")
    .forEach((n) => n.remove());
  return normalizeHeading(clone.textContent ?? "");
}

/** First Markdown heading text from a candidate string. */
function firstMarkdownHeading(markdown: string): string {
  const line = markdown
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^#{1,3}\s+/.test(l));
  return line ? normalizeHeading(line.replace(/^#{1,3}\s+/, "")) : "";
}

/**
 * Extract the CURRENT page's Markdown from React props.
 *
 * A Devin SPA keeps cached/hidden routes mounted, so the globally-longest
 * Markdown string can belong to a different page. To avoid that we (1) anchor
 * at the visible `.prose-main`, (2) climb a bounded number of ancestors (the
 * Markdown renderer sits just above the prose node), and (3) only accept a
 * candidate whose first heading matches the visible <h1>.
 */
function extractPageMarkdown(): string | null {
  const host =
    document.querySelector(".prose-main") ??
    document.querySelector('[class*="prose"]');
  if (!host) return null;

  const expected = visibleHeading(host);
  const start = getFiber(host);
  if (!start) return null;

  const candidates: string[] = [];
  let node: Fiber = start;
  let hops = 0;
  while (node && hops < 40) {
    const props = node.memoizedProps;
    if (props) {
      for (const key of MD_PROP_KEYS) {
        const v = props[key];
        if (looksLikeMarkdown(v)) candidates.push(v);
      }
    }
    node = node.return ?? null;
    hops += 1;
  }

  // Prefer the longest candidate whose heading matches the visible page.
  candidates.sort((a, b) => b.length - a.length);
  for (const md of candidates) {
    if (!expected || firstMarkdownHeading(md) === expected) {
      return md;
    }
  }

  return null;
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as DevinMdRequest;
  if (data?.source !== "wikeep-devin-md-request") return;

  let markdown: string | null = null;
  try {
    markdown = extractPageMarkdown();
  } catch {
    markdown = null;
  }

  window.postMessage(
    {
      source: "wikeep-devin-md",
      requestId: data.requestId,
      url: location.href,
      markdown,
    },
    location.origin,
  );
});
