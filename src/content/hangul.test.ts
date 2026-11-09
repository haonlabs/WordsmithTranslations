import { describe, expect, it } from "vitest";
import { needsTranslation, normalize } from "./hangul";

describe("needsTranslation", () => {
  it.each([
    ["안녕하세요 오늘 방송 재밌어요!", true],
    ["lol 방송 good 재밌다", true],
    ["ㅋㅋㅋㅋ", true],
    ["hello everyone", false],
    ["https://example.com/watch?v=1", false],
    ["https://example.com/한글 보세요", true],
    ["https://example.com/한글", false],
    ["😀🎉", false],
    ["12345 !!! ...", false],
    ["", false],
    ["   \n ", false],
  ])("%j -> %s", (text, want) => expect(needsTranslation(text)).toBe(want));
});

it("normalize collapses whitespace", () => expect(normalize("  a \n b\t c ")).toBe("a b c"));
