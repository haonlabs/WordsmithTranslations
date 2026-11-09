import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../test/fixtures/chzzk-live-chat.html?raw";
import { render, TRANSLATION_ATTR } from "../renderer";
import type { ChatMessage } from "../types";
import { createChzzkAdapter } from "./chzzk";

const flush = () => new Promise((r) => setTimeout(r, 0));
let got: ChatMessage[];
const collect = (m: ChatMessage) => got.push(m);
const wrapper = () => document.querySelector("[role=log] > div")!;

function addMessage(text: string): HTMLElement {
  const item = document.createElement("div");
  item.className = "_item_8lqsk_7";
  item.innerHTML = `<div class="_container_w9pvh_1"><div class="_chatting_message_w9pvh_21"><button class="_nickname_w9pvh_33"><span><span class="_text_8bw0p_2">닉네임</span></span></button><span class="_text_w9pvh_1">${text}</span></div></div>`;
  wrapper().append(item);
  return item.querySelector<HTMLElement>("[class*='_chatting_message_']")!;
}

beforeEach(() => {
  document.body.innerHTML = fixture;
  got = [];
});

describe("chzzk adapter", () => {
  it("initial scan emits message text only (no nickname) with the message div as host", () => {
    const a = createChzzkAdapter(document);
    a.start(collect);
    expect(document.querySelector("[role=log]")!.hasAttribute("data-wst-chat-container")).toBe(true); // page skips chat
    a.stop();
    expect(document.querySelector("[role=log]")!.hasAttribute("data-wst-chat-container")).toBe(false); // cleared on stop
    expect(got.map((m) => m.sourceText)).toEqual(["근데 바람핌", "라칸 터지는거 봐라 lol", "hello everyone"]);
    expect(got[0]!.sourceText).not.toContain("바이킹");
    expect(got[0]!.host.className).toContain("_chatting_message_");
    expect(got[0]!.platform).toBe("chzzk");
  });

  it("emits new messages once and renders the translation below the text", async () => {
    const a = createChzzkAdapter(document);
    a.start(collect);
    got.length = 0;
    const msg = addMessage("새 메시지");
    await flush();
    expect(got.map((m) => m.sourceText)).toEqual(["새 메시지"]);
    expect(render(got[0]!, "New message")).toBe(true);
    await flush(); // our own insertion must not re-trigger the observer
    expect(got).toHaveLength(1);
    expect(msg.querySelectorAll(`[${TRANSLATION_ATTR}]`)).toHaveLength(1);
    expect(msg.querySelector(":scope > span")!.textContent).toBe("새 메시지"); // original untouched
    a.stop();
  });

  it("waits for text that React fills in after inserting the node", async () => {
    vi.useFakeTimers();
    const a = createChzzkAdapter(document);
    a.start(collect);
    got.length = 0;
    const msg = addMessage("");
    await vi.advanceTimersByTimeAsync(0);
    expect(got).toEqual([]);
    msg.querySelector(":scope > span")!.textContent = "늦게 채움";
    await vi.advanceTimersByTimeAsync(100);
    expect(got.map((m) => m.sourceText)).toEqual(["늦게 채움"]);
    a.stop();
    vi.useRealTimers();
  });

  it("re-attaches when the log container is replaced (room change)", async () => {
    vi.useFakeTimers();
    const a = createChzzkAdapter(document);
    a.start(collect);
    got.length = 0;
    document.body.innerHTML = fixture.replace("근데 바람핌", "다른 방 메시지");
    await vi.advanceTimersByTimeAsync(1100);
    expect(got.map((m) => m.sourceText)).toContain("다른 방 메시지");
    expect(document.querySelector("[role=log]")!.hasAttribute("data-wst-chat-container")).toBe(true); // re-marked
    a.stop();
    vi.useRealTimers();
  });

  it("start/stop are idempotent and stop disconnects", async () => {
    const a = createChzzkAdapter(document);
    a.start(collect);
    a.start(collect);
    a.stop();
    expect(document.querySelector("[role=log]")!.hasAttribute("data-wst-chat-container")).toBe(false); // cleared on stop
    a.stop();
    got.length = 0;
    addMessage("중지 후");
    await flush();
    expect(got).toEqual([]);
  });
});
