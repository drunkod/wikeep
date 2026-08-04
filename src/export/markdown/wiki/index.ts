import type { WikiPage, WikiPageSource } from "../../../shared/types";
import type { MarkdownExportResult, WikiMarkdownExporter } from "../shared";
import { deepwikiWikiExporter } from "./deepwikiWikiExporter";
import { devinWikiExporter } from "./devinWikiExporter";

export const wikiMarkdownExporters: Record<
  WikiPageSource,
  WikiMarkdownExporter
> = {
  "deepwiki-wiki": deepwikiWikiExporter,
  "devin-wiki": devinWikiExporter,
};

export function exportWikiMarkdown(page: WikiPage): MarkdownExportResult {
  return wikiMarkdownExporters[page.source].export(page);
}
