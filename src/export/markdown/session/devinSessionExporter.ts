import type { Message } from "../../../shared/types";
import type { SessionMarkdownExporter } from "../shared";
import { renderSessionMarkdown } from "../shared";

function removeThinkingProcessMarkup(message: Message, content: string): string {
  if (message.role !== "assistant") return content;

  // The Devin capture parser already removes collapsed Thinking-process UI.
  // Keep a defensive exporter boundary as well so imported/legacy Devin records
  // containing raw <details> markup cannot leak tool traces into Markdown.
  return content.replace(
    /<details\b[^>]*>[\s\S]*?thinking process[\s\S]*?<\/details>/gi,
    "",
  );
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
