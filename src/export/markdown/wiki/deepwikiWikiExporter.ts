import type { WikiPage } from "../../../shared/types";
import type { WikiMarkdownExporter } from "../shared";
import { renderWikiMarkdown } from "../shared";

function deepwikiMetadata(page: WikiPage): string[] {
  const lines = ["- **Platform**: DeepWiki"];
  if (page.markdownSource === "rsc") {
    lines.push("- **Capture source**: RSC stream");
  } else if (page.markdownSource === "dom") {
    lines.push("- **Capture source**: Rendered DOM");
  }
  return lines;
}

export const deepwikiWikiExporter: WikiMarkdownExporter = {
  export(page) {
    return renderWikiMarkdown(page, {
      sourceLabel: "deepwiki",
      includeTitleInFilename: false,
      extraMetadataLines: deepwikiMetadata,
    });
  },
};
