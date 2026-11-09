import { describe, expect, it } from "vitest";
import { detectLanguage, normalize } from "./language";

describe("detectLanguage", () => {
  it.each([
    // Korean
    ["안녕하세요 오늘 방송 재밌어요!", "ko"],
    ["lol 방송 good 재밌다", "ko"],
    ["ㅋㅋㅋㅋ", "ko"],
    // Japanese (kana)
    ["こんにちは", "ja"],
    ["ありがとう！", "ja"],
    ["カタカナ", "ja"],
    ["日本語です", "ja"], // has kana
    // neither script
    ["草", null], // kanji-only Japanese is deliberately skipped
    ["ー", null],
    ["・", null],
    ["https://example.com/watch?v=1", null],
    ["hello", null],
    ["hello everyone", null],
    ["😀🎉", null],
    ["12345 !!! ...", null],
    ["", null],
    ["   \n ", null],
    // URL stripping still applies
    ["https://example.com/한글 보세요", "ko"],
    ["https://example.com/한글", null],
    // mixed: the more frequent script wins
    ["안녕 こんにちは", "ja"],
    ["안녕하세요 방송 こんにちは", "ko"],
  ])("%s -> %s", (text, want) => expect(detectLanguage(text)).toBe(want));
});

it("normalize collapses whitespace", () => expect(normalize("  a \n b\t c ")).toBe("a b c"));
