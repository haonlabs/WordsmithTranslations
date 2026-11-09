/** Marks an element as engine-owned so other engines' scanners skip it. Set on chat containers by the adapters. */
export const CHAT_CONTAINER_ATTR = "data-wst-chat-container";

export interface ChatMessage {
  id: string;
  /** Text exactly as read from `sourceElement` (used for the stale-result guard). */
  sourceText: string;
  /** Platform-owned element holding only the message text. Never mutated. */
  sourceElement: HTMLElement;
  /** Platform-owned element the translation node is appended to (shown below the text). */
  host: HTMLElement;
  platform: "youtube" | "chzzk" | "page";
  /** Where the translation goes: inside `host` (chat, default) or as host's next sibling (page blocks). */
  placement?: "inside" | "after";
  /** Latest source text for the stale-result guard; defaults to `sourceElement.textContent`. */
  readText?: () => string;
}

export interface PlatformAdapter {
  canRun(): boolean;
  /** Idempotent. Must emit each message element at most once (plus again if its text changes). */
  start(onMessage: (message: ChatMessage) => void): void;
  /** Idempotent. Disconnects observers. */
  stop(): void;
}
