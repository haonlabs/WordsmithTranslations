import { detectLanguage } from "../content/language";
import { TRANSLATION_ATTR } from "../content/renderer";
import type { BlockLine } from "./blocks";

/** Ties line nodes to the block that owns them, so a re-render (or stop) removes exactly its own nodes. */
export const BLOCK_ATTR = "data-wst-block";
// "0:02:46 " at the start of a line: already visible on the original line just above the translation
const LEADING_TIME = /^\s*\d{1,2}:\d{2}(:\d{2})?\s*/;

export function clearLines(host: HTMLElement, id: string): void {
  host.querySelectorAll(`[${BLOCK_ATTR}="${id}"]`).forEach((n) => n.remove());
}

/**
 * Multi-line text (lines split by <br>, e.g. a timestamp list): put each translated line directly UNDER its own
 * source line, i.e. right after the <br> that ends it (the last line goes at the end of the block), instead of one
 * separate block under the whole text. The page's own text nodes are never touched. Lines with nothing to translate
 * get no node. Returns false (and renders nothing) when the line counts don't match: the caller falls back to a
 * single block.
 */
export function renderLines(host: HTMLElement, id: string, lines: BlockLine[], translated: string[], dark: boolean): boolean {
  if (lines.length !== translated.length) return false;
  clearLines(host, id);
  let first = true;
  lines.forEach((line, i) => {
    if (detectLanguage(line.text) === null) return; // emoji / numbers / English only: nothing to translate here
    let en = (translated[i] ?? "").trim();
    if (LEADING_TIME.test(line.text)) en = en.replace(LEADING_TIME, "");
    if (!en) return;
    const node = host.ownerDocument.createElement("div");
    node.setAttribute(TRANSLATION_ATTR, "true");
    node.setAttribute("data-wst-page", "true"); // stop() removes everything carrying this
    node.setAttribute(BLOCK_ATTR, id);
    node.setAttribute("data-wst-line", first ? "first" : "next"); // only the first line shows the EN chip
    first = false;
    node.dataset.wstTheme = dark ? "dark" : "light";
    node.textContent = en;
    if (line.br) line.br.after(node);
    else host.appendChild(node);
  });
  return true;
}
