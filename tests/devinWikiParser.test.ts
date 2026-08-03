import { describe, expect, it } from "vitest";
import { buildFullWikiFromDom } from "../src/parser/devinWikiParser";

function wireSectionClicks(entries: Array<{ label: string; body: string }>): void {
  const prose = document.querySelector(".prose-main")!;
  const set = (heading: string, body: string) => () => {
    prose.innerHTML = `<h1>${heading}</h1><p>${body.repeat(60)}</p>`;
  };

  for (const entry of entries) {
    document
      .querySelector(`[aria-label="${entry.label}"]`)
      ?.addEventListener("click", set(entry.label, entry.body));
  }
}

function setupLegacyWrappedDOM(): Document {
  document.body.innerHTML = `
    <div data-slot="sidebar-content">
      <div data-slot="sidebar-menu-button"><button aria-label="Intro"></button></div>
      <div data-slot="sidebar-menu-button"><button aria-label="Architecture"></button></div>
      <div data-slot="sidebar-menu-button"><button aria-label="Settings"></button></div>
    </div>
    <main><div class="prose-main"><h1>Intro</h1><p>${"x ".repeat(60)}</p></div></main>
  `;

  wireSectionClicks([
    { label: "Intro", body: "intro " },
    { label: "Architecture", body: "arch " },
  ]);
  return document;
}

function setupDirectShadcnDOM(): Document {
  document.body.innerHTML = `
    <div data-slot="sidebar-content">
      <button data-slot="sidebar-menu-button" aria-label="Overview"></button>
      <button data-slot="sidebar-menu-sub-button" aria-label="Getting Started: Installation and Setup"></button>
      <button data-slot="sidebar-menu-button" aria-label="Settings"></button>
    </div>
    <main><div class="prose-main"><h1>Overview</h1><p>${"overview ".repeat(60)}</p></div></main>
  `;

  wireSectionClicks([
    { label: "Overview", body: "overview " },
    {
      label: "Getting Started: Installation and Setup",
      body: "setup ",
    },
  ]);
  return document;
}

function currentHeading(): string {
  return document.querySelector(".prose-main h1")?.textContent?.trim() ?? "";
}

describe("buildFullWikiFromDom", () => {
  it("compiles legacy wrapped outline sections and excludes controls", async () => {
    const doc = setupLegacyWrappedDOM();
    const snap = await buildFullWikiFromDom(
      doc,
      "https://app.devin.ai/org/s/wiki/o/r",
    );
    expect(snap).not.toBeNull();
    expect(snap!.kind).toBe("full-wiki");
    expect(snap!.relatedSections).toEqual(["Intro", "Architecture"]);
    expect(snap!.markdown).toContain("Architecture");
  });

  it("supports direct Shadcn menu buttons, nested sections, and encoded org slugs", async () => {
    const doc = setupDirectShadcnDOM();
    const url =
      "https://app.devin.ai/org/%D0%B0%D0%BB%D0%B5%D0%BA%D1%81%D0%B0%D0%BD%D0%B4%D1%80-%D0%B5%D1%80%D0%BE%D1%84%D0%B5%D0%B5%D0%B2-c5c1f593e932/wiki/drunkod/repo-harness?branch=agent%2Fchatgpt-github-create-mvp";

    const snap = await buildFullWikiFromDom(doc, url);

    expect(snap).not.toBeNull();
    expect(snap!.owner).toBe("drunkod");
    expect(snap!.repo).toBe("repo-harness");
    expect(snap!.relatedSections).toEqual([
      "Overview",
      "Getting Started: Installation and Setup",
    ]);
    expect(snap!.url).toBe(`${url}#wikeep-full-wiki`);
  });

  it("keeps Mermaid source when every Devin section is read from fiber", async () => {
    const doc = setupDirectShadcnDOM();
    const markdownByHeading: Record<string, string> = {
      Overview: [
        "# Overview",
        "",
        "Repository overview and execution flow. ".repeat(5),
      ].join("\n"),
      "Getting Started: Installation and Setup": [
        "# Getting Started: Installation and Setup",
        "",
        "Installation details and the setup lifecycle. ".repeat(4),
        "",
        "```mermaid",
        "flowchart LR",
        "  Install --> Configure --> Run",
        "```",
      ].join("\n"),
    };

    const snap = await buildFullWikiFromDom(
      doc,
      "https://app.devin.ai/org/s/wiki/drunkod/repo-harness/page/10?branch=main",
      async () => markdownByHeading[currentHeading()] ?? null,
    );

    expect(snap).not.toBeNull();
    expect(snap!.markdownSource).toBe("fiber");
    expect(snap!.markdown).toContain("```mermaid");
    expect(snap!.markdown).toContain("Install --> Configure --> Run");
    expect(snap!.markdown).not.toContain("Diagram omitted");
    expect(snap!.hasDiagrams).toBe(true);
  });

  it("marks a mixed fiber and DOM full wiki as lossy", async () => {
    document.body.innerHTML = `
      <div data-slot="sidebar-content">
        <button data-slot="sidebar-menu-button" aria-label="Overview"></button>
        <button data-slot="sidebar-menu-button" aria-label="Architecture"></button>
      </div>
      <main><div class="prose-main"><h1>Overview</h1><p>${"overview ".repeat(60)}</p></div></main>
    `;
    const prose = document.querySelector(".prose-main")!;
    document
      .querySelector('[aria-label="Overview"]')
      ?.addEventListener("click", () => {
        prose.innerHTML = `<h1>Overview</h1><p>${"overview ".repeat(60)}</p>`;
      });
    document
      .querySelector('[aria-label="Architecture"]')
      ?.addEventListener("click", () => {
        prose.innerHTML = `<h1>Architecture</h1><p>${"architecture ".repeat(60)}</p><figure><svg width="400" height="300"><rect /></svg></figure>`;
      });

    const snap = await buildFullWikiFromDom(
      document,
      "https://app.devin.ai/org/s/wiki/drunkod/repo-harness",
      async () =>
        currentHeading() === "Overview"
          ? `# Overview\n\n${"Rich overview source. ".repeat(10)}`
          : null,
    );

    expect(snap).not.toBeNull();
    expect(snap!.markdownSource).toBe("dom");
    expect(snap!.markdown).toContain("Diagram omitted");
    expect(snap!.hasDiagrams).toBe(true);
  });
});
