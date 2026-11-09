import type { PlatformAdapter } from "../types";
import { createAdapter } from "./base";

// Selectors verified 2026-11-09 against a live CHZZK stream (logged in). Fixture: test/fixtures/chzzk-live-chat.html.
// CHZZK uses CSS-module class names with build hashes (_chatting_message_w9pvh_21), so we match the stable
// prefix with [class*=] and prefer semantic anchors ([role=log], direct-child structure). Fix selectors HERE only.
// Structure: aside > div[role=log] > div(list) > div(item) > div(container) > div._chatting_message_
//            (button = nickname/badges, direct-child span = message text).
const SEL = {
  container: "[role=log]",
  message: "[class*='_chatting_message_']",
  text: ":scope > span", // nickname lives inside the <button>, so a direct-child span is the message text only
  // host omitted: the message div is display:block, so appending inside it renders below nickname + text
};

export const createChzzkAdapter = (doc: Document = document): PlatformAdapter =>
  createAdapter(
    {
      platform: "chzzk",
      canRun: () => true, // chat is in the main document on live pages; container is polled for
      observe: { childList: true, subtree: true }, // items are inserted first and filled by React afterwards
      ...SEL,
    },
    doc,
  );
