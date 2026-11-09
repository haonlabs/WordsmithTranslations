import { detectLanguage } from "../content/language";
import { TRANSLATION_ATTR } from "../content/renderer";
import { CHAT_CONTAINER_ATTR } from "../content/types";

export interface PageBlock {
  /** content: translated inline under the text. ui: shown as a floating label next to `el` (never in-flow). */
  kind: "content" | "ui";
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

// Tags that are UI interactive/landmark – text inside becomes a floating label, not content
const INTERACTIVE_TAGS = new Set(["BUTTON", "SUMMARY", "LABEL", "NAV"]);
// ARIA roles that mark UI interactive/landmark elements
const INTERACTIVE_ROLES = new Set([
  "button", "tab", "menuitem", "menuitemcheckbox", "menuitemradio",
  "option", "switch", "checkbox", "radio",
  "navigation", "menu", "menubar", "tablist", "toolbar",
]);

// Class token keywords for sr-only / visually-hidden detection
const SR_ONLY_TOKENS = new Set(["blind", "sr-only", "visually-hidden", "screen-reader", "screenreader", "a11y-hidden", "offscreen"]);

// Class token keywords for things that are NOT UI to translate (people, dates, counts) — short text on
// an element with one of these tokens is skipped entirely
const SKIP_LABEL_TOKENS = new Set([
  "name", "nick", "nickname", "username", "user", "author", "profile", "avatar",
  "date", "time", "timestamp", "count", "counter",
]);

// Class token keywords for UI label heuristics (applied to owner or parent)
const UI_TOKENS = new Set(["btn", "button", "menu", "nav", "tab", "breadcrumb", "label", "tag", "chip", "status", "badge"]);

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
 * Returns true if the block should become a floating `ui` label instead of inline content:
 * (a) < 40 chars AND font-weight >= 600 AND not H1-H6
 * (b) < 40 chars AND UI label class token on owner or parent
 * (d) rect width > 0 AND < 100 (narrow column; in jsdom width is 0 so this won't fire)
 */
function isUiCandidate(el: HTMLElement, trimmed: string, cs: CSSStyleDeclaration): boolean {
  const len = trimmed.length;
  const isHeading = /^H[1-6]$/.test(el.tagName);

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
    if ([...ownerTokens, ...parentTokens].some((t) => UI_TOKENS.has(t))) return true;
  }

  // (d) narrow rect (not active in jsdom since getBoundingClientRect always returns 0x0)
  const rect = el.getBoundingClientRect();
  if (rect.width > 0 && rect.width < 100) return true;

  return false;
}

/** Short text (< 40 chars) on owner/parent carrying a name/date/count token is skipped entirely. */
function hasSkipLabelToken(el: HTMLElement, trimmed: string): boolean {
  if (trimmed.length >= 40) return false;
  let a: Element | null = el;
  for (let i = 0; a && i <= TOKEN_REACH; i++, a = a.parentElement) {
    if (a instanceof HTMLElement && classTokens(a.className).some((t) => SKIP_LABEL_TOKENS.has(t))) return true;
  }
  return false;
}

/** True for elements whose text should surface as a floating label (interactive/landmark or a short anchor). */
function isUiLabelEl(el: HTMLElement): boolean {
  if (el.tagName === "A") return ((el.textContent ?? "").trim().length < 12);
  return el.tagName === "BUTTON" || el.tagName === "SUMMARY" || el.tagName === "LABEL" || el.tagName === "NAV"
    || (!!el.getAttribute("role") && INTERACTIVE_ROLES.has(el.getAttribute("role")!));
}

/** True when any element from `t` up to (and including) `stop` carries a name/date/count class token. */
// How many ancestors above the block owner still count as "this is a name/date/count": the token usually sits on a
// wrapper (e.g. <button class="_nickname_…"><span class="_text_…">name</span></button>), not on the text's own span.
const TOKEN_REACH = 4;

function chainHasSkipToken(t: Text, stop: HTMLElement): boolean {
  let beyond = 0;
  let passed = false;
  for (let a: Element | null = t.parentElement; a; a = a.parentElement) {
    if (a instanceof HTMLElement && classTokens(a.className).some((tok) => SKIP_LABEL_TOKENS.has(tok))) return true;
    if (a === stop) passed = true;
    else if (passed && ++beyond >= TOKEN_REACH) break;
  }
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
 * - "ui": the node sits in interactive UI (or a short anchor); it becomes a floating label on `uiEl`.
 *   `owner` is the chain end used for class-token skip checks (may be null when the boundary cut the walk).
 * - "timestamp": a video timestamp inside an interactive element; include as text in the nearest outer block
 */
type TextClassification =
  | { kind: "skip" }
  | { kind: "normal"; owner: HTMLElement }
  | { kind: "ui"; uiEl: HTMLElement; owner: HTMLElement | null }
  | { kind: "timestamp"; outerOwner: HTMLElement; timestampText: string };

/**
 * Classify a single text node relative to `boundary`.
 * Returns whether to skip it, include it normally, tag it as UI, or treat it as a timestamp.
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
    if (SKIP_TAGS.has(a.tagName) || a.tagName === "OPTION" || SKIP_ATTRS.some((k) => a.hasAttribute(k)) || s.hidden) {
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

  // Nothing non-inline above the node: without interactive/anchor context there is nothing to work with,
  // otherwise the interactive/anchor element itself owns the node's text
  if (!owner) {
    if (!nearestInteractive && !nearestAnchor) return { kind: "skip" };
  }

  // Also check owner itself for interactive/anchor
  if (!nearestInteractive && owner && isInteractiveEl(owner)) nearestInteractive = owner;
  if (!nearestAnchor && owner && owner.tagName === "A") nearestAnchor = owner;

  // Check short <a> link: text < 12 chars becomes a floating UI label (href or not, like the CHZZK menus)
  if (nearestAnchor && !nearestInteractive) {
    const anchorText = nearestAnchor.textContent?.trim() ?? "";
    if (anchorText.length < 12) return { kind: "ui", uiEl: nearestAnchor, owner };
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
    // Regular interactive UI: floating label
    return { kind: "ui", uiEl: nearestInteractive, owner };
  }

  if (!owner) return { kind: "skip" };
  return { kind: "normal", owner };
}

/**
 * Walk `blockEl` in document order and report its own text nodes and the BR elements that end its lines
 * (a BR counts only when its nearest non-inline ancestor is `blockEl`; BRs of nested blocks are theirs).
 */
function walkBlock(blockEl: HTMLElement, ownNodes: Set<Text>, onText: (t: Text) => void, onBr: (br: HTMLElement) => void): void {
  const walker = blockEl.ownerDocument!.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (ownNodes.has(n as Text)) onText(n as Text);
    } else if ((n as HTMLElement).tagName === "BR") {
      let brOwner: HTMLElement | null = null;
      for (let a: Element | null = (n as HTMLElement).parentElement; a; a = a.parentElement) {
        if (!(a instanceof HTMLElement)) break;
        if (!INLINE_DISPLAY.has(getComputedStyle(a).display)) {
          brOwner = a;
          break;
        }
      }
      if (brOwner === blockEl) onBr(n as HTMLElement);
    }
  }
}

/** Text of a block: own text nodes in document order (video-time buttons included in place), BR as "\n". */
function buildBlockText(blockEl: HTMLElement, ownNodes: Set<Text>): string {
  const parts: string[] = [];
  walkBlock(blockEl, ownNodes, (t) => parts.push(t.data), () => parts.push("\n"));
  return parts.join("");
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

  // Map from block owner element to its owned text nodes (ordered); `ui` marks elements whose text belongs
  // to a floating label rather than inline content
  const groups = new Map<HTMLElement, { nodes: Text[]; ui: boolean }>();

  const doc = (root instanceof Document ? root : (root as Element).ownerDocument)!;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const cls = classifyText(t, root, style, getCS);

    if (cls.kind === "skip") continue;

    if (cls.kind === "ui") {
      // Names, dates and counts on interactive elements are not UI labels
      if (chainHasSkipToken(t, cls.owner ?? cls.uiEl)) continue;
      const g = groups.get(cls.uiEl);
      if (g) g.nodes.push(t);
      else groups.set(cls.uiEl, { nodes: [t], ui: true });
      continue;
    }

    // A video-time button ("0:02:46") belongs to the block around it, IN PLACE, so it stays on its own line.
    const owner = cls.kind === "timestamp" ? cls.outerOwner : cls.owner;
    const g = groups.get(owner);
    if (g) g.nodes.push(t);
    else groups.set(owner, { nodes: [t], ui: false });
  }

  const blocks: PageBlock[] = [];

  for (const [el, g] of groups) {
    const text = buildBlockText(el, new Set(g.nodes));
    // UI text is the visible text of the whole element, whitespace-normalized ("구독 선물", never "…\n…")
    const norm = g.ui || isUiLabelEl(el);
    const value = norm ? text.replace(/\s+/g, " ").trim() : text;
    const trimmed = value.trim();

    if (!detectLanguage(trimmed) || HANDLE_ONLY.test(trimmed)) continue;
    if (koJaCount(trimmed) < 2) continue; // fewer than 2 ko/ja chars: skipped entirely
    let kind: PageBlock["kind"] = g.ui ? "ui" : "content";
    if (kind === "ui" && trimmed.length > 60) continue; // too long to float as a label
    if (hasSkipLabelToken(el, trimmed)) continue;
    const cs = getCS(el);
    if (kind === "content" && isUiCandidate(el, trimmed, cs)) kind = "ui";

    const parent = el.parentElement;
    const parentDisplay = parent instanceof HTMLElement ? style(parent).display : "";
    blocks.push({ kind, el, text: value, nodes: g.nodes, placement: INSERT_BREAKS.has(parentDisplay) ? "inside" : "after" });
  }

  return blocks;
}

/** Own text nodes of `el`'s block (same rules as findBlocks; keep the two in sync). */
function ownNodesOf(el: HTMLElement): Set<Text> {
  const styleMap = new Map<HTMLElement, WalkStyle>();
  const csMap = new Map<HTMLElement, CSSStyleDeclaration>();
  const style: (e: HTMLElement) => WalkStyle = (elem) => {
    let st = styleMap.get(elem);
    if (!st) {
      const c = getComputedStyle(elem);
      st = { display: c.display, visibility: c.visibility, hidden: c.display === "none" || c.visibility === "hidden" };
      styleMap.set(elem, st);
    }
    return st;
  };
  const getCS: (e: HTMLElement) => CSSStyleDeclaration = (elem) => {
    let c = csMap.get(elem);
    if (!c) {
      c = getComputedStyle(elem);
      csMap.set(elem, c);
    }
    return c;
  };
  const own = new Set<Text>();
  const walker = el.ownerDocument!.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const cls = classifyText(t, el, style, getCS);
    if (cls.kind === "skip") continue;
    if (cls.kind === "ui") {
      if (cls.uiEl === el && !chainHasSkipToken(t, cls.owner ?? cls.uiEl)) own.add(t);
      continue;
    }
    if ((cls.kind === "timestamp" ? cls.outerOwner : cls.owner) === el) own.add(t);
  }
  return own;
}

/**
 * Current text of `el`'s own block, re-read on demand (definition must stay in sync with findBlocks).
 * BR elements belonging to this block are represented as "\n". UI-block elements get whitespace-normalized
 * text, matching what findBlocks stored.
 */
export function blockText(el: HTMLElement): string {
  if (isForeign(el)) return "";
  const text = buildBlockText(el, ownNodesOf(el));
  return isUiLabelEl(el) ? text.replace(/\s+/g, " ").trim() : text;
}

export interface BlockLine {
  /** Text of this line (no trailing newline). */
  text: string;
  /** The BR that ends the line; null for the last line. A line's translation goes right after it. */
  br: HTMLElement | null;
}

/** The block's lines in order, split at its own BR elements: `lines.map(l => l.text).join("\n") === blockText(el)`. */
export function blockLines(el: HTMLElement): BlockLine[] {
  if (isForeign(el)) return [];
  const lines: BlockLine[] = [];
  let cur: string[] = [];
  walkBlock(el, ownNodesOf(el), (t) => cur.push(t.data), (br) => {
    lines.push({ text: cur.join(""), br });
    cur = [];
  });
  lines.push({ text: cur.join(""), br: null });
  return lines;
}

/** Nearest non-inline ancestor of `el` (el itself included). Mutation rescan rounds changed text up to one block. */
export function enclosingBlock(el: Node): HTMLElement | null {
  for (let a: Element | null = el instanceof Element ? el : el.parentElement; a; a = a.parentElement) {
    if (!(a instanceof HTMLElement)) return null;
    if (!INLINE_DISPLAY.has(getComputedStyle(a).display)) return a;
  }
  return null;
}
