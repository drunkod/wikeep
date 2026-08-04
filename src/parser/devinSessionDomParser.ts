import { UI_TEXT_FILTER } from "../shared/constants";
import type { CapturePayload, ParsedMessage } from "../shared/types";
import { normalizeText } from "../shared/utils";
import { elementToMarkdown } from "./htmlToMarkdown";

const TURN_SELECTOR = [
  "[data-query-display]",
  '[data-testid*="conversation-turn" i]',
  '[data-testid*="query-display" i]',
  '[data-testid*="message-pair" i]',
  "article[data-query-id]",
].join(", ");

const USER_SELECTOR = [
  '[data-message-author-role="user"]',
  '[data-role="user"]',
  '[data-testid*="user-message" i]',
  '[aria-label*="user message" i]',
].join(", ");

const ASSISTANT_SELECTOR = [
  '[data-message-author-role="assistant"]',
  '[data-role="assistant"]',
  '[data-testid*="assistant-message" i]',
  '[data-testid*="answer" i]',
  '[data-testid*="response" i]',
  '[aria-label*="assistant message" i]',
  "[data-response-content]",
  ".prose",
  '[class*="prose"]',
].join(", ");

const CONTROL_TEXT_PATTERNS = [
  /^thinking process(?:\s*\([^)]*\))?$/i,
  /^(?:expand|collapse|copy|copied!|show more|show less)$/i,
  /^(?:[↕↑↓]\s*)?(?:all\s+)?\d+\s+lines?$/i,
];

interface SessionTurn {
  user: ParsedMessage;
  assistant?: ParsedMessage;
}

interface DomTurnMatch {
  root: HTMLElement;
  userElement: HTMLElement | null;
  nextUserElement: HTMLElement | null;
}

export interface DevinSessionDomEnrichment {
  snapshot: CapturePayload;
  apiAssistantCount: number;
  domAssistantCount: number;
  completedTurnCount: number;
  capturedAssistantCount: number;
}

function removeControlCharacters(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function cleanSessionText(value: string): string {
  return normalizeText(removeControlCharacters(value));
}

function comparableText(value: string): string {
  return cleanSessionText(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function elementText(element: Element | null): string {
  if (!element) return "";
  const htmlElement = element as HTMLElement;
  return cleanSessionText(htmlElement.innerText || element.textContent || "");
}

function isVisible(element: Element): boolean {
  let current: Element | null = element;
  const view = element.ownerDocument.defaultView;

  while (current) {
    if (
      current.hasAttribute("hidden") ||
      current.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }

    if (view) {
      const style = view.getComputedStyle(current);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse"
      ) {
        return false;
      }
    }

    current = current.parentElement;
  }

  return true;
}

function buildApiTurns(messages: ParsedMessage[]): SessionTurn[] {
  const turns: SessionTurn[] = [];
  let current: SessionTurn | null = null;

  for (const message of [...messages].sort((a, b) => a.order - b.order)) {
    if (message.role === "user") {
      current = { user: message };
      turns.push(current);
      continue;
    }

    if (message.role === "assistant" && current && !current.assistant) {
      current.assistant = message;
    }
  }

  return turns;
}

function findSmallestTextMatch(
  root: ParentNode,
  value: string,
): HTMLElement | null {
  const target = comparableText(value);
  if (!target) return null;

  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      "p, div, article, section, li, blockquote, pre, span",
    ),
  ).filter((element) => {
    if (!isVisible(element)) return false;
    const text = comparableText(elementText(element));
    return text === target || text.includes(target);
  });

  candidates.sort((left, right) => {
    const leftText = comparableText(elementText(left));
    const rightText = comparableText(elementText(right));
    const leftExact = leftText === target ? 0 : 1;
    const rightExact = rightText === target ? 0 : 1;
    return (
      leftExact - rightExact ||
      leftText.length - rightText.length ||
      left.querySelectorAll("*").length - right.querySelectorAll("*").length
    );
  });

  return candidates[0] ?? null;
}

function findUserElement(root: HTMLElement, userText: string): HTMLElement | null {
  const semantic = Array.from(
    root.querySelectorAll<HTMLElement>(USER_SELECTOR),
  ).find((element) => isVisible(element));
  if (semantic) return semantic;

  return findSmallestTextMatch(root, userText);
}

function findLegacyAnswerElement(root: HTMLElement): HTMLElement | null {
  if (!root.hasAttribute("data-query-display")) return null;

  const leftColumn = root.children.item(0) as HTMLElement | null;
  const contentWrapper = leftColumn?.firstElementChild as HTMLElement | null;
  const answerElement = contentWrapper?.children.item(2) as HTMLElement | null;
  return answerElement && isVisible(answerElement) ? answerElement : null;
}

function follows(left: Node, right: Node): boolean {
  return Boolean(
    left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

function findAssistantElement(
  root: HTMLElement,
  userElement: HTMLElement | null,
): HTMLElement | null {
  const legacy = findLegacyAnswerElement(root);
  if (legacy && (!userElement || !legacy.contains(userElement))) {
    return legacy;
  }

  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(ASSISTANT_SELECTOR),
  ).filter((element) => {
    if (!isVisible(element) || element === root) return false;
    if (
      userElement &&
      (element.contains(userElement) || !follows(userElement, element))
    ) {
      return false;
    }
    return elementText(element).length > 0;
  });

  candidates.sort((left, right) => {
    const score = (element: HTMLElement) =>
      elementText(element).length +
      element.querySelectorAll("pre").length * 2_000 +
      element.querySelectorAll("h1, h2, h3, h4").length * 500;
    return score(right) - score(left);
  });

  return candidates[0] ?? null;
}

function findTurnRoots(document: Document): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const roots: HTMLElement[] = [];

  for (const element of document.querySelectorAll<HTMLElement>(TURN_SELECTOR)) {
    if (!isVisible(element) || seen.has(element)) continue;
    seen.add(element);
    roots.push(element);
  }

  return roots;
}

function deriveTurnRoot(
  userElement: HTMLElement,
  nextUserElement: HTMLElement | null,
): HTMLElement {
  let current = userElement.parentElement;
  let fallback = current ?? userElement;
  let hops = 0;

  while (current && hops < 10) {
    if (nextUserElement && current.contains(nextUserElement)) break;

    fallback = current;
    const hasAnswerCandidate =
      !!findLegacyAnswerElement(current) ||
      Array.from(current.querySelectorAll<HTMLElement>(ASSISTANT_SELECTOR)).some(
        (candidate) =>
          candidate !== current &&
          !candidate.contains(userElement) &&
          follows(userElement, candidate) &&
          elementText(candidate).length >= 40,
      );

    if (
      current.matches(
        "article, section, [data-query-display], [data-testid*='turn' i], [data-testid*='query' i]",
      ) ||
      hasAnswerCandidate
    ) {
      return current;
    }

    current = current.parentElement;
    hops += 1;
  }

  return fallback;
}

function matchTurn(
  document: Document,
  roots: HTMLElement[],
  userText: string,
  nextUserText?: string,
): DomTurnMatch | null {
  const target = comparableText(userText);
  const matchingRoots = roots.filter((root) =>
    comparableText(elementText(root)).includes(target),
  );

  matchingRoots.sort(
    (left, right) => elementText(left).length - elementText(right).length,
  );

  const root = matchingRoots[0];
  if (root) {
    return {
      root,
      userElement: findUserElement(root, userText),
      nextUserElement: nextUserText
        ? findSmallestTextMatch(root, nextUserText)
        : null,
    };
  }

  const userElement = findSmallestTextMatch(document, userText);
  if (!userElement) return null;
  const nextUserElement = nextUserText
    ? findSmallestTextMatch(document, nextUserText)
    : null;

  return {
    root: deriveTurnRoot(userElement, nextUserElement),
    userElement,
    nextUserElement,
  };
}

function isControlText(value: string): boolean {
  const text = cleanSessionText(value);
  return (
    UI_TEXT_FILTER.has(text) ||
    CONTROL_TEXT_PATTERNS.some((pattern) => pattern.test(text))
  );
}

function sanitizeAssistantRoot(root: HTMLElement): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;

  clone
    .querySelectorAll(
      "script, style, noscript, button, svg, input, textarea, select, [hidden], [aria-hidden='true']",
    )
    .forEach((element) => element.remove());

  for (const details of clone.querySelectorAll("details")) {
    const summary = details.querySelector("summary");
    if (/thinking process/i.test(elementText(summary))) {
      details.remove();
    }
  }

  for (const element of clone.querySelectorAll<HTMLElement>(
    "span, div, p, a, summary",
  )) {
    if (element.children.length === 0 && isControlText(elementText(element))) {
      element.remove();
    }
  }

  return clone;
}

function cloneRangeAfterUser(match: DomTurnMatch): HTMLElement | null {
  if (!match.userElement) return null;

  try {
    const range = match.root.ownerDocument.createRange();
    range.setStartAfter(match.userElement);
    if (
      match.nextUserElement &&
      match.root.contains(match.nextUserElement) &&
      follows(match.userElement, match.nextUserElement)
    ) {
      range.setEndBefore(match.nextUserElement);
    } else {
      range.setEnd(match.root, match.root.childNodes.length);
    }

    const wrapper = match.root.ownerDocument.createElement("div");
    wrapper.append(range.cloneContents());
    return wrapper;
  } catch {
    return null;
  }
}

function appendMissingCodeBlocks(
  markdown: string,
  turnRoot: HTMLElement,
): string {
  const blocks: string[] = [];

  for (const pre of turnRoot.querySelectorAll<HTMLElement>("pre")) {
    const text = cleanSessionText(pre.textContent ?? "");
    if (!text || markdown.includes(text)) continue;

    const wrapper = turnRoot.ownerDocument.createElement("div");
    wrapper.append(sanitizeAssistantRoot(pre));
    const converted = cleanSessionText(elementToMarkdown(wrapper));
    if (converted && !blocks.includes(converted)) blocks.push(converted);
  }

  return blocks.length > 0
    ? cleanSessionText(`${markdown}\n\n${blocks.join("\n\n")}`)
    : markdown;
}

function extractAssistantMarkdown(match: DomTurnMatch): string {
  const assistant = findAssistantElement(match.root, match.userElement);
  const source = assistant ?? cloneRangeAfterUser(match);
  if (!source) return "";

  const markdown = cleanSessionText(
    elementToMarkdown(sanitizeAssistantRoot(source)),
  );
  if (!markdown) return "";

  return appendMissingCodeBlocks(markdown, match.root);
}

function plainMarkdownText(value: string): string {
  return comparableText(
    value
      .replace(/```[\s\S]*?```/g, (block) =>
        block.replace(/```[^\n]*\n?|```/g, ""),
      )
      .replace(/[`*_>#-]/g, " "),
  );
}

function chooseAssistantContent(apiContent: string, domContent: string): string {
  const api = cleanSessionText(apiContent);
  const dom = cleanSessionText(domContent);
  if (!dom) return api;
  if (!api) return dom;

  const apiPlain = plainMarkdownText(api);
  const domPlain = plainMarkdownText(dom);
  const domHasCode = /```/.test(dom);
  const apiHasCode = /```/.test(api);

  if (domHasCode && !apiHasCode) return dom;
  if (domPlain.includes(apiPlain)) return dom;
  if (apiPlain.includes(domPlain) && !domHasCode) return api;
  return domPlain.length >= apiPlain.length ? dom : api;
}

function externalAssistantId(user: ParsedMessage, turnIndex: number): string {
  if (user.externalId?.endsWith(":user")) {
    return `${user.externalId.slice(0, -5)}:assistant`;
  }
  return `devin-dom:${turnIndex}:assistant`;
}

/**
 * Enrich the authenticated Devin API snapshot with the transcript currently
 * rendered on screen. The API remains authoritative for title, repositories,
 * message IDs, citations and pending state; the DOM supplies assistant answers
 * and fenced code blocks when the API response stream is incomplete.
 */
export function enrichDevinSessionSnapshotFromDom(
  document: Document,
  apiSnapshot: CapturePayload,
  completedTurnCount: number,
): DevinSessionDomEnrichment {
  const turns = buildApiTurns(apiSnapshot.messages);
  const roots = findTurnRoots(document);
  const messages: ParsedMessage[] = [];
  let apiAssistantCount = 0;
  let domAssistantCount = 0;

  turns.forEach((turn, index) => {
    const user: ParsedMessage = {
      ...turn.user,
      content: cleanSessionText(turn.user.content),
      order: messages.length,
    };
    messages.push(user);

    if (turn.assistant?.content) apiAssistantCount += 1;

    const match = matchTurn(
      document,
      roots,
      user.content,
      turns[index + 1]?.user.content,
    );
    const domContent = match ? extractAssistantMarkdown(match) : "";
    if (domContent) domAssistantCount += 1;

    const content = chooseAssistantContent(
      turn.assistant?.content ?? "",
      domContent,
    );
    if (!content) return;

    messages.push({
      role: "assistant",
      content,
      order: messages.length,
      externalId:
        turn.assistant?.externalId ?? externalAssistantId(user, index),
      sourceNodeKey:
        turn.assistant?.sourceNodeKey ?? match?.root.id ?? undefined,
      metadata: turn.assistant?.metadata,
    });
  });

  const capturedAssistantCount = messages.filter(
    (message) => message.role === "assistant" && !!message.content,
  ).length;

  return {
    snapshot: {
      ...apiSnapshot,
      messages,
    },
    apiAssistantCount,
    domAssistantCount,
    completedTurnCount,
    capturedAssistantCount,
  };
}
