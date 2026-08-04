import type { Message } from "../../../shared/types";
import type { SessionMarkdownExporter } from "../shared";
import { renderSessionMarkdown } from "../shared";

const DETAILS_TAG_PATTERN = /<\/?details\b[^>]*>/gi;
const IMMEDIATE_SUMMARY_PATTERN =
  /^\s*<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/i;

interface DetailsRange {
  start: number;
  openEnd: number;
  end: number;
}

function findDetailsRanges(content: string): DetailsRange[] {
  const stack: Array<Pick<DetailsRange, "start" | "openEnd">> = [];
  const ranges: DetailsRange[] = [];

  for (const match of content.matchAll(DETAILS_TAG_PATTERN)) {
    const index = match.index;
    if (index === undefined) continue;

    if (/^<details\b/i.test(match[0])) {
      stack.push({ start: index, openEnd: index + match[0].length });
      continue;
    }

    const opening = stack.pop();
    if (!opening) continue;

    ranges.push({
      ...opening,
      end: index + match[0].length,
    });
  }

  return ranges;
}

function summaryText(content: string, range: DetailsRange): string | null {
  const body = content.slice(range.openEnd, range.end);
  const match = body.match(IMMEDIATE_SUMMARY_PATTERN);
  if (!match) return null;

  return match[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeRanges(content: string, ranges: DetailsRange[]): string {
  let result = content;

  for (const range of [...ranges].sort((left, right) => right.start - left.start)) {
    result = result.slice(0, range.start) + result.slice(range.end);
  }

  return result;
}

function removeThinkingProcessMarkup(message: Message, content: string): string {
  if (message.role !== "assistant") return content;

  // The Devin capture parser already removes collapsed Thinking-process UI.
  // Keep a defensive exporter boundary for imported/legacy records. A balanced
  // details-tag scan is used instead of a lazy block regex so nested disclosures
  // cannot truncate a Thinking-process block or consume following visible text.
  const thinkingRanges = findDetailsRanges(content)
    .filter((range) => {
      const summary = summaryText(content, range);
      return !!summary && /\bthinking\s+process\b/i.test(summary);
    })
    .sort((left, right) => left.start - right.start || right.end - left.end);

  // If both a parent and a nested child are marked as Thinking process, removing
  // the parent already removes the child. Keep only the outermost marked ranges.
  const outermostRanges: DetailsRange[] = [];
  for (const range of thinkingRanges) {
    const containingRange = outermostRanges.at(-1);
    if (
      containingRange &&
      range.start >= containingRange.start &&
      range.end <= containingRange.end
    ) {
      continue;
    }
    outermostRanges.push(range);
  }

  return removeRanges(content, outermostRanges);
}

export const devinSessionExporter: SessionMarkdownExporter = {
  export(conversation, messages) {
    return renderSessionMarkdown(conversation, messages, {
      sourceLabel: "devin",
      includeMessageSources: true,
      extraMetadataLines: () => ["- **Platform**: Devin"],
      transformMessageContent: removeThinkingProcessMarkup,
    });
  },
};
