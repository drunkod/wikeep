import type { WikiPageSnapshot } from "../shared/types";
import { normalizeText, stableHash } from "../shared/utils";
import { parseWikiUrl } from "../shared/wikiUrl";
import { findContentRoot, sanitizeForMarkdown } from "./deepwikiWikiParser";
import { elementToMarkdown } from "./htmlToMarkdown";

const FULL_WIKI_SECTION_PATH = "__full-wiki";

// Sidebar items that are app chrome, not wiki outline pages.
const CONTROL_LABELS = new Set(
  [
    "back",
    "upgrade",
    "settings",
    "help",
    "download apps",
    "share",
    "search",
    "toggle sidebar",
  ].map((s) => s.toLowerCase()),
);

/** Keep the real Devin path/org slug; only set the full-wiki hash marker. */
function withWikeepFullWikiHash(url: string): string {
  try {
    const next = new URL(url);
    next.hash = "wikeep-full-wiki";
    return next.toString();
  } catch {
    return url;
  }
}

type OutlineItem = {
  label: string;
  element: HTMLElement;
};

// Devin uses Shadcn sidebar primitives. Depending on whether `asChild` is used,
// `data-slot` can be on the clickable button/link itself or on a wrapper around
// it. Nested wiki sections use `sidebar-menu-sub-button`.
const OUTLINE_ITEM_SELECTOR = [
  '[data-slot="sidebar-content"] [data-slot="sidebar-menu-button"][aria-label]',
  '[data-slot="sidebar-content"] [data-slot="sidebar-menu-sub-button"][aria-label]',
  '[data-slot="sidebar-content"] [data-slot="sidebar-menu-button"] button[aria-label]',
  '[data-slot="sidebar-content"] [data-slot="sidebar-menu-button"] a[aria-label]',
  '[data-slot="sidebar-content"] [data-slot="sidebar-menu-sub-button"] button[aria-label]',
  '[data-slot="sidebar-content"] [data-slot="sidebar-menu-sub-button"] a[aria-label]',
].join(", ");

function clickableElement(node: Element): HTMLElement | null {
  if (!(node instanceof HTMLElement)) return null;
  if (node.matches("button, a, [role='button']")) return node;
  return node.querySelector<HTMLElement>("button, a, [role='button']");
}

function getOutlineItems(doc: Document): OutlineItem[] {
  const items: OutlineItem[] = [];
  const seen = new Set<HTMLElement>();

  for (const node of doc.querySelectorAll(OUTLINE_ITEM_SELECTOR)) {
    const element = clickableElement(node);
    if (!element || seen.has(element)) continue;

    const label = (
      node.getAttribute("aria-label") ??
      element.getAttribute("aria-label") ??
      ""
    ).trim();
    const normalized = label.toLowerCase();
    if (!label || CONTROL_LABELS.has(normalized)) continue;

    seen.add(element);
    items.push({ label, element });
  }

  return items;
}

function getProseMain(doc: Document): HTMLElement | null {
  return (
    doc.querySelector<HTMLElement>(".prose-main") ?? findContentRoot(doc)
  );
}

function normLabel(value: string): string {
  return normalizeText(value).toLowerCase();
}

/** Clean <h1> text, dropping the copy-link control so it matches the label. */
function cleanHeading(root: HTMLElement | null): string {
  const h1 = root?.querySelector("h1");
  if (!h1) return "";
  const clone = h1.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll("a, button, svg, [role='button'], [aria-hidden='true']")
    .forEach((n) => n.remove());
  return normalizeText(clone.textContent ?? "");
}

/** Re-query the outline item for a label (refs go stale after re-render). */
function findOutlineItemByLabel(
  doc: Document,
  label: string,
): HTMLElement | null {
  return (
    getOutlineItems(doc).find((item) => normLabel(item.label) === normLabel(label))
      ?.element ?? null
  );
}

/**
 * Wait until the visible heading matches `expectedLabel` AND content length is
 * stable across two polls (so lazy mermaid/SVG diagrams have painted). Returns
 * true if it landed on the expected section, false on timeout.
 */
async function waitForSection(
  doc: Document,
  expectedLabel: string,
  timeoutMs = 5000,
): Promise<boolean> {
  const started = Date.now();
  const expected = normLabel(expectedLabel);
  let lastLen = -1;
  let stableCount = 0;

  return new Promise((resolve) => {
    const tick = () => {
      const root = getProseMain(doc);
      const headingMatches = normLabel(cleanHeading(root)) === expected;
      const len = root ? (root.textContent ?? "").length : 0;
      const lengthStable = len === lastLen && len > 0;
      stableCount = lengthStable ? stableCount + 1 : 0;
      lastLen = len;

      if (headingMatches && stableCount >= 1) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, 120);
    };
    tick();
  });
}

/**
 * @param fetchSectionMarkdown Optional async getter for the active section's
 *   raw Markdown (supplied by the MAIN-world Devin probe). When it returns a
 *   value, diagrams are preserved as ```mermaid fences; otherwise we fall back
 *   to DOM->Turndown, which can only emit diagram placeholders.
 */
export async function buildFullWikiFromDom(
  document: Document,
  url: string,
  fetchSectionMarkdown?: () => Promise<string | null>,
): Promise<WikiPageSnapshot | null> {
  const parts = parseWikiUrl(url);
  if (!parts) return null;

  // Snapshot stable labels first; element refs go stale when the SPA
  // re-renders the sidebar after a navigation, so re-query before each click.
  const entryLabels = getOutlineItems(document).map((item) => item.label);
  if (entryLabels.length === 0) return null;

  const originalHash = location.hash;
  const sections: string[] = [];
  const labels: string[] = [];
  let usedFiber = false;

  for (const label of entryLabels) {
    const item = findOutlineItemByLabel(document, label);
    if (!item) continue; // entry vanished after a re-render — skip it

    item.click();

    // Skip sections that never navigate to the expected heading rather than
    // capturing stale/duplicate content from the previous section.
    const landed = await waitForSection(document, label);
    if (!landed) continue;

    const root = getProseMain(document);
    if (!root || (root.textContent ?? "").trim().length < 40) continue;

    let md: string | null = null;
    if (fetchSectionMarkdown) {
      const fiber = await fetchSectionMarkdown();
      if (fiber && fiber.trim()) {
        md = fiber.trim();
        usedFiber = true;
      }
    }
    if (!md) {
      const sanitized = sanitizeForMarkdown(root);
      md = elementToMarkdown(sanitized, { sourceUrl: location.href }).trim();
    }
    if (md) {
      sections.push(md);
      labels.push(label);
    }
  }

  // Restore the user's original location.
  location.hash = originalHash;

  if (sections.length === 0) return null;

  const markdown = normalizeText(sections.join("\n\n---\n\n"));
  const repoFullName = `${parts.owner}/${parts.repo}`;

  return {
    url: withWikeepFullWikiHash(url),
    owner: parts.owner,
    repo: parts.repo,
    kind: "full-wiki",
    sectionPath: FULL_WIKI_SECTION_PATH,
    title: `${repoFullName} Full Wiki`,
    markdown,
    markdownSource: usedFiber ? "fiber" : "dom",
    contentHash: stableHash(markdown),
    relatedSections: labels,
    wordCount: markdown.split(/\s+/).filter(Boolean).length,
    hasDiagrams: /```mermaid/.test(markdown) || /data-wikeep-diagram/.test(markdown),
    capturedAt: Date.now(),
  };
}
