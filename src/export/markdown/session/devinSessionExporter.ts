import type { SessionMarkdownExporter } from "../shared";
import { renderSessionMarkdown } from "../shared";

export const devinSessionExporter: SessionMarkdownExporter = {
  export(conversation, messages) {
    return renderSessionMarkdown(conversation, messages, {
      sourceLabel: "devin",
      includeMessageSources: true,
    });
  },
};
