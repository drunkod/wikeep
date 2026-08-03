// Utilities used by the MAIN-world Devin probe to recover the original page
// Markdown (including fenced Mermaid source) from React fiber props.

export type DevinFiber = {
  memoizedProps?: unknown;
  pendingProps?: unknown;
  child?: DevinFiber | null;
  sibling?: DevinFiber | null;
  return?: DevinFiber | null;
  alternate?: DevinFiber | null;
};

const FIBER_NODE_BUDGET = 1_500;
const PROP_OBJECT_BUDGET = 2_500;
const PROP_DEPTH_LIMIT = 10;
const FIBER_ANCESTOR_LIMIT = 60;

const MARKDOWN_PROP_KEYS = new Set([
  "children",
  "content",
  "source",
  "markdown",
  "markdownsource",
  "raw",
  "rawmarkdown",
  "text",
  "value",
]);

function fiberFromElement(element: Element): DevinFiber | null {
  const key = Object.keys(element).find(
    (name) =>
      name.startsWith("__reactFiber$") ||
      name.startsWith("__reactInternalInstance$"),
  );
  if (!key) return null;
  return (
    (element as unknown as Record<string, DevinFiber | undefined>)[key] ?? null
  );
}

/** Find the closest host element carrying React's fiber expando. */
function findFiber(element: Element | null): DevinFiber | null {
  let current = element;
  while (current) {
    const fiber = fiberFromElement(current);
    if (fiber) return fiber;
    current = current.parentElement;
  }
  return null;
}

export function normalizeDevinHeading(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+#+\s*$/, "")
    .toLowerCase();
}

function visibleHeading(host: Element): string {
  const h1 = host.querySelector("h1");
  if (!h1) return "";
  const clone = h1.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll("a, button, svg, [role='button'], [aria-hidden='true']")
    .forEach((node) => node.remove());
  return normalizeDevinHeading(clone.textContent ?? "");
}

function markdownHeadings(markdown: string): string[] {
  const headings: string[] = [];
  const re = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    headings.push(normalizeDevinHeading(match[1]));
    if (headings.length >= 100) break;
  }
  return headings;
}

function looksLikeMarkdown(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text.length < 80) return false;
  return /^\s{0,3}#{1,6}\s+.+$/m.test(text) && text.includes("\n");
}

type PropScanBudget = {
  objects: number;
};

/**
 * Recursively inspect a props value. Devin has changed the shape of the page
 * renderer over time, so the Markdown may be nested below `children`, a loader
 * payload, or a renderer-specific object rather than stored as a direct prop.
 */
function collectMarkdownStrings(
  value: unknown,
  candidates: Set<string>,
  seen: WeakSet<object>,
  budget: PropScanBudget,
  depth = 0,
): void {
  if (looksLikeMarkdown(value)) {
    candidates.add(value.trim());
    return;
  }

  if (
    value === null ||
    typeof value !== "object" ||
    depth >= PROP_DEPTH_LIMIT ||
    budget.objects >= PROP_OBJECT_BUDGET
  ) {
    return;
  }

  const object = value as object;
  if (seen.has(object)) return;
  seen.add(object);
  budget.objects += 1;

  if (typeof Node !== "undefined" && object instanceof Node) return;

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 150)) {
      collectMarkdownStrings(item, candidates, seen, budget, depth + 1);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .sort((a, b) => {
      const aPreferred = MARKDOWN_PROP_KEYS.has(a.toLowerCase()) ? 0 : 1;
      const bPreferred = MARKDOWN_PROP_KEYS.has(b.toLowerCase()) ? 0 : 1;
      return aPreferred - bPreferred;
    })
    .slice(0, 120);

  for (const key of keys) {
    // React owner/fiber pointers lead back into the whole tree and are searched
    // separately with an explicit node budget below.
    if (
      key === "_owner" ||
      key === "return" ||
      key === "child" ||
      key === "sibling" ||
      key === "stateNode"
    ) {
      continue;
    }
    collectMarkdownStrings(
      record[key],
      candidates,
      seen,
      budget,
      depth + 1,
    );
  }
}

function collectFiberCandidates(start: DevinFiber): Set<string> {
  const candidates = new Set<string>();
  const propSeen = new WeakSet<object>();
  const propBudget: PropScanBudget = { objects: 0 };

  // Seed the search with the active host's return chain. This keeps nearby,
  // currently-rendered page fibers ahead of cached SPA routes.
  const queue: DevinFiber[] = [];
  let ancestor: DevinFiber | null | undefined = start;
  let ancestorCount = 0;
  while (ancestor && ancestorCount < FIBER_ANCESTOR_LIMIT) {
    queue.push(ancestor);
    if (ancestor.alternate) queue.push(ancestor.alternate);
    ancestor = ancestor.return;
    ancestorCount += 1;
  }

  // Then perform the bounded subtree traversal described in the design docs.
  // Heading matching below prevents cached/hidden route Markdown from winning.
  const fiberSeen = new Set<DevinFiber>();
  let index = 0;
  while (index < queue.length && fiberSeen.size < FIBER_NODE_BUDGET) {
    const fiber = queue[index++];
    if (fiberSeen.has(fiber)) continue;
    fiberSeen.add(fiber);

    collectMarkdownStrings(
      fiber.memoizedProps,
      candidates,
      propSeen,
      propBudget,
    );
    collectMarkdownStrings(
      fiber.pendingProps,
      candidates,
      propSeen,
      propBudget,
    );

    if (fiber.child) queue.push(fiber.child);
    if (fiber.sibling) queue.push(fiber.sibling);
    if (fiber.alternate) queue.push(fiber.alternate);
  }

  return candidates;
}

function candidateRank(
  markdown: string,
  expectedHeading: string,
): [number, number, number] {
  const headings = markdownHeadings(markdown);
  const firstMatches =
    !!expectedHeading && headings.length > 0 && headings[0] === expectedHeading;
  const anyMatches =
    !!expectedHeading && headings.some((heading) => heading === expectedHeading);
  const headingRank = expectedHeading
    ? firstMatches
      ? 3
      : anyMatches
        ? 2
        : 0
    : 1;
  const mermaidRank = /```\s*mermaid\b/i.test(markdown) ? 1 : 0;
  // Prefer the complete, longest page source after heading correctness. Mermaid
  // is only a final tie-breaker so a short diagram component cannot beat the
  // full page Markdown.
  return [headingRank, markdown.length, mermaidRank];
}

/**
 * Extract the current visible Devin page's original Markdown from React fiber.
 * The first Markdown heading must match the visible h1 whenever one is present,
 * which prevents a longer cached SPA route from being selected accidentally.
 */
export function extractDevinPageMarkdown(doc: Document): string | null {
  const host =
    doc.querySelector(".prose-main") ??
    doc.querySelector('[class*="prose"]');
  if (!host) return null;

  const start = findFiber(host);
  if (!start) return null;

  const expectedHeading = visibleHeading(host);
  const candidates = Array.from(collectFiberCandidates(start));
  candidates.sort((a, b) => {
    const aRank = candidateRank(a, expectedHeading);
    const bRank = candidateRank(b, expectedHeading);
    return (
      bRank[0] - aRank[0] ||
      bRank[1] - aRank[1] ||
      bRank[2] - aRank[2]
    );
  });

  const best = candidates[0];
  if (!best) return null;
  if (expectedHeading && candidateRank(best, expectedHeading)[0] === 0) {
    return null;
  }
  return best;
}
