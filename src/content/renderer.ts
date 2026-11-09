import type { ChatMessage } from "./types";

export const TRANSLATION_ATTR = "data-wst-translation";

/** Light message text means a dark chat background (and vice versa). Unknown colors assume dark. */
function chatIsDark(el: Element): boolean {
  const m = getComputedStyle(el).color.match(/[\d.]+/g);
  if (!m || m.length < 3) return true;
  const [r, g, b] = m.map(Number) as [number, number, number];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}

/**
 * Append (or update) the translation node under the message. Returns false when the result is stale:
 * node removed from the DOM, or the platform reused it for different text.
 * Always textContent, never innerHTML. The EN tag comes from content.css (::before).
 */
export function render(msg: ChatMessage, translated: string): boolean {
  const { host, sourceElement } = msg;
  if (!host.isConnected || !sourceElement.isConnected) return false;
  if (sourceElement.textContent !== msg.sourceText) return false;

  let node = host.querySelector<HTMLElement>(`:scope > [${TRANSLATION_ATTR}]`);
  if (!node) {
    node = host.ownerDocument.createElement("div");
    node.setAttribute(TRANSLATION_ATTR, "true");
    host.appendChild(node);
  }
  node.dataset.wstTheme = chatIsDark(sourceElement) ? "dark" : "light"; // content.css picks the contrast-safe blue
  if (node.textContent !== translated) node.textContent = translated;
  return true;
}
