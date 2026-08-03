// MAIN-world probe for Devin wiki pages.
//
// Devin renders wiki pages from a raw Markdown string held in React props
// (including ```mermaid fences). That string only exists on the React fiber,
// which the isolated content-script world cannot read. This probe runs in the
// MAIN world, extracts the current page's Markdown on request, and posts it
// back to the isolated content script via window.postMessage.

import { extractDevinPageMarkdown } from "./devinFiberMarkdown";

interface DevinMdRequest {
  source?: string;
  requestId?: number;
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as DevinMdRequest;
  if (data?.source !== "wikeep-devin-md-request") return;

  let markdown: string | null = null;
  try {
    markdown = extractDevinPageMarkdown(document);
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
