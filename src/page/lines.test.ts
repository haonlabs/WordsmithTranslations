import { beforeEach, describe, expect, it } from "vitest";
import { blockLines, blockText, findBlocks } from "./blocks";
import { BLOCK_ATTR, clearLines, renderLines } from "./lines";

// Same shape as a CHZZK comment: video-time BUTTONS inside the text, lines separated by <br>
const LIST = `<div id="c" style="display:block"><button type="button">0:02:46</button> 메리 키타<br><button type="button">0:03:07</button> 병원 다녀온 메리<br>🎮🪡<br><br><button type="button">0:11:11</button> 노래 할 때 눈물</div>`;

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = LIST;
  host = document.getElementById("c")!;
});

const x = (t: string) => t.replace(/[가-힣]+/g, "X");

describe("timestamp lists", () => {
  it("video-time buttons stay IN PLACE on their own line (not collected at the top)", () => {
    const blocks = findBlocks(document.body);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toBe("0:02:46 메리 키타\n0:03:07 병원 다녀온 메리\n🎮🪡\n\n0:11:11 노래 할 때 눈물");
    expect(blockText(host)).toBe(blocks[0]!.text);
  });

  it("blockLines splits at the block's own <br> and keeps the BR as the insertion point", () => {
    const lines = blockLines(host);
    expect(lines.map((l) => l.text).join("\n")).toBe(blockText(host));
    expect(lines).toHaveLength(5);
    expect(lines[0]!.br).toBe(host.querySelectorAll("br")[0]);
    expect(lines[4]!.br).toBeNull();
  });
});

describe("renderLines", () => {
  it("puts each translation directly under its own line, timestamp not repeated", () => {
    const lines = blockLines(host);
    const ok = renderLines(host, "1", lines, lines.map((l) => x(l.text)), true);
    expect(ok).toBe(true);
    const nodes = [...host.querySelectorAll<HTMLElement>("[data-wst-translation]")];
    expect(nodes.map((n) => n.textContent)).toEqual(["X X", "X X X", "X X X X"]); // the emoji-only and empty lines get none
    // order in the DOM: line1, BR, tr1, line2, BR, tr2, ...
    expect(nodes[0]!.previousElementSibling!.tagName).toBe("BR");
    expect(nodes[0]!.nextSibling).toBe(host.querySelectorAll("button")[1]); // next line starts right after
    expect(nodes[2]!.parentElement).toBe(host); // last line: end of the block
    expect(nodes.map((n) => n.getAttribute("data-wst-line"))).toEqual(["first", "next", "next"]);
    expect(nodes.every((n) => n.getAttribute(BLOCK_ATTR) === "1" && n.getAttribute("data-wst-page") === "true")).toBe(true);
  });

  it("never changes the page's own text, and the block's text stays the same after rendering", () => {
    const before = blockText(host);
    const lines = blockLines(host);
    renderLines(host, "1", lines, lines.map((l) => x(l.text)), true);
    expect(blockText(host)).toBe(before); // our nodes are foreign: not part of the block's text
    expect(findBlocks(document.body)).toHaveLength(1);
  });

  it("re-rendering replaces its own nodes instead of duplicating them", () => {
    const lines = blockLines(host);
    renderLines(host, "1", lines, lines.map((l) => x(l.text)), true);
    renderLines(host, "1", lines, lines.map((l) => x(l.text) + "!"), true);
    const nodes = host.querySelectorAll("[data-wst-translation]");
    expect(nodes).toHaveLength(3);
    expect(nodes[0]!.textContent).toBe("X X!");
  });

  it("refuses a line-count mismatch and renders nothing (caller falls back to one block)", () => {
    expect(renderLines(host, "1", blockLines(host), ["only one"], true)).toBe(false);
    expect(host.querySelector("[data-wst-translation]")).toBeNull();
  });

  it("clearLines removes only that block's nodes", () => {
    const lines = blockLines(host);
    renderLines(host, "1", lines, lines.map((l) => x(l.text)), true);
    clearLines(host, "2");
    expect(host.querySelectorAll("[data-wst-translation]")).toHaveLength(3);
    clearLines(host, "1");
    expect(host.querySelectorAll("[data-wst-translation]")).toHaveLength(0);
  });
});
