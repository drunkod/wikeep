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
});
