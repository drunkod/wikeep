import type { WikiPage } from "../../../shared/types";
import type { WikiMarkdownExporter } from "../shared";
import { branchFromUrl, renderWikiMarkdown } from "../shared";

function devinMetadata(page: WikiPage): string[] {
  const lines = ["- **Platform**: Devin"];
  const branch = branchFromUrl(page.url);
  if (branch) {
    lines.push(`- **Branch**: ${branch}`);
  }

  if (page.markdownSource === "fiber") {
    lines.push("- **Capture source**: React fiber");
  } else if (page.markdownSource === "dom") {
    lines.push("- **Capture source**: Rendered DOM");
  }
  return lines;
}

export const devinWikiExporter: WikiMarkdownExporter = {
  export(page) {
    return renderWikiMarkdown(page, {
      sourceLabel: "devin",
      includeTitleInFilename: true,
      extraMetadataLines: devinMetadata,
    });
  },
};
