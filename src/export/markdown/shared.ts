import type {
  Conversation,
  Message,
  MessageCitation,
  WikiPage,
} from "../../shared/types";
import { normalizeText } from "../../shared/utils";

export interface MarkdownExportResult {
  markdown: string;
  filename: string;
}

export interface SessionMarkdownExporter {
  export(conversation: Conversation, messages: Message[]): MarkdownExportResult;
}

export interface WikiMarkdownExporter {
  export(page: WikiPage): MarkdownExportResult;
}

const ROLE_LABELS: Record<string, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  unknown: "Unknown",
};

export interface SessionRenderPolicy {
  sourceLabel: "deepwiki" | "devin";
  extraMetadataLines?: (conversation: Conversation) => string[];
  transformMessageContent?: (message: Message, content: string) => string;
  includeMessageSources?: boolean;
}

export interface WikiRenderPolicy {
  sourceLabel: "deepwiki" | "devin";
  includeTitleInFilename: boolean;
  extraMetadataLines?: (page: WikiPage) => string[];
}

export function sanitizeFilename(text: string): string {
  return (
    text
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50) || "session"
  );
}

export function formatSavedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US");
}

export function formatMessageSources(
  citations: MessageCitation[] | undefined,
): string[] {
  if (!citations || citations.length === 0) return [];

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const citation of citations) {
    if (!citation.filePath) continue;
    const key = `${citation.filePath}:${citation.rangeStart}-${citation.rangeEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(
      `- \`${citation.filePath}\` [${citation.rangeStart}-${citation.rangeEnd}]()`,
    );
  }
  return lines;
}

export function renderSessionMarkdown(
  conversation: Conversation,
  messages: Message[],
  policy: SessionRenderPolicy,
): MarkdownExportResult {
  const lines: string[] = [];
  const question =
    normalizeText(conversation.question) || "Unrecognized question";
  const repoNames = conversation.metadata?.repoNames ?? [];

  lines.push(`# ${question}`);
  lines.push("");

  if (repoNames.length > 0) {
    lines.push(`- **Repository**: ${repoNames.join(", ")}`);
  }

  lines.push(`- **Source**: ${conversation.sourceUrl}`);
  lines.push(`- **Saved at**: ${formatSavedAt(conversation.updatedAt)}`);
  lines.push(...(policy.extraMetadataLines?.(conversation) ?? []));
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const message of messages) {
    const role = ROLE_LABELS[message.role] ?? message.role;
    const normalized = normalizeText(message.content);
    const content = policy.transformMessageContent
      ? normalizeText(policy.transformMessageContent(message, normalized))
      : normalized;

    if (!content) continue;

    lines.push(`## ${role}`);
    lines.push("");
    lines.push(content);
    lines.push("");

    if (policy.includeMessageSources !== false) {
      const sources = formatMessageSources(message.metadata?.citations);
      if (sources.length > 0) {
        lines.push("**Sources:**");
        lines.push("");
        lines.push(...sources);
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  const repo = conversation.metadata?.repoNames?.[0];
  const segments = repo ? [repo, question] : [question];
  const date = new Date(conversation.updatedAt).toISOString().slice(0, 10);
  const filename = `wikeep-${policy.sourceLabel}-session-${sanitizeFilename(
    segments.join("-"),
  )}-${date}.md`;

  return { markdown: lines.join("\n"), filename };
}

export function renderWikiMarkdown(
  page: WikiPage,
  policy: WikiRenderPolicy,
): MarkdownExportResult {
  const lines: string[] = [];
  lines.push(`# ${normalizeText(page.title) || page.repoFullName}`);
  lines.push("");
  lines.push(`- **Repository**: ${page.repoFullName}`);
  lines.push(`- **Source**: ${page.url}`);
  if (page.sectionPath) {
    lines.push(`- **Section**: ${page.sectionPath}`);
  }
  if (page.indexedCommit) {
    lines.push(`- **Indexed commit**: ${page.indexedCommit}`);
  }
  lines.push(`- **Saved at**: ${formatSavedAt(page.updatedAt)}`);
  lines.push(...(policy.extraMetadataLines?.(page) ?? []));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(page.markdown.trim());
  lines.push("");

  const segments = [page.repoFullName];
  if (
    policy.includeTitleInFilename &&
    page.kind !== "full-wiki" &&
    page.title
  ) {
    segments.push(page.title);
  }
  if (page.sectionPath) {
    segments.push(page.sectionPath);
  }

  const date = new Date(page.updatedAt).toISOString().slice(0, 10);
  const filename = `wikeep-${policy.sourceLabel}-${sanitizeFilename(
    segments.join("-"),
  )}-${date}.md`;

  return { markdown: lines.join("\n"), filename };
}

export function branchFromUrl(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get("branch") ?? undefined;
  } catch {
    return undefined;
  }
}
