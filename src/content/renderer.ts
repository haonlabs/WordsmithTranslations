import type { ChatMessage } from "./types";

export const TRANSLATION_ATTR = "data-wst-translation";

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
  if (node.textContent !== translated) node.textContent = translated;
  return true;
}
