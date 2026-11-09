import { detectLanguage } from "../content/language";
import { TRANSLATION_ATTR } from "../content/renderer";
import { CHAT_CONTAINER_ATTR } from "../content/types";

export interface PageBlock {
  el: HTMLElement;
  /** Concatenated text-node data belonging to this block, in document order. BR elements become "\n". */
  text: string;
  nodes: Text[];
  placement: "inside" | "after";
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "CODE", "PRE"]);
const SKIP_ATTRS = ["contenteditable", TRANSLATION_ATTR, CHAT_CONTAINER_ATTR];
const SKIP_ANCESTOR = SKIP_ATTRS.map((a) => `[${a}]`).join(",");

/**
 * True when `el` itself or any ancestor (however far up, past any scan boundary) is engine-owned, editable or a
 * chat container. A rescan of a newly added chat message starts at that message's own block, so the container
 * attribute lives ABOVE the boundary and the per-text-node walk never reaches it.
 */
export function isForeign(el: Element | null): boolean {
  return !!el && el.closest(SKIP_ANCESTOR) !== null;
}
const INLINE_DISPLAY = new Set(["inline", "contents"]);
// A new sibling of this block's element would become a flex/grid/table item and break the layout
const INSERT_BREAKS = new Set(["flex", "inline-flex", "grid", "inline-grid", "table-row", "table", "table-row-group"]);

// Tags that are UI interactive/landmark – text inside is UI, not content
const INTERACTIVE_TAGS = new Set(["BUTTON", "SUMMARY", "LABEL", "SELECT", "OPTION", "NAV"]);
// ARIA roles that mark UI interactive/landmark elements
const INTERACTIVE_ROLES = new Set([
  "button", "tab", "menuitem", "menuitemcheckbox", "menuitemradio",
  "option", "switch", "checkbox", "radio",
  "navigation", "menu", "menubar", "tablist", "toolbar",
]);

// Class token keywords for sr-only / visually-hidden detection
const SR_ONLY_TOKENS = new Set(["blind", "sr-only", "visually-hidden", "screen-reader", "screenreader", "a11y-hidden", "offscreen"]);

// Class token keywords for UI label heuristics (applied to owner or parent)
const UI_LABEL_TOKENS = new Set([
  "name", "nick", "nickname", "username", "user", "author", "profile", "avatar",
  "date", "time", "timestamp", "badge", "chip", "tag", "label",
  "btn", "button", "menu", "nav", "tab", "breadcrumb",
  "count", "counter", "status",
]);

// Timestamp pattern: matches HH:MM or HH:MM:SS (video timestamp links inside interactive elements)
const TIMESTAMP_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;

// Build hash token pattern: a token that looks like a build hash (all lowercase alphanumeric with digits, length >= 5)
const BUILD_HASH_RE = /^[a-z0-9]{5,}$/;

function isBuildHash(token: string): boolean {
  return BUILD_HASH_RE.test(token) && /\d/.test(token);
}

/**
 * Split a className string into meaningful tokens.
 * Splits by space, then each part further by "_" and "-".
 * Filters out build-hash-looking tokens.
 */
function classTokens(className: string): string[] {
  const tokens: string[] = [];
  for (const part of className.split(/\s+/)) {
    for (const tok of part.split(/[_\-]/)) {
      if (tok && !isBuildHash(tok)) tokens.push(tok.toLowerCase());
    }
  }
  return tokens;
}

/**
 * Returns true if the element has a class token that matches SR-only names.
 * We check each space-separated class name both as-is and after splitting by "_"/"-".
 */
function hasSrOnlyClass(el: HTMLElement): boolean {
  for (const part of el.className.split(/\s+/)) {
    if (!part) continue;
    // Check the whole class name first (handles "sr-only", "visually-hidden", etc.)
    if (SR_ONLY_TOKENS.has(part.toLowerCase())) return true;
    // Also check after splitting by "_" and "-"
    for (const tok of part.split(/[_\-]/)) {
      if (tok && !isBuildHash(tok) && SR_ONLY_TOKENS.has(tok.toLowerCase())) return true;
    }
  }
  return false;
}

/**
 * Returns true if element is visually hidden via computed style (sr-only patterns).
 * Checks: clip rect(0...), clip-path inset(50%/100%), position+tiny-size.
 */
function isStyleHidden(cs: CSSStyleDeclaration): boolean {
  // (b) clip / clip-path
  const clip = cs.clip;
  if (clip && clip !== "auto" && /rect\(\s*0/.test(clip)) return true;
  const clipPath = cs.clipPath;
  if (clipPath && (/inset\(50%/.test(clipPath) || /inset\(100%/.test(clipPath))) return true;
  // (c) position absolute/fixed with tiny computed size
  const pos = cs.position;
  if (pos === "absolute" || pos === "fixed") {
    const w = parseFloat(cs.width);
    const h = parseFloat(cs.height);
    if (!isNaN(w) && !isNaN(h) && w <= 2 && h <= 2) return true;
  }
  return false;
}

/** Returns true if `el` is a UI interactive or landmark element. */
function isInteractiveEl(el: HTMLElement): boolean {
  if (INTERACTIVE_TAGS.has(el.tagName)) return true;
  const role = el.getAttribute("role");
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  return false;
}

/** Count Korean/Japanese characters in a string. */
function koJaCount(text: string): number {
  const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/g;
  const KANA = /[ぁ-ゖゝ-ゞァ-ヺｦ-ﾟ]/g;
  return (text.match(HANGUL) ?? []).length + (text.match(KANA) ?? []).length;
}

/**
 * Returns true if the block should be dropped by short-label heuristics:
 * (a) < 40 chars AND font-weight >= 600 AND owner not H1-H6
 * (b) < 40 chars AND UI label class token on owner or parent
 * (c) < 2 ko/ja chars
 * (d) rect width > 0 AND < 100 (narrow column; in jsdom width is 0 so this won't fire)
 */
function isUILabel(el: HTMLElement, trimmed: string, cs: CSSStyleDeclaration): boolean {
  const len = trimmed.length;
  const isHeading = /^H[1-6]$/.test(el.tagName);

  // (c) fewer than 2 ko/ja characters
  if (koJaCount(trimmed) < 2) return true;

  if (len < 40) {
    // (a) bold non-heading
    if (!isHeading) {
      const fw = cs.fontWeight;
      const fwNum = parseFloat(fw);
      if (!isNaN(fwNum) && fwNum >= 600) return true;
      if (fw === "bold" || fw === "bolder") return true;
    }

    // (b) UI class tokens on owner or parent
    const parentEl = el.parentElement;
    const ownerTokens = classTokens(el.className);
    const parentTokens = parentEl instanceof HTMLElement ? classTokens(parentEl.className) : [];
    const allTokens = [...ownerTokens, ...parentTokens];
    if (allTokens.some((t) => UI_LABEL_TOKENS.has(t))) return true;
  }

  // (d) narrow rect (not active in jsdom since getBoundingClientRect always returns 0x0)
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.width < 100) return true;

  return false;
}

/** A comment that is only an @handle is an account name, not content worth translating. */
const HANDLE_ONLY = /^@\S+$/;

interface WalkStyle {
  display: string;
  visibility: string;
  hidden: boolean; // skipped entirely: engine-owned, editable, non-content tag, or invisible
}

/**
 * Result of classifying a text node:
 * - "skip": exclude entirely
 * - "normal": include in owning block's text nodes  
 * - "timestamp": a video timestamp inside an interactive element; include as text in the nearest outer block
 */
type TextClassification =
  | { kind: "skip" }
  | { kind: "normal"; owner: HTMLElement }
  | { kind: "timestamp"; outerOwner: HTMLElement; timestampText: string };

/**
 * Classify a single text node relative to `boundary`.
 * Returns whether to skip it, include it normally, or treat it as a timestamp.
 */
function classifyText(
  t: Text,
  boundary: ParentNode,
  style: (el: HTMLElement) => WalkStyle,
  getCS: (el: HTMLElement) => CSSStyleDeclaration,
): TextClassification {
  let owner: HTMLElement | null = null; // nearest non-inline ancestor
  let nearestInteractive: HTMLElement | null = null; // nearest interactive ancestor (between t and owner)
  let nearestAnchor: HTMLElement | null = null; // nearest <a> ancestor (between t and owner)

  for (let a: Element | null = t.parentElement; a; a = a.parentElement) {
    if (!(a instanceof HTMLElement)) return { kind: "skip" }; // SVG etc.
    const s = style(a);

    // Check for skip conditions
    if (SKIP_TAGS.has(a.tagName) || SKIP_ATTRS.some((k) => a.hasAttribute(k)) || s.hidden) {
      return { kind: "skip" };
    }
    // Check visually hidden (sr-only)
    if (hasSrOnlyClass(a) || isStyleHidden(getCS(a))) {
      return { kind: "skip" };
    }

    // Track nearest block owner
    if (!owner && !INLINE_DISPLAY.has(s.display)) owner = a;

    // Track nearest interactive ancestor (up to owner)
    if (!nearestInteractive && !owner && isInteractiveEl(a)) {
      nearestInteractive = a;
    }

    // Track nearest anchor ancestor (up to owner)
    if (!nearestAnchor && !owner && a.tagName === "A") {
      nearestAnchor = a;
    }

    if (a === boundary) break;
  }

  if (!owner) return { kind: "skip" };

  // Also check owner itself for interactive/anchor
  if (!nearestInteractive && isInteractiveEl(owner)) nearestInteractive = owner;
  if (!nearestAnchor && owner.tagName === "A") nearestAnchor = owner;

  // Check short <a> link: skip if anchor text < 12 chars
  if (nearestAnchor && !nearestInteractive) {
    const anchorText = nearestAnchor.textContent?.trim() ?? "";
    if (anchorText.length < 12) return { kind: "skip" };
    // Long anchor: include normally
  }

  // Handle interactive elements
  if (nearestInteractive) {
    // Check if the interactive element's whole text content is a timestamp
    const interactiveText = nearestInteractive.textContent?.trim() ?? "";
    if (TIMESTAMP_RE.test(interactiveText)) {
      // Find the outer non-interactive block owner
      let outerOwner: HTMLElement | null = null;
      for (let a: Element | null = nearestInteractive.parentElement; a; a = a.parentElement) {
        if (!(a instanceof HTMLElement)) break;
        if (a === boundary) {
          // The boundary itself is the outer owner if it's not inline
          const s = style(a);
          if (!INLINE_DISPLAY.has(s.display)) outerOwner = a;
          break;
        }
        const s = style(a);
        if (!INLINE_DISPLAY.has(s.display) && !isInteractiveEl(a)) {
          outerOwner = a;
          break;
        }
      }
      if (outerOwner) {
        return { kind: "timestamp", outerOwner, timestampText: interactiveText };
      }
    }
    // Regular interactive UI: skip
    return { kind: "skip" };
  }

  return { kind: "normal", owner };
}

/**
 * Build the text string for a block from its ordered set of text nodes and the element tree,
 * inserting "\n" for each BR element whose nearest non-inline ancestor is `blockEl`.
 *
 * We walk the entire subtree of `blockEl` using SHOW_TEXT | SHOW_ELEMENT and emit:
 * - text node data if that text node is in `ownNodes`
 * - "\n" if element is a BR whose immediate non-inline ancestor is `blockEl`
 *
 * If `prefix` is provided, it is prepended with a single space separator (collapsing any double space).
 */
function buildBlockText(blockEl: HTMLElement, ownNodes: Set<Text>, prefix: string): string {
  const doc = blockEl.ownerDocument!;
  const walker = doc.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const parts: string[] = [];

  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (ownNodes.has(n as Text)) {
        parts.push((n as Text).data);
      }
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const elem = n as HTMLElement;
      if (elem.tagName === "BR") {
        // Include this BR as "\n" if its nearest non-inline ancestor is blockEl
        let brOwner: HTMLElement | null = null;
        for (let a: Element | null = elem.parentElement; a; a = a.parentElement) {
          if (!(a instanceof HTMLElement)) break;
          if (!INLINE_DISPLAY.has(getComputedStyle(a).display)) {
            brOwner = a;
            break;
          }
        }
        if (brOwner === blockEl) {
          parts.push("\n");
        }
      }
    }
  }

  const rawText = parts.join("");
  if (!prefix) return rawText;
  // Join prefix and raw text with a single space, collapsing any leading whitespace from rawText
  return prefix + " " + rawText.trimStart();
}

/**
 * One text block := the nearest non-inline ancestor of each walkable text node. Nested blocks own
 * their own text, so nothing is translated twice; inline elements (span/a) flow into the parent block.
 */
export function findBlocks(root: ParentNode): PageBlock[] {
  if (root instanceof Element && isForeign(root)) return [];
  const styleMap = new Map<HTMLElement, WalkStyle>();
  const csMap = new Map<HTMLElement, CSSStyleDeclaration>();

  const style: (el: HTMLElement) => WalkStyle = (el) => {
    let s = styleMap.get(el);
    if (!s) {
      const c = getComputedStyle(el);
      s = { display: c.display, visibility: c.visibility, hidden: c.display === "none" || c.visibility === "hidden" };
      styleMap.set(el, s);
    }
    return s;
  };

  const getCS: (el: HTMLElement) => CSSStyleDeclaration = (el) => {
    let c = csMap.get(el);
    if (!c) {
      c = getComputedStyle(el);
      csMap.set(el, c);
    }
    return c;
  };

  // Map from block owner element to its owned text nodes (ordered)
  const groups = new Map<HTMLElement, Text[]>();
  // Map from outer block owner to timestamp texts that come from interactive child elements
  const timestampPrefixes = new Map<HTMLElement, string[]>();

  const doc = (root instanceof Document ? root : (root as Element).ownerDocument)!;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const cls = classifyText(t, root, style, getCS);

    if (cls.kind === "skip") continue;

    if (cls.kind === "timestamp") {
      const { outerOwner, timestampText } = cls;
      const prefixes = timestampPrefixes.get(outerOwner) ?? [];
      if (!prefixes.includes(timestampText)) prefixes.push(timestampText);
      timestampPrefixes.set(outerOwner, prefixes);
      continue;
    }

    // cls.kind === "normal"
    const { owner } = cls;
    const nodes = groups.get(owner);
    if (nodes) nodes.push(t);
    else groups.set(owner, [t]);
  }

  const blocks: PageBlock[] = [];

  for (const [el, nodes] of groups) {
    const prefix = (timestampPrefixes.get(el) ?? []).join(" ");
    const ownNodes = new Set(nodes);
    const text = buildBlockText(el, ownNodes, prefix);
    const trimmed = text.trim();

    if (!detectLanguage(trimmed) || HANDLE_ONLY.test(trimmed)) continue;

    const cs = getCS(el);
    if (isUILabel(el, trimmed, cs)) continue;

    const parent = el.parentElement;
    const parentDisplay = parent instanceof HTMLElement ? style(parent).display : "";
    blocks.push({ el, text, nodes, placement: INSERT_BREAKS.has(parentDisplay) ? "inside" : "after" });
  }

  // Handle blocks that have ONLY timestamp prefixes (no own text nodes)
  for (const [el, prefixes] of timestampPrefixes) {
    if (groups.has(el)) continue; // already handled above
    const text = prefixes.join(" ");
    const trimmed = text.trim();
    if (!detectLanguage(trimmed) || HANDLE_ONLY.test(trimmed)) continue;
    const cs = getCS(el);
    if (isUILabel(el, trimmed, cs)) continue;
    const parent = el.parentElement;
    const parentDisplay = parent instanceof HTMLElement ? style(parent).display : "";
    blocks.push({ el, text, nodes: [], placement: INSERT_BREAKS.has(parentDisplay) ? "inside" : "after" });
  }

  return blocks;
}

/**
 * Current text of `el`'s own block, re-read on demand (definition must stay in sync with findBlocks).
 * BR elements belonging to this block are represented as "\n".
 */
export function blockText(el: HTMLElement): string {
  if (isForeign(el)) return "";
  const styleMap = new Map<HTMLElement, WalkStyle>();
  const csMap = new Map<HTMLElement, CSSStyleDeclaration>();

  const style: (el: HTMLElement) => WalkStyle = (elem) => {
    let s = styleMap.get(elem);
    if (!s) {
      const c = getComputedStyle(elem);
      s = { display: c.display, visibility: c.visibility, hidden: c.display === "none" || c.visibility === "hidden" };
      styleMap.set(elem, s);
    }
    return s;
  };

  const getCS: (el: HTMLElement) => CSSStyleDeclaration = (elem) => {
    let c = csMap.get(elem);
    if (!c) {
      c = getComputedStyle(elem);
      csMap.set(elem, c);
    }
    return c;
  };

  const walker = el.ownerDocument!.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const ownNodes = new Set<Text>();
  const timestampPrefixes: string[] = [];

  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const cls = classifyText(t, el, style, getCS);
    if (cls.kind === "skip") continue;
    if (cls.kind === "timestamp") {
      const { outerOwner, timestampText } = cls;
      if (outerOwner === el && !timestampPrefixes.includes(timestampText)) {
        timestampPrefixes.push(timestampText);
      }
      continue;
    }
    // cls.kind === "normal"
    if (cls.owner === el) ownNodes.add(t);
  }

  const prefix = timestampPrefixes.join(" ");
  return buildBlockText(el, ownNodes, prefix);
}

/** Nearest non-inline ancestor of `el` (el itself included). Mutation rescan rounds changed text up to one block. */
export function enclosingBlock(el: Node): HTMLElement | null {
  for (let a: Element | null = el instanceof Element ? el : el.parentElement; a; a = a.parentElement) {
    if (!(a instanceof HTMLElement)) return null;
    if (!INLINE_DISPLAY.has(getComputedStyle(a).display)) return a;
  }
  return null;
}
