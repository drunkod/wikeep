import type { SessionMarkdownExporter } from "../shared";
import { renderSessionMarkdown } from "../shared";

export const deepwikiSessionExporter: SessionMarkdownExporter = {
  export(conversation, messages) {
    return renderSessionMarkdown(conversation, messages, {
      sourceLabel: "deepwiki",
      includeMessageSources: true,
      extraMetadataLines: () => ["- **Platform**: DeepWiki"],
    });
  },
};
