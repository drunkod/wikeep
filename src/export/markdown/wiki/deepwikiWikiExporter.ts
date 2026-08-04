import type { WikiMarkdownExporter } from "../shared";
import { renderWikiMarkdown } from "../shared";

export const deepwikiWikiExporter: WikiMarkdownExporter = {
  export(page) {
    return renderWikiMarkdown(page, {
      sourceLabel: "deepwiki",
      includeTitleInFilename: false,
    });
  },
};
