import type {
  Conversation,
  ConversationSource,
  Message,
} from "../../../shared/types";
import type {
  MarkdownExportResult,
  SessionMarkdownExporter,
} from "../shared";
import { deepwikiSessionExporter } from "./deepwikiSessionExporter";
import { devinSessionExporter } from "./devinSessionExporter";

export const sessionMarkdownExporters: Record<
  ConversationSource,
  SessionMarkdownExporter
> = {
  deepwiki: deepwikiSessionExporter,
  devin: devinSessionExporter,
};

export function exportSessionMarkdown(
  conversation: Conversation,
  messages: Message[],
): MarkdownExportResult {
  return sessionMarkdownExporters[conversation.source].export(
    conversation,
    messages,
  );
}
