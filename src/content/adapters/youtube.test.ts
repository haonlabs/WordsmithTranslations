import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../test/fixtures/youtube-live-chat.html?raw";
import type { ChatMessage } from "../types";
import { createYouTubeAdapter, isChatFrame } from "./youtube";

const flush = () => new Promise((r) => setTimeout(r, 0));
let got: ChatMessage[];
const collect = (m: ChatMessage) => got.push(m);

beforeEach(() => {
  document.body.innerHTML = fixture;
  got = [];
});
afterEach(() => vi.useRealTimers());

describe("youtube adapter", () => {
  it("initial scan emits only text messages, with text and host", () => {
    const a = createYouTubeAdapter(document);
    a.start(collect);
    a.stop();
    expect(got.map((m) => m.sourceText)).toEqual(["수구리 망상증환자", "뭔가 참아 왔던게 터진 느낌...."]);
    expect(got[0]!.id).toBe("ChwKGkNPN3JwYmlDLTVjREZjeHBUQWdkWVNRS093");
    expect(got[0]!.host.id).toBe("content");
    expect(got[0]!.sourceText).not.toContain("@소망"); // no author name
    expect(got[0]!.sourceText).not.toContain("8:43"); // no timestamp
    expect(got[1]!.sourceText).not.toContain("😮"); // emoji img alt excluded
  });

  it("emits new messages added later, once, and ignores non-text items", async () => {
    const a = createYouTubeAdapter(document);
    a.start(collect);
    got.length = 0;
    const list = document.querySelector("#items")!;
    const el = document.createElement("yt-live-chat-text-message-renderer");
    el.id = "new1";
    el.innerHTML = `<div id="content"><span id="message">새 메시지</span></div>`;
    list.append(el, document.createElement("yt-live-chat-placeholder-item-renderer"));
    await flush();
    expect(got.map((m) => m.sourceText)).toEqual(["새 메시지"]);
    a.stop();
  });

  it("does not loop on its own translation nodes", async () => {
    const a = createYouTubeAdapter(document);
    a.start(collect);
    got.length = 0;
    const host = document.querySelector<HTMLElement>("#content")!;
    const tr = document.createElement("div");
    tr.setAttribute("data-wst-translation", "true");
    tr.textContent = "Hello";
    host.appendChild(tr);
    await flush();
    expect(got).toEqual([]);
    a.stop();
  });

  it("start/stop are idempotent and stop disconnects", async () => {
    const a = createYouTubeAdapter(document);
    a.start(collect);
    a.start(collect);
    a.stop();
    a.stop();
    got.length = 0;
    const el = document.createElement("yt-live-chat-text-message-renderer");
    el.innerHTML = `<div id="content"><span id="message">중지 후</span></div>`;
    document.querySelector("#items")!.append(el);
    await flush();
    expect(got).toEqual([]);
  });

  it("re-attaches when the chat list is replaced", async () => {
    vi.useFakeTimers();
    const a = createYouTubeAdapter(document);
    a.start(collect);
    got.length = 0;
    document.querySelector("#item-offset")!.innerHTML =
      `<div id="items" class="style-scope yt-live-chat-item-list-renderer"><yt-live-chat-text-message-renderer id="r1"><div id="content"><span id="message">교체 후</span></div></yt-live-chat-text-message-renderer></div>`;
    await vi.advanceTimersByTimeAsync(1100);
    expect(got.map((m) => m.sourceText)).toEqual(["교체 후"]);
    a.stop();
  });

  it("detects the chat frame by path", () => {
    expect(isChatFrame("/live_chat")).toBe(true);
    expect(isChatFrame("/watch")).toBe(false);
  });
});
