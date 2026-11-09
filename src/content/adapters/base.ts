import { TRANSLATION_ATTR } from "../renderer";
import type { ChatMessage, PlatformAdapter } from "../types";

export interface AdapterConfig {
  platform: ChatMessage["platform"];
  canRun(): boolean;
  /** Narrowest stable element containing all messages. Re-found every second, so replacement is survived. */
  container: string;
  observe: MutationObserverInit;
  /** Selector for one chat message element. */
  message: string;
  /** Inside a message: the element holding ONLY the message text (never author/time/badges). */
  text: string;
  /** Inside a message: where the translation is appended. Omit to use the message element itself. */
  host?: string;
}

const RESCAN_MS = 1000; // ponytail: polling to notice a replaced container; a body-wide observer would be costlier
const INITIAL_SCAN_MAX = 30; // newest N existing messages
const TEXT_RETRIES = 5; // frameworks may fill the text a tick after inserting the node

export function createAdapter(cfg: AdapterConfig, doc: Document = document): PlatformAdapter {
  let onMessage: ((m: ChatMessage) => void) | null = null;
  let observer: MutationObserver | null = null;
  let current: Element | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let seen = new WeakSet<Element>();

  function emit(el: Element, attempt = 0): void {
    if (!onMessage || seen.has(el) || !el.isConnected) return;
    const sourceElement = el.querySelector<HTMLElement>(cfg.text);
    const host = cfg.host ? el.querySelector<HTMLElement>(cfg.host) : (el as HTMLElement);
    if (!sourceElement || !host) return;
    const sourceText = sourceElement.textContent ?? "";
    if (!sourceText.trim()) {
      if (attempt < TEXT_RETRIES) setTimeout(() => emit(el, attempt + 1), 50);
      return;
    }
    seen.add(el);
    onMessage({ id: el.id, sourceText, sourceElement, host, platform: cfg.platform });
  }

  function onMutations(records: MutationRecord[]): void {
    for (const r of records)
      for (const n of r.addedNodes) {
        if (!(n instanceof Element) || n.hasAttribute(TRANSLATION_ATTR)) continue; // never react to our own nodes
        const msg = n.closest(cfg.message);
        if (msg) emit(msg);
        else for (const m of n.querySelectorAll(cfg.message)) emit(m);
      }
  }

  function attach(container: Element): void {
    observer?.disconnect();
    current = container;
    observer = new MutationObserver(onMutations);
    observer.observe(container, cfg.observe);
    for (const m of [...container.querySelectorAll(cfg.message)].slice(-INITIAL_SCAN_MAX)) emit(m);
  }

  function tick(): void {
    const c = doc.querySelector(cfg.container);
    if (c && c !== current) attach(c);
  }

  return {
    canRun: cfg.canRun,
    start(cb) {
      if (timer) return; // idempotent
      onMessage = cb;
      seen = new WeakSet();
      tick();
      timer = setInterval(tick, RESCAN_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      observer?.disconnect();
      observer = null;
      current = null;
      onMessage = null;
    },
  };
}
