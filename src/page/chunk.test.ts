import { describe, expect, it, vi } from "vitest";
import { chunkText, translateChunked } from "./chunk";

const dot = " Lorem ipsum dolor sit amet. "; // 29 chars ending in a sentence boundary
const ja = "あいうえおかきくけこ。"; // 11 chars ending in a Japanese sentence boundary

describe("chunkText", () => {
  it("passes short text through whole", () => {
    expect(chunkText("안녕하세요")).toEqual(["안녕하세요"]);
  });

  it("splits long text exactly at boundaries, chunks <= 1000 chars", () => {
    const text = dot.repeat(40) + ja.repeat(40); // ~1600 chars, many boundaries
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
    expect(chunks.join("")).toBe(text); // nothing lost, boundaries stay inside the chunks
    for (const c of chunks) expect(/[.!?。！？]$|\s$/.test(c.slice(-2))).toBe(true); // cut at a boundary
  });

  it("uses Japanese sentence boundaries too", () => {
    const text = ja.repeat(92) + "끝"; // 1013 chars
    const chunks = chunkText(text);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
    expect(chunks.join("")).toBe(text);
  });

  it("hard-cuts text without any boundary (limit is non-negotiable)", () => {
    const text = "가".repeat(2400);
    const chunks = chunkText(text);
    expect(chunks.map((c) => c.length)).toEqual([1000, 1000, 400]);
    expect(chunks.join("")).toBe(text);
  });
});

describe("translateChunked", () => {
  it("short text: one direct call", async () => {
    const translate = vi.fn().mockResolvedValue("hello");
    await expect(translateChunked("안녕하세요", "ko", translate)).resolves.toBe("hello");
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith("안녕하세요", "ko");
  });

  it("long text: translated sequentially in order, joined without extra separators", async () => {
    const order: string[] = [];
    const translate = vi.fn().mockImplementation((t: string) => {
      order.push(t);
      return Promise.resolve(`EN(${t.trimEnd().slice(-1)})`); // the boundary char proves we got the whole chunk
    });
    const text = dot.repeat(40) + ja.repeat(40);
    const out = await translateChunked(text, "ko", translate);
    expect(order).toEqual(chunkText(text));
    expect(out).toBe(order.map((t) => `EN(${t.trimEnd().slice(-1)})`).join(""));
  });

  it("multiline text: translates only ko/ja lines, skips blank and non-ko/ja lines", async () => {
    // "가나다" → ko (translated), "abc" → no ko/ja (passthrough), "" → blank (preserved), "라마바" → ko (translated)
    const calls: string[] = [];
    const translate = vi.fn().mockImplementation((t: string) => {
      calls.push(t);
      return Promise.resolve(`<t:${t}>`);
    });
    const result = await translateChunked("가나다\nabc\n\n라마바", "ko", translate);
    // translate called only for lines 1 and 4 (ko/ja)
    expect(calls).toEqual(["가나다", "라마바"]);
    // blank line and "abc" preserved; ko lines translated
    expect(result).toBe("<t:가나다>\nabc\n\n<t:라마바>");
  });
});
