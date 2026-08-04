import type { Message } from "../../../shared/types";
import type { SessionMarkdownExporter } from "../shared";
import { renderSessionMarkdown } from "../shared";

const DETAILS_BLOCK_PATTERN = /<details\b[^>]*>[\s\S]*?<\/details>/gi;
const IMMEDIATE_SUMMARY_PATTERN =
  /^<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/i;

function summaryText(detailsBlock: string): string | null {
  const match = detailsBlock.match(IMMEDIATE_SUMMARY_PATTERN);
  if (!match) return null;

  return match[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeThinkingProcessMarkup(message: Message, content: string): string {
  if (message.role !== "assistant") return content;

  // The Devin capture parser already removes collapsed Thinking-process UI.
  // Keep a defensive exporter boundary for imported/legacy records, but inspect
  // each details block independently so an unrelated neighboring disclosure is
  // never consumed together with the Thinking-process block.
  return content.replace(DETAILS_BLOCK_PATTERN, (detailsBlock) => {
    const summary = summaryText(detailsBlock);
    return summary && /\bthinking\s+process\b/i.test(summary)
      ? ""
      : detailsBlock;
  });
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
