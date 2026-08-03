export interface WikiUrlParts {
  owner: string;
  repo: string;
  sectionPath?: string;
}

/** Which site a wiki page was saved from. */
export type WikiSource = "deepwiki" | "devin";

/** Classify a wiki URL by its source site. Defaults to "deepwiki". */
export function wikiSourceFromUrl(url: string): WikiSource {
  return isDevinHost(url) ? "devin" : "deepwiki";
}

// DeepWiki: owner/repo with optional path-encoded section.
const WIKI_PAGE_RE =
  /^https?:\/\/deepwiki\.com\/([^/]+)\/([^/]+)(?:\/(\d+(?:\.\d+)*-[^/?#]+))?\/?(?:[?#].*)?$/;

const RESERVED_FIRST_SEGMENTS = new Set(["search", "login", "settings", "about", "api"]);

function isDevinHost(url: string): boolean {
  try {
    return new URL(url).hostname === "app.devin.ai";
  } catch {
    return false;
  }
}

/** Extract `1.2` from `#1.2` or `#1.2-some-slug`; undefined if no numeric hash. */
function parseDevinHashSection(hash: string): string | undefined {
  const value = hash.replace(/^#/, "");
  const match = value.match(/^(\d+(?:\.\d+)*)(?:-.*)?$/);
  return match ? match[1] : undefined;
}

/**
 * Parse both Devin wiki URL forms:
 *
 * - /org/<org>/wiki/<owner>/<repo>
 * - /org/<org>/wiki/<owner>/<repo>/page/<section>
 *
 * Query parameters such as `?branch=` are intentionally ignored. Older
 * hash-based section links remain supported for backwards compatibility.
 */
function parseDevinWikiUrl(url: string): WikiUrlParts | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname !== "app.devin.ai" ||
      (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    ) {
      return null;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    const isRootRoute = segments.length === 5;
    const isPageRoute = segments.length === 7;

    if (!isRootRoute && !isPageRoute) return null;
    if (segments[0] !== "org" || segments[2] !== "wiki") return null;

    const orgSlug = segments[1];
    const owner = segments[3];
    const repo = segments[4];
    if (!orgSlug || !owner || !repo) return null;

    let sectionPath: string | undefined;
    if (isPageRoute) {
      if (segments[5] !== "page") return null;
      if (!/^\d+(?:\.\d+)*$/.test(segments[6])) return null;
      sectionPath = segments[6];
    } else {
      sectionPath = parseDevinHashSection(parsed.hash);
    }

    return {
      owner: decodeURIComponent(owner),
      repo: decodeURIComponent(repo),
      sectionPath,
    };
  } catch {
    return null;
  }
}

export function isWikiPageUrl(url: string): boolean {
  if (isDevinHost(url)) {
    return parseDevinWikiUrl(url) !== null;
  }
  if (/^https?:\/\/deepwiki\.com\/search\//.test(url)) return false;
  const match = url.match(WIKI_PAGE_RE);
  if (!match) return false;
  return !RESERVED_FIRST_SEGMENTS.has(match[1].toLowerCase());
}

export function parseWikiUrl(url: string): WikiUrlParts | null {
  if (isDevinHost(url)) {
    return parseDevinWikiUrl(url);
  }

  if (!isWikiPageUrl(url)) return null;
  const match = url.match(WIKI_PAGE_RE);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    sectionPath: match[3] || undefined,
  };
}
