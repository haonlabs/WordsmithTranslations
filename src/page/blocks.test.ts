import { beforeEach, describe, expect, it, vi } from "vitest";
import chzzkFixture from "../../test/fixtures/chzzk-comments.html?raw";
import { blockText, findBlocks, isForeign, type PageBlock } from "./blocks";

let body: HTMLElement;
const scan = (): PageBlock[] => findBlocks(document.body);

beforeEach(() => {
  document.body.innerHTML = "";
  body = document.body;
});

describe("findBlocks", () => {
  it("finds a simple block and never touches the original text", () => {
    body.innerHTML = `<div id="b" style="display:block">한국어 텍스트</div>`;
    const blocks = scan();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.el.id).toBe("b");
    expect(blocks[0]!.text).toBe("한국어 텍스트");
    expect(blocks[0]!.placement).toBe("after");
    expect(document.getElementById("b")!.textContent).toBe("한국어 텍스트");
  });

  it("inline children keep flowing into the parent block", () => {
    // Short <a> text (< 12 chars) is now excluded from the block; long <a> text is included.
    body.innerHTML = `<div id="b" style="display:block">바깥 <a href="#">링크</a> <span style="display:inline">인라인</span> 끝</div>`;
    const blocks = scan();
    expect(blocks.map((b) => b.el.id)).toEqual(["b"]);
    // "링크" is 2 chars (< 12) so the short-anchor rule skips it; the rest of the block text remains.
    expect(blocks[0]!.text).toBe("바깥  인라인 끝");
  });

  it("nested blocks do not translate the same text twice", () => {
    body.innerHTML = `<div id="outer" style="display:block">바깥<p id="inner">안쪽</p></div>`;
    const blocks = scan();
    expect(blocks.map((b) => b.el.id)).toEqual(["outer", "inner"]);
    expect(blocks[0]!.text).toBe("바깥"); // inner's text is the inner block's, not the outer's
    expect(blocks[1]!.text).toBe("안쪽");
  });

  it("skips script/code/editable/invisible/chat-container elements", () => {
    body.innerHTML = `
      <div style="display:none">숨긴 텍스트</div>
      <div style="visibility:hidden">안 보이는 텍스트</div>
      <script>한국어 스크립트</script>
      <style>한국어 스타일</style>
      <noscript>한국어 대체</noscript>
      <textarea>한국어 입력</textarea>
      <select><option>한국어 선택</option></select>
      <code>한국어 코드</code>
      <pre>한국어 열려있는 코드</pre>
      <div contenteditable>한국어 편집됨</div>
      <div id="chat" data-wst-chat-container><div style="display:block">한국어 채팅</div></div>
      <div id="host2" style="display:block">한국어<span data-wst-translation="true">Hello</span></div>
      <div id="kept" style="display:block">보이는 텍스트</div>`;
    const blocks = scan();
    expect(blocks.map((b) => b.el.id)).toEqual(["host2", "kept"]);
    expect(blocks[0]!.text).toBe("한국어"); // the marked span's own text is ignored
  });

  it("a rescan root INSIDE a chat container is skipped (container attribute is above the boundary)", () => {
    document.body.innerHTML = `<div data-wst-chat-container><div id="m" style="display:block">나중에 온 채팅</div></div>`;
    const m = document.getElementById("m")!;
    expect(isForeign(m)).toBe(true);
    expect(findBlocks(m)).toEqual([]);
    expect(blockText(m)).toBe("");
    document.body.innerHTML = `<div><div id="n" style="display:block">일반 문단 텍스트</div></div>`;
    expect(findBlocks(document.getElementById("n")!)).toHaveLength(1);
  });

  it("placement is inside when the parent breaks on insertion (flex)", () => {
    body.innerHTML = `<div id="row" style="display:flex"><p id="a">플렉스</p><div style="display:inline-flex"><p id="b">인라인 플렉스</p></div><div style="display:grid"><p id="c">그리드</p></div></div>`;
    const byId = Object.fromEntries(scan().map((b) => [b.el.id, b]));
    expect(byId.a!.placement).toBe("inside");
    expect(byId.b!.placement).toBe("inside");
    expect(byId.c!.placement).toBe("inside");
  });

  it("ignores text without Korean or Japanese", () => {
    body.innerHTML = `<div style="display:block">Hello world, English only</div><div style="display:block">こんにちは</div>`;
    const blocks = scan();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toBe("こんにちは");
  });

  it("skips blocks whose text is a single @handle, keeps handles inside longer text", () => {
    body.innerHTML = `<div id="h" style="display:block">@한글아이디</div><div id="b" style="display:block">@한글아이디 안녕하세요</div>`;
    const blocks = scan();
    expect(blocks.map((b) => b.el.id)).toEqual(["b"]);
    expect(blocks[0]!.text).toContain("@한글아이디");
  });

  it("empty text nodes are not blocks", () => {
    body.innerHTML = `<div style="display:block">   <b>i18n</b>  </div>`;
    expect(scan()).toEqual([]);
  });

  // ── New tests ───────────────────────────────────────────────────────────────

  describe("CHZZK fixture (3 comments)", () => {
    beforeEach(() => {
      body.innerHTML = chzzkFixture;
    });

    it("produces exactly 3 content blocks, one per comment body", () => {
      const blocks = scan();
      expect(blocks).toHaveLength(3);
    });

    it("does not produce blocks for nicknames, dates, or blind labels", () => {
      const blocks = scan();
      const texts = blocks.map((b) => b.text.trim());
      // No nickname text
      expect(texts.some((t) => t.includes("hyeonju김현주"))).toBe(false);
      expect(texts.some((t) => t.includes("AGN"))).toBe(false);
      expect(texts.some((t) => t.includes("우유맛푸딩"))).toBe(false);
      // No dates
      expect(texts.some((t) => /^1[01]\.\d{2}$/.test(t))).toBe(false);
      // No blind labels
      expect(texts.some((t) => t.includes("더보기"))).toBe(false);
      expect(texts.some((t) => t.includes("버프"))).toBe(false);
      // No reply button
      expect(texts.some((t) => t.includes("답글 쓰기"))).toBe(false);
    });

    it("list block: text has 4 lines separated by \\n", () => {
      const blocks = scan();
      const listBlock = blocks.find((b) => b.text.includes("히요리"));
      expect(listBlock).toBeDefined();
      const lines = listBlock!.text.split("\n");
      expect(lines).toHaveLength(4);
      expect(lines[0]).toContain("히요리");
      expect(lines[1]).toContain("메리");
      expect(lines[2]).toContain("토아");
      expect(lines[3]).toContain("랑");
    });

    it("timestamp block: text is exactly '07:29:29 샌즈전 클리어 판 시작'", () => {
      const blocks = scan();
      const tsBlock = blocks.find((b) => b.text.includes("샌즈전"));
      expect(tsBlock).toBeDefined();
      expect(tsBlock!.text.trim()).toBe("07:29:29 샌즈전 클리어 판 시작");
    });

    it("short comment block: text is '몰살 가즈아!!!'", () => {
      const blocks = scan();
      const shortBlock = blocks.find((b) => b.text.includes("몰살"));
      expect(shortBlock).toBeDefined();
      expect(shortBlock!.text.trim()).toBe("몰살 가즈아!!!");
    });
  });

  describe("sr-only / visually-hidden elements are skipped", () => {
    it("skips elements with class 'blind'", () => {
      body.innerHTML = `<div style="display:block">안녕하세요 <span class="blind">더보기</span></div>`;
      const blocks = scan();
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.text).not.toContain("더보기");
      expect(blocks[0]!.text.trim()).toBe("안녕하세요");
    });

    it("skips elements with class 'sr-only'", () => {
      body.innerHTML = `<div id="b" style="display:block">내용 <span class="sr-only">숨겨진 텍스트</span></div>`;
      const blocks = scan();
      expect(blocks.map((b) => b.el.id)).toEqual(["b"]);
      expect(blocks[0]!.text).not.toContain("숨겨진");
    });

    it("skips elements hidden with clip:rect(0,0,0,0) style", () => {
      body.innerHTML = `
        <div id="b" style="display:block">본문 텍스트</div>
        <span style="position:absolute;width:1px;height:1px;clip:rect(0,0,0,0)">숨겨진 clip</span>`;
      const blocks = scan();
      expect(blocks.map((b) => b.el.id)).toEqual(["b"]);
      expect(blocks.every((b) => !b.text.includes("숨겨진"))).toBe(true);
    });
  });

  describe("UI interactive / landmark elements are skipped", () => {
    it("skips text inside <nav>", () => {
      body.innerHTML = `
        <nav><span>네비게이션</span></nav>
        <div id="b" style="display:block">본문 콘텐츠입니다</div>`;
      const blocks = scan();
      expect(blocks.map((b) => b.el.id)).toEqual(["b"]);
    });

    it("skips text inside role='menu' elements", () => {
      body.innerHTML = `
        <ul role="menu"><li role="menuitem">메뉴 항목</li></ul>
        <div id="b" style="display:block">본문 콘텐츠입니다</div>`;
      const blocks = scan();
      expect(blocks.map((b) => b.el.id)).toEqual(["b"]);
    });

    it("skips button text but includes timestamp from button in parent block", () => {
      body.innerHTML = `<div id="p"><button>07:29:29</button> 샌즈전 클리어 판 시작</div>`;
      const blocks = scan();
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.el.id).toBe("p");
      expect(blocks[0]!.text.trim()).toBe("07:29:29 샌즈전 클리어 판 시작");
    });
  });

  describe("short <a> link skipping", () => {
    it("skips <a> with text shorter than 12 characters", () => {
      body.innerHTML = `<div id="b" style="display:block">본문 <a href="#">짧은링크</a> 계속</div>`;
      const blocks = scan();
      expect(blocks.map((b) => b.el.id)).toEqual(["b"]);
      expect(blocks[0]!.text).not.toContain("짧은링크");
    });

    it("includes <a> with text >= 12 characters", () => {
      body.innerHTML = `<div id="b" style="display:block">본문 <a href="#">이것은긴링크제목입니다요</a> 계속</div>`;
      const blocks = scan();
      expect(blocks.map((b) => b.el.id)).toEqual(["b"]);
      expect(blocks[0]!.text).toContain("이것은긴링크제목입니다요");
    });
  });

  describe("UI label heuristics", () => {
    it("drops short bold text (font-weight:700, < 40 chars)", () => {
      body.innerHTML = `<div id="b" style="display:block;font-weight:700">굵은제목</div>`;
      const blocks = scan();
      expect(blocks.map((b) => b.el.id)).toEqual([]);
    });

    it("does NOT drop short bold heading (H2)", () => {
      body.innerHTML = `<h2 id="h" style="font-weight:700">굵은 제목</h2>`;
      const blocks = scan();
      expect(blocks.map((b) => b.el.id)).toEqual(["h"]);
    });

    it("drops block with fewer than 2 ko/ja characters", () => {
      body.innerHTML = `<div style="display:block">a한b</div>`;
      const blocks = scan();
      expect(blocks).toHaveLength(0);
    });

    it("drops block with UI class token (e.g. 'name')", () => {
      body.innerHTML = `<div id="n" class="user-name" style="display:block">사용자이름</div>`;
      const blocks = scan();
      expect(blocks.map((b) => b.el.id)).toEqual([]);
    });

    it("does not drop long prose even with UI class token when >= 40 chars", () => {
      // A 40-char block with UI class token should not be dropped by rule (b)
      body.innerHTML = `<div id="b" class="status" style="display:block">이것은충분히긴텍스트입니다이것은충분히긴텍스트입니다이것은충분히긴텍스트입니다가나다라</div>`;
      const blocks = scan();
      expect(blocks.map((b) => b.el.id)).toEqual(["b"]);
    });

    it("drops narrow-rect blocks (mocked width 60)", () => {
      body.innerHTML = `<div id="n" style="display:block">좁은 열의 텍스트입니다</div>`;
      const el = document.getElementById("n")!;
      vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
        width: 60, height: 20, top: 0, left: 0, right: 60, bottom: 20, x: 0, y: 0, toJSON: () => {},
      });
      const blocks = scan();
      expect(blocks.map((b) => b.el.id)).toEqual([]);
      vi.restoreAllMocks();
    });

    it("does not drop narrow-rect for headings (H1-H6 bypass rule a but not d)", () => {
      // Rule (d) applies to ALL elements including headings; test that the mock works
      body.innerHTML = `<h1 id="h">좁은 제목입니다</h1>`;
      const el = document.getElementById("h")!;
      // No mock → rect.width = 0 → rule (d) doesn't fire → heading passes
      const blocks = scan();
      expect(blocks.map((b) => b.el.id)).toEqual(["h"]);
    });
  });

  describe("BR elements produce \\n in block text", () => {
    it("BR in a block becomes a newline", () => {
      body.innerHTML = `<div id="b" style="display:block">첫 번째<br>두 번째<br>세 번째</div>`;
      const blocks = scan();
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.text).toBe("첫 번째\n두 번째\n세 번째");
    });
  });
});

describe("blockText", () => {
  it("re-reads the current text of a block, excluding nested blocks and marked nodes", () => {
    body.innerHTML = `<div id="b" style="display:block">첫 문장 <span>둘째 <b>셋</b></span><p>중첩 블록</p><span data-wst-translation="true">Hello</span></div>`;
    const b = document.getElementById("b")!;
    expect(blockText(b)).toBe("첫 문장 둘째 셋");
    b.querySelector("span > b")!.textContent = "셋 다시";
    expect(blockText(b)).toBe("첫 문장 둘째 셋 다시");
  });

  it("includes BR as \\n for the owning block", () => {
    body.innerHTML = `<div id="b" style="display:block">줄1<br>줄2<br>줄3</div>`;
    const b = document.getElementById("b")!;
    expect(blockText(b)).toBe("줄1\n줄2\n줄3");
  });
});
