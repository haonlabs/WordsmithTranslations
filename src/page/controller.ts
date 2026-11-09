import contentCss from "../../public/content.css?raw";
import type { Lang } from "../shared/translator";
import { detectLanguage, normalize } from "../content/language";
import { createReadiness } from "../content/readiness";
import { TranslationQueue } from "../content/queue";
import { render, TRANSLATION_ATTR } from "../content/renderer";
import type { ChatMessage } from "../content/types";
import { blockText, enclosingBlock, findBlocks, isForeign, type PageBlock } from "./blocks";
import { translateChunked } from "./chunk";

const FLUSH_MS = 300;
const IO_ROOT_MARGIN = "300px 0px"; // translate while near the viewport, before the user actually sees it
const TR_SELECTOR = `[${TRANSLATION_ATTR}]`;
const DROPPED_RE = /^(dropped|cleared)$/;

export interface PageBlockObserver {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
}

/** PageBlockObserver exists so tests can inject fakes; the real IntersectionObserver satisfies it via cast. */
type IOCtor = new (
  callback: (entries: Array<{ isIntersecting: boolean; target: Element }>, observer: PageBlockObserver) => void,
  options?: { rootMargin?: string },
) => PageBlockObserver;

export interface PageTranslatorDeps {
  translate: (text: string, lang: Lang) => Promise<string>;
  /** Translator availability, checked through the offscreen document (throttled via createReadiness). */
  status: (lang: Lang) => Promise<{ state: string }>;
  document: Document;
  debounceMs?: number;
  IntersectionObserver?: IOCtor;
  MutationObserver?: new (callback: MutationCallback) => MutationObserver;
}

export interface PageStats {
  active: boolean;
  translated: number;
}

interface Tracked {
  text: () => string;
  placement: "inside" | "after";
  requested: string; // text we last enqueued for; "" = nothing yet
  translated: boolean;
}

/**
 * Scans the page for ko/ja text blocks, translates the visible ones and renders the result below the
 * original text. Follows DOM changes (new comments, "Read more" expansions); never recreates its own work.
 */
export function createPageTranslator(deps: PageTranslatorDeps) {
  const doc = deps.document;
  const ready = createReadiness(deps.status);
  const queue = new TranslationQueue({ translate: (t, l) => translateChunked(t, l, deps.translate) });
  const tracked = new Map<HTMLElement, Tracked>();
  const IO = deps.IntersectionObserver ?? (globalThis as { IntersectionObserver?: IOCtor }).IntersectionObserver;
  const MO = deps.MutationObserver ?? globalThis.MutationObserver;
  const pending: Node[] = [];
  let io: PageBlockObserver | null = null;
  let mo: MutationObserver | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let active = false;

  function process(el: HTMLElement): void {
    const info = tracked.get(el);
    if (!info) {
      io?.unobserve(el); // stale entry (e.g. stop in between)
      return;
    }
    const text = info.text();
    if (!text.trim() || text === info.requested) return;
    const lang = detectLanguage(text);
    if (!lang) {
      info.requested = text; // deterministic: this text can never translate, don't retry it
      return;
    }
    const prev = info.requested;
    info.requested = text;
    ready(lang)
      .then((ok) => (ok ? queue.enqueue(normalize(text), text, lang) : undefined))
      .then((out) => {
        if (out === undefined) {
          // model not ready: restore the previous request so the block is retried on its next visibility event
          if (info.requested === text) info.requested = prev;
          return;
        }
        const msg: ChatMessage = {
          id: el.id || "page",
          sourceText: text,
          sourceElement: el,
          host: el,
          platform: "page",
          placement: info.placement,
          readText: () => info.text(),
        };
        if (render(msg, out)) info.translated = true;
      })
      .catch((e: unknown) => {
        const dropped = e instanceof Error && DROPPED_RE.test(e.message);
        if (!dropped) return; // other failures leave the original untouched; never log page text
        info.requested = prev;
        // shortcut: re-observing every dropped block can loop when >100 blocks are visible;
        // the IO callback is async, so it stays a warm loop, not a tight one. Rate-limit here if it hurts.
        if (io) {
          io.unobserve(el);
          io.observe(el);
        }
      });
  }

  function track(blk: PageBlock): void {
    if (isForeign(blk.el)) return;
    let info = tracked.get(blk.el);
    if (!info) {
      info = { text: () => blockText(blk.el), placement: blk.placement, requested: "", translated: false };
      tracked.set(blk.el, info);
      io?.observe(blk.el);
    }
  }

  const onIO = (entries: Array<{ isIntersecting: boolean; target: Element }>): void => {
    for (const e of entries) if (e.isIntersecting) process(e.target as HTMLElement);
  };

  // mutation debounce: one rescan per 300ms window, subtree-scoped (full rescans are expensive)
  const schedule = (): void => {
    if (!flushTimer) flushTimer = setTimeout(flush, deps.debounceMs ?? FLUSH_MS);
  };

  const isEngineNode = (n: Node): boolean => {
    const el = n instanceof Element ? n : n.parentElement;
    // engine nodes, our <style>, and live chat (translated by the chat engine, never by this one)
    return !!el && (isForeign(el) || el.hasAttribute("data-wst-style") || el.tagName === "STYLE");
  };

  function onMutations(records: MutationRecord[]): void {
    if (!active) return;
    for (const r of records) {
      if (isEngineNode(r.target)) continue; // never react to our own translation/style nodes
      for (const n of r.addedNodes) if (!isEngineNode(n)) pending.push(n);
      if (r.type === "characterData" && !isEngineNode(r.target)) pending.push(r.target);
    }
    if (pending.length) schedule();
  }

  function flush(): void {
    flushTimer = null;
    const blocks = new Set<HTMLElement>();
    for (const node of pending.splice(0)) {
      const el = node.nodeType === 1 && node instanceof Element ? node : node.parentElement;
      if (!el || !el.isConnected || isForeign(el)) continue;
      const block = enclosingBlock(el);
      if (block) blocks.add(block);
    }
    for (const block of blocks) {
      for (const blk of findBlocks(block)) track(blk);
      const info = tracked.get(block);
      // text changed under a tracked block: re-observe so the IO reports the current visibility and retries
      if (info && info.text() !== info.requested) {
        io?.unobserve(block);
        io?.observe(block);
      }
    }
    if (pending.length) schedule(); // nodes arrived between splice and now (only from nested mutations)
  }

  return {
    start(): void {
      if (active) return;
      active = true;
      styleEl ??= doc.createElement("style");
      styleEl.setAttribute("data-wst-style", "");
      styleEl.textContent = contentCss;
      if (!styleEl.isConnected) (doc.head ?? doc.documentElement).appendChild(styleEl);
      if (!doc.body) return;
      if (IO) {
        io = new IO(onIO, { rootMargin: IO_ROOT_MARGIN });
        for (const blk of findBlocks(doc.body)) track(blk);
      }
      if (MO) {
        mo = new MO(onMutations);
        mo.observe(doc.body, { childList: true, subtree: true, characterData: true });
      }
    },
    stop(): void {
      if (!active) return;
      active = false;
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pending.length = 0;
      io?.disconnect();
      io = null;
      mo?.disconnect();
      mo = null;
      queue.clear();
      styleEl?.remove();
      styleEl = null;
      doc.querySelectorAll("[data-wst-page]").forEach((n) => n.remove());
      tracked.clear();
    },
    stats(): PageStats {
      let translated = 0;
      for (const info of tracked.values()) if (info.translated) translated++;
      return { active, translated };
    },
  };
}
