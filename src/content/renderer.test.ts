import { beforeEach, describe, expect, it } from "vitest";
import { render, TRANSLATION_ATTR } from "./renderer";
import type { ChatMessage } from "./types";

let host: HTMLElement;
let src: HTMLElement;
let msg: ChatMessage;

beforeEach(() => {
  document.body.innerHTML = `<div id="host"><span id="text">안녕하세요</span></div>`;
  host = document.getElementById("host")!;
  src = document.getElementById("text")!;
  msg = { id: "1", sourceText: "안녕하세요", sourceElement: src, host, platform: "youtube" };
});

describe("render", () => {
  it("appends the translation below the text and leaves the original intact", () => {
    expect(render(msg, "Hello")).toBe(true);
    const node = host.querySelector(`[${TRANSLATION_ATTR}]`)!;
    expect(node.textContent).toBe("Hello");
    expect(host.lastElementChild).toBe(node);
    expect(src.textContent).toBe("안녕하세요");
  });

  it("updates the existing node instead of duplicating", () => {
    render(msg, "Hello");
    render(msg, "Hi");
    const nodes = host.querySelectorAll(`[${TRANSLATION_ATTR}]`);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.textContent).toBe("Hi");
  });

  it("uses textContent, never HTML", () => {
    render(msg, `<img src=x onerror=alert(1)>`);
    const node = host.querySelector(`[${TRANSLATION_ATTR}]`)!;
    expect(node.querySelector("img")).toBeNull();
    expect(node.textContent).toBe(`<img src=x onerror=alert(1)>`);
  });

  it("skips stale results: removed node or reused node with different text", () => {
    src.textContent = "다른 메시지";
    expect(render(msg, "Hello")).toBe(false);
    src.textContent = "안녕하세요";
    host.remove();
    expect(render(msg, "Hello")).toBe(false);
    expect(host.querySelector(`[${TRANSLATION_ATTR}]`)).toBeNull();
  });
});
