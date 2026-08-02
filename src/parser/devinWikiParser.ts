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

const OUTLINE_BUTTON_SELECTOR =
  '[data-slot="sidebar-content"] [data-slot="sidebar-menu-button"] button[aria-label]';

function getOutlineButtons(doc: Document): HTMLButtonElement[] {
  return Array.from(
    doc.querySelectorAll<HTMLButtonElement>(OUTLINE_BUTTON_SELECTOR),
  ).filter((btn) => {
    const label = (btn.getAttribute("aria-label") ?? "").trim().toLowerCase();
    return label.length > 0 && !CONTROL_LABELS.has(label);
  });
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

/** Re-query the outline button for a label (refs go stale after re-render). */
function findOutlineButtonByLabel(
  doc: Document,
  label: string,
): HTMLButtonElement | null {
  return (
    getOutlineButtons(doc).find(
      (b) => normLabel(b.getAttribute("aria-label") ?? "") === normLabel(label),
    ) ?? null
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
  const entryLabels = getOutlineButtons(document)
    .map((b) => (b.getAttribute("aria-label") ?? "").trim())
    .filter(Boolean);
  if (entryLabels.length === 0) return null;

  const originalHash = location.hash;
  const sections: string[] = [];
  const labels: string[] = [];
  let usedFiber = false;

  for (const label of entryLabels) {
    const btn = findOutlineButtonByLabel(document, label);
    if (!btn) continue; // entry vanished after a re-render — skip it

    btn.click();

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
