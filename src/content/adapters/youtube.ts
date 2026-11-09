import type { PlatformAdapter } from "../types";
import { createAdapter } from "./base";

// Selectors verified 2026-11-09 against a live YouTube stream (chat iframe https://www.youtube.com/live_chat).
// Fixture: test/fixtures/youtube-live-chat.html. YouTube changes this DOM without notice; fix selectors HERE only.
const SEL = {
  container: "#items.yt-live-chat-item-list-renderer", // direct parent of all chat items
  message: "yt-live-chat-text-message-renderer", // only plain text messages (skips engagement/placeholder/etc.)
  text: "#message", // message text only; emoji are <img alt>, so textContent leaves them out
  host: "#content", // translation node is appended here, below the message line
};

/** Chat runs in its own frame at /live_chat (embedded) or /live_chat?is_popout=1. */
export const isChatFrame = (pathname: string): boolean => pathname === "/live_chat" || pathname === "/live_chat_replay";

export const createYouTubeAdapter = (doc: Document = document): PlatformAdapter =>
  createAdapter(
    {
      platform: "youtube",
      canRun: () => isChatFrame(doc.location?.pathname ?? ""),
      observe: { childList: true }, // our nodes live inside items, never as direct children
      ...SEL,
    },
    doc,
  );
