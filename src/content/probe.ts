import {
  fingerprintWikiPage,
  parseFullWiki,
  parseWikiPage,
} from "../parser/deepwikiWikiParser";
import { buildFullWikiFromDom } from "../parser/devinWikiParser";
import type { WikiPageDetectedPayload } from "../shared/messages";
import type { WikiPageSnapshot } from "../shared/types";
import { sendRuntimeMessage } from "../shared/utils";

let latestRscRaw: { url: string; raw: string } | null = null;
let rscMessageListenerRegistered = false;

export function captureRscMessages(): void {
  if (rscMessageListenerRegistered) return;

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window) return;
    const data = e.data as { source?: string; url?: string; raw?: string };
    if (data?.source === "wikeep-rsc" && data.url && data.raw) {
      latestRscRaw = { url: data.url, raw: data.raw };
    }
  });

  rscMessageListenerRegistered = true;
}

// --- Devin MAIN-world Markdown probe ---------------------------------------
type DevinProbeResult = {
  responded: boolean;
  markdown: string | null;
};

type DevinPendingRequest = {
  url: string;
  resolve: (result: DevinProbeResult) => void;
};

let devinReqSeq = 0;
const devinPending = new Map<number, DevinPendingRequest>();
let devinListenerRegistered = false;

export function captureDevinMessages(): void {
  if (devinListenerRegistered) return;

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window) return;
    const data = e.data as {
      source?: string;
      requestId?: number;
      url?: string;
      markdown?: string | null;
    };
    if (
      data?.source === "wikeep-devin-md" &&
      typeof data.requestId === "number"
    ) {
      const pending = devinPending.get(data.requestId);
      if (pending) {
        devinPending.delete(data.requestId);
        pending.resolve({
          responded: true,
          // Reject a response captured after the SPA moved to another section.
          markdown:
            !data.url || data.url === pending.url
              ? (data.markdown ?? null)
              : null,
        });
      }
    }
  });

  devinListenerRegistered = true;
}

function requestDevinMarkdownOnce(timeoutMs: number): Promise<DevinProbeResult> {
  const requestId = ++devinReqSeq;
  const requestUrl = location.href;

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      devinPending.delete(requestId);
      resolve({ responded: false, markdown: null });
    }, timeoutMs);

    devinPending.set(requestId, {
      url: requestUrl,
      resolve: (result) => {
        window.clearTimeout(timer);
        resolve(result);
      },
    });

    window.postMessage(
      { source: "wikeep-devin-md-request", requestId },
      location.origin,
    );
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Ask the MAIN-world probe for the current Devin page's raw Markdown.
 *
 * A newly-selected SPA section can expose its h1 before React has committed the
 * renderer props that contain the original Markdown. Null responses are retried
 * briefly; a complete timeout means the MAIN-world probe is unavailable, so we
 * stop immediately instead of waiting repeatedly for every full-wiki section.
 */
export async function requestDevinMarkdown(
  timeoutMs = 2000,
): Promise<string | null> {
  const attempts = 4;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await requestDevinMarkdownOnce(timeoutMs);
    if (!result.responded) return null;
    if (result.markdown?.trim()) return result.markdown;
    if (attempt < attempts - 1) {
      await delay(150 * (attempt + 1));
    }
  }
  return null;
}

async function waitForRscRaw(timeoutMs = 1200): Promise<string | null> {
  if (latestRscRaw?.url === location.href) {
    return latestRscRaw.raw;
  }

  window.postMessage({ source: "wikeep-rsc-request" }, location.origin);

  return new Promise((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (latestRscRaw?.url === location.href) {
        window.clearInterval(timer);
        resolve(latestRscRaw.raw);
        return;
      }

      if (Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(null);
      }
    }, 100);
  });
}

function isDevinPage(): boolean {
  return location.host === "app.devin.ai";
}

export async function snapshotCurrentPage(): Promise<WikiPageSnapshot | null> {
  // Devin has no RSC stream, but the original Markdown (with ```mermaid fences)
  // lives in React props. Pull it from the MAIN-world probe; fall back to DOM.
  if (isDevinPage()) {
    const fiberMarkdown = await requestDevinMarkdown(2000);
    return parseWikiPage(document, location.href, null, fiberMarkdown);
  }

  const rscRaw = await waitForRscRaw(2500);
  return parseWikiPage(document, location.href, rscRaw);
}

export async function snapshotFullWiki(): Promise<WikiPageSnapshot | null> {
  // Devin has no RSC stream; traverse the sidebar DOM and pull each section's
  // Markdown from the MAIN-world probe so diagrams are preserved.
  if (isDevinPage()) {
    return buildFullWikiFromDom(document, location.href, () =>
      requestDevinMarkdown(2000),
    );
  }

  const rscRaw = await waitForRscRaw(2500);
  return parseFullWiki(document, location.href, rscRaw);
}

export function reportWikiFingerprint(): void {
  const fp = fingerprintWikiPage(document, location.href);
  if (!fp) return;

  void sendRuntimeMessage<void, WikiPageDetectedPayload>("WIKI_PAGE_DETECTED", {
    fingerprint: { url: location.href, ...fp },
  }).catch(() => undefined);
}
