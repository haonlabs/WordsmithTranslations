import { detectLanguage } from "../content/language";
import { TRANSLATION_ATTR } from "../content/renderer";
import { CHAT_CONTAINER_ATTR } from "../content/types";

export interface PageBlock {
  el: HTMLElement;
  /** Concatenated text-node data belonging to this block, in document order. */
  text: string;
  nodes: Text[];
  placement: "inside" | "after";
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "CODE", "PRE"]);
const SKIP_ATTRS = ["contenteditable", TRANSLATION_ATTR, CHAT_CONTAINER_ATTR];
const INLINE_DISPLAY = new Set(["inline", "contents"]);
// A new sibling of this block's element would become a flex/grid/table item and break the layout
const INSERT_BREAKS = new Set(["flex", "inline-flex", "grid", "inline-grid", "table-row", "table", "table-row-group"]);

function styleCache(): (el: HTMLElement) => CSSStyleDeclaration {
  const cache = new Map<HTMLElement, CSSStyleDeclaration>();
  return (el) => {
    let s = cache.get(el);
    if (!s) {
      s = getComputedStyle(el);
      cache.set(el, s);
    }
    return s;
  };
}

interface WalkStyle {
  display: string;
  visibility: string;
  hidden: boolean; // skipped entirely: engine-owned, editable, non-content tag, or invisible
}

/** Ancestor walk shared by the scan and the re-read. Checks every ancestor up to and including `boundary`. */
function walkUp(
  t: Text,
  boundary: ParentNode,
  style: (el: HTMLElement) => WalkStyle,
): { owner: HTMLElement | null; ignored: boolean } {
  let owner: HTMLElement | null = null;
  let ignored = false;
  for (let a: Element | null = t.parentElement; a; a = a.parentElement) {
    if (!(a instanceof HTMLElement)) break; // e.g. SVG internals: not page text
    const s = style(a);
    if (!ignored && (SKIP_TAGS.has(a.tagName) || SKIP_ATTRS.some((k) => a.hasAttribute(k)) || s.hidden)) ignored = true;
    // nearest ancestor that is not inline (incl. the boundary itself) is the block that owns the text
    if (!owner && !INLINE_DISPLAY.has(s.display)) owner = a;
    if (a === boundary) break;
  }
  return { owner, ignored };
}

/**
 * One text block := the nearest non-inline ancestor of each walkable text node. Nested blocks own
 * their own text, so nothing is translated twice; inline elements (span/a) flow into the parent block.
 */
/** A comment that is only an @handle is an account name, not content worth translating. */
const HANDLE_ONLY = /^@\S+$/;

export function findBlocks(root: ParentNode): PageBlock[] {
  const cache = new Map<HTMLElement, WalkStyle>();
  const style: (el: HTMLElement) => WalkStyle = (el) => {
    let s = cache.get(el);
    if (!s) {
      const c = getComputedStyle(el);
      s = { display: c.display, visibility: c.visibility, hidden: c.display === "none" || c.visibility === "hidden" };
      cache.set(el, s);
    }
    return s;
  };

  const groups = new Map<HTMLElement, Text[]>();
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const { owner, ignored } = walkUp(t, root, style);
    if (ignored || !owner) continue;
    const nodes = groups.get(owner);
    if (nodes) nodes.push(t);
    else groups.set(owner, [t]);
  }

  const blocks: PageBlock[] = [];
  for (const [el, nodes] of groups) {
    const text = nodes.map((n) => n.data).join("");
    const trimmed = text.trim();
    if (!detectLanguage(trimmed) || HANDLE_ONLY.test(trimmed)) continue; // no ko/ja, or just an @handle
    const parent = el.parentElement;
    const parentDisplay = parent instanceof HTMLElement ? style(parent).display : "";
    blocks.push({ el, text, nodes, placement: INSERT_BREAKS.has(parentDisplay) ? "inside" : "after" });
  }
  return blocks;
}

/**
 * Current text of `el`'s own block, re-read on demand (definition must stay in sync with findBlocks:
 * only text nodes whose nearest non-inline ancestor is `el` count; engine-owned/invisible ones never do).
 */
export function blockText(el: HTMLElement): string {
  const cache = new Map<HTMLElement, WalkStyle>();
  const style: (el: HTMLElement) => WalkStyle = (el) => {
    let s = cache.get(el);
    if (!s) {
      const c = getComputedStyle(el);
      s = { display: c.display, visibility: c.visibility, hidden: c.display === "none" || c.visibility === "hidden" };
      cache.set(el, s);
    }
    return s;
  };
  const walker = el.ownerDocument!.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const { owner, ignored } = walkUp(t, el, style);
    if (ignored || owner !== el) continue;
    parts.push(t.data);
  }
  return parts.join("");
}

/** Nearest non-inline ancestor of `el` (el itself included). Mutation rescan rounds changed text up to one block. */
export function enclosingBlock(el: Node): HTMLElement | null {
  for (let a: Element | null = el instanceof Element ? el : el.parentElement; a; a = a.parentElement) {
    if (!(a instanceof HTMLElement)) return null;
    if (!INLINE_DISPLAY.has(getComputedStyle(a).display)) return a;
  }
  return null;
}
