import { beforeEach, describe, expect, it } from "vitest";
import { blockText, findBlocks, type PageBlock } from "./blocks";

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
    body.innerHTML = `<div id="b" style="display:block">바깥 <a href="#">링크</a> <span style="display:inline">인라인</span> 끝</div>`;
    const blocks = scan();
    expect(blocks.map((b) => b.el.id)).toEqual(["b"]);
    expect(blocks[0]!.text).toBe("바깥 링크 인라인 끝"); // span/a text belongs to the parent block
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
});

describe("blockText", () => {
  it("re-reads the current text of a block, excluding nested blocks and marked nodes", () => {
    body.innerHTML = `<div id="b" style="display:block">첫 문장 <span>둘째 <b>셋</b></span><p>중첩 블록</p><span data-wst-translation="true">Hello</span></div>`;
    const b = document.getElementById("b")!;
    expect(blockText(b)).toBe("첫 문장 둘째 셋");
    b.querySelector("span > b")!.textContent = "셋 다시";
    expect(blockText(b)).toBe("첫 문장 둘째 셋 다시");
  });
});
