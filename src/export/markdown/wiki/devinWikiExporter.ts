import type { WikiMarkdownExporter } from "../shared";
import { renderWikiMarkdown } from "../shared";

export const devinWikiExporter: WikiMarkdownExporter = {
  export(page) {
    return renderWikiMarkdown(page, {
      sourceLabel: "devin",
      includeTitleInFilename: true,
    });
  },
};
