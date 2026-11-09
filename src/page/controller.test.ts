import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageTranslator, type PageTranslatorDeps } from "./controller";

const tick = () => new Promise((r) => setTimeout(r, 0));
// scans, mutation debounce and IO reports are all timer-driven; drain a few ticks
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};
const seed = `
  <div id="b1" style="display:block">첫 블록 텍스트</div>
  <div id="chat" data-wst-chat-container><div id="cc" style="display:block">채팅 블록 텍스트</div></div>`;

class FakeIO {
  static all: FakeIO[] = [];
  entries = new Map<Element, boolean>();
  rootMargin?: string;
  constructor(
    private cb: (entries: Array<{ isIntersecting: boolean; target: Element }>, o: FakeIO) => void,
    opts?: { rootMargin?: string },
  ) {
    FakeIO.all.push(this);
    this.rootMargin = opts?.rootMargin;
  }
  private report(el: Element): void {
    this.cb([{ isIntersecting: this.entries.get(el) ?? false, target: el }], this);
  }
  observe(el: Element): void {
    if (!this.entries.has(el)) this.entries.set(el, true); // new targets start intersecting
    // real IO reports asynchronously; keep it a timer so dropped->observe->report stays a warm loop, not a hang
    setTimeout(() => this.report(el), 0);
  }
  unobserve(el: Element): void {
    this.entries.delete(el);
  }
  disconnect(): void {
    this.entries.clear();
  }
  show(el: Element, visible = true): void {
    this.entries.set(el, visible);
    this.report(el);
  }
}

const DROPPED = new Error("dropped");

function make(translate?: (t: string) => Promise<string>, status?: () => Promise<{ state: string }>) {
  const calls: string[] = [];
  const deps: PageTranslatorDeps = {
    document,
    status: status ?? (() => Promise.resolve({ state: "available" })),
    translate: (t) => {
      calls.push(t);
      return translate ? translate(t) : Promise.resolve(`T:${t}`);
    },
    debounceMs: 0,
    // real MutationObserver, fake IntersectionObserver (jsdom has none)
    IntersectionObserver: FakeIO as unknown as PageTranslatorDeps["IntersectionObserver"],
  };
  const t = createPageTranslator(deps);
  t.start();
  const io = FakeIO.all[FakeIO.all.length - 1]!;
  return { t, io, calls };
}

const nodeOf = (block: Element): HTMLElement =>
  block.parentElement!.querySelector<HTMLElement>("[data-wst-translation][data-wst-page]")!;

beforeEach(() => {
  FakeIO.all = [];
  document.body.innerHTML = seed;
});
afterEach(() => {
  FakeIO.all = [];
});

describe("createPageTranslator", () => {
  it("translates visible blocks below the original, skips chat containers", async () => {
    const { t, io, calls } = make();
    expect(io.rootMargin).toBe("300px 0px");
    expect(io.entries.has(document.getElementById("b1")!)).toBe(true);
    expect(io.entries.has(document.getElementById("cc")!)).toBe(false); // chat is the chat engine's job
    await settle();
    expect(calls).toEqual(["첫 블록 텍스트"]);
    const b1 = document.getElementById("b1")!;
    expect(b1.nextElementSibling!.getAttribute("data-wst-page")).toBe("true");
    expect(nodeOf(b1).textContent).toBe("T:첫 블록 텍스트");
    expect(b1.textContent).toBe("첫 블록 텍스트"); // original untouched
    expect(t.stats()).toEqual({ active: true, translated: 1 });
    t.stop();
  });

  it("chat messages that arrive AFTER start are never translated by the page engine", async () => {
    const { t, calls } = make();
    await settle();
    calls.length = 0;
    const chat = document.getElementById("chat")!;
    const msg = document.createElement("div");
    msg.style.display = "block";
    msg.textContent = "나중에 온 채팅 메시지";
    chat.appendChild(msg);
    const nested = document.createElement("div");
    nested.innerHTML = `<span style="display:block">깊이 중첩된 채팅</span>`;
    chat.appendChild(nested);
    await settle();
    await settle();
    expect(calls).toEqual([]);
    expect(chat.querySelector("[data-wst-translation]")).toBeNull();
    t.stop();
  });

  it("inside-placement translations carry the page marker, so stop() removes them", async () => {
    document.body.innerHTML = `<div style="display:flex"><div id="f1" style="display:block">플렉스 안의 블록</div></div>`;
    const { t } = make();
    await settle();
    const f1 = document.getElementById("f1")!;
    const node = f1.querySelector<HTMLElement>("[data-wst-translation]")!;
    expect(node.getAttribute("data-wst-page")).toBe("true");
    t.stop();
    expect(document.querySelector("[data-wst-translation]")).toBeNull();
  });

  it("multi-line text: each translation goes directly under its own line; stop() removes them all", async () => {
    document.body.innerHTML = `<div id="m" style="display:block"><button type="button">0:02:46</button> 메리 키타<br><button type="button">0:03:07</button> 병원 다녀온 메리<br>🎮</div>`;
    const { t, calls } = make((s) => Promise.resolve(s.replace(/[가-힣]+/g, "X")));
    await settle();
    await settle();
    const m = document.getElementById("m")!;
    const nodes = [...m.querySelectorAll<HTMLElement>("[data-wst-translation]")];
    expect(nodes.map((n) => n.textContent)).toEqual(["X X", "X X X"]); // per line, timestamp not repeated
    expect(m.nextElementSibling).toBeNull(); // nothing separated below the whole text
    expect(nodes[0]!.previousElementSibling!.tagName).toBe("BR");
    expect(calls.every((c) => !c.includes("\n"))).toBe(true); // translated line by line
    expect(t.stats().translated).toBe(1);
    t.stop();
    expect(document.querySelector("[data-wst-translation]")).toBeNull();
  });

  it("off-screen blocks translate only once they intersect", async () => {
    document.body.innerHTML = `<div id="far" style="display:block">화면 밖 텍스트</div>`;
    const { t, io, calls } = make();
    io.entries.set(document.getElementById("far")!, false);
    await settle();
    expect(calls).toEqual([]);
    io.show(document.getElementById("far")!);
    await settle();
    expect(calls).toEqual(["화면 밖 텍스트"]);
    expect(nodeOf(document.getElementById("far")!).textContent).toBe("T:화면 밖 텍스트");
    t.stop();
  });

  it("changed text retranslates and updates the node instead of duplicating", async () => {
    const { t, calls } = make();
    await settle();
    document.getElementById("b1")!.textContent = "Read more가 눌린 후 훨씬 긴 텍스트입니다";
    await settle(); // debounce runs through a real MutationObserver
    expect(calls).toEqual(["첫 블록 텍스트", "Read more가 눌린 후 훨씬 긴 텍스트입니다"]);
    const b1 = document.getElementById("b1")!;
    expect(b1.parentElement!.querySelectorAll("[data-wst-translation]")).toHaveLength(1);
    expect(nodeOf(b1).textContent).toBe("T:Read more가 눌린 후 훨씬 긴 텍스트입니다");
    t.stop();
  });

  it("mutation loop guard: changes inside our own nodes never trigger a rescan", async () => {
    const { t, calls } = make();
    await settle();
    nodeOf(document.getElementById("b1")!).textContent = "누가 노드를 더럽혔다";
    await settle();
    expect(calls).toEqual(["첫 블록 텍스트"]); // no retranslation
    expect(document.getElementById("b1")!.textContent).toBe("첫 블록 텍스트");
    t.stop();
  });

  it("dropped jobs are re-observed and retried when still visible", async () => {
    let fail = true;
    const { t, io, calls } = make((text) => (fail ? Promise.reject(DROPPED) : Promise.resolve(`T:${text}`)));
    await settle(); // queue retries internally, then reports dropped; the block is re-observed
    expect(calls.length).toBeGreaterThan(1); // retried, still failing while fail=true
    fail = false;
    io.show(document.getElementById("b1")!); // a re-observation reports visibility again
    await settle();
    expect(calls[calls.length - 1]).toBe("첫 블록 텍스트");
    expect(nodeOf(document.getElementById("b1")!).textContent).toBe("T:첫 블록 텍스트");
    t.stop();
  });

  it("not-ready blocks are retried on their next visibility event", async () => {
    let now = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now); // manual clock for the readiness throttle
    let state = "downloadable";
    const { t, io, calls } = make(undefined, () => Promise.resolve({ state }));
    await settle();
    expect(calls).toEqual([]); // model not ready: nothing enqueued, original untouched
    expect(t.stats().translated).toBe(0);
    now += 6000; // jump past the 5s readiness throttle
    state = "available";
    io.show(document.getElementById("b1")!); // the block is still requested, so visibility retries it
    await settle();
    expect(calls).toEqual(["첫 블록 텍스트"]);
    expect(t.stats()).toEqual({ active: true, translated: 1 });
    nowSpy.mockRestore();
    t.stop();
  });

  it("stop() cleans everything up and stats reset", async () => {
    const { t, io } = make();
    await settle();
    expect(document.querySelectorAll("[data-wst-page]")).toHaveLength(1);
    expect(document.querySelector("style[data-wst-style]")).toBeTruthy();
    t.stop();
    expect(document.querySelectorAll("[data-wst-page]")).toHaveLength(0);
    expect(document.querySelector("style[data-wst-style]")).toBeNull();
    expect(io.entries.size).toBe(0); // disconnected
    expect(t.stats()).toEqual({ active: false, translated: 0 });
    t.start(); // restart works: style re-created, blocks re-found
    expect(document.querySelector("style[data-wst-style]")).toBeTruthy();
    t.stop();
  });

  it("start() is idempotent", async () => {
    const { t, io, calls } = make();
    t.start();
    t.start();
    await settle();
    expect(calls).toEqual(["첫 블록 텍스트"]); // scanned + translated once
    expect(FakeIO.all).toHaveLength(1);
    expect(io.entries.size).toBe(1);
    t.stop();
  });

  describe("floating ui labels", () => {
    const buttonBody = `<button id="btn">팔로우</button>`;

    function fakeOverlay() {
      return { setLabel: vi.fn(), removeLabel: vi.fn(), relayout: vi.fn(), destroy: vi.fn(), count: () => 0 };
    }

    function makeWithOverlay(ov: ReturnType<typeof fakeOverlay>, opts?: Partial<PageTranslatorDeps>) {
      const calls: string[] = [];
      const deps: PageTranslatorDeps = {
        document,
        status: () => Promise.resolve({ state: "available" }),
        translate: (t) => {
          calls.push(t);
          return Promise.resolve(`T:${t}`);
        },
        debounceMs: 0,
        IntersectionObserver: FakeIO as unknown as PageTranslatorDeps["IntersectionObserver"],
        overlay: ov,
        ...opts,
      };
      const t = createPageTranslator(deps);
      t.start();
      return { t, calls };
    }

    it("ui blocks translate through overlay.setLabel; nothing is inserted into the page", async () => {
      document.body.innerHTML = buttonBody;
      const ov = fakeOverlay();
      const { t, calls } = makeWithOverlay(ov);
      await settle();
      expect(calls).toEqual(["팔로우"]);
      expect(ov.setLabel).toHaveBeenCalledWith(document.getElementById("btn"), "T:팔로우");
      expect(document.body.querySelector("[data-wst-translation]")).toBeNull(); // no in-flow node
      expect(t.stats()).toEqual({ active: true, translated: 1 });
      t.stop();
      expect(ov.destroy).toHaveBeenCalledTimes(1);
    });

    it("uiLabels:false ignores ui blocks like the old behavior", async () => {
      document.body.innerHTML = buttonBody;
      const ov = fakeOverlay();
      const { t, calls } = makeWithOverlay(ov, { uiLabels: false });
      await settle();
      expect(calls).toEqual([]);
      expect(ov.setLabel).not.toHaveBeenCalled();
      t.stop();
    });

    it("stats count content translations and ui labels together", async () => {
      document.body.innerHTML = seed + `<button id="btn">팔로우</button>`;
      const ov = fakeOverlay();
      const { t } = makeWithOverlay(ov);
      await settle();
      expect(t.stats()).toEqual({ active: true, translated: 2 });
      expect(ov.setLabel).toHaveBeenCalledTimes(1);
      t.stop();
    });

    it("removed ui elements lose their label (and tracking) on the next flush", async () => {
      document.body.innerHTML = buttonBody;
      const ov = fakeOverlay();
      const { t } = makeWithOverlay(ov);
      await settle();
      const btn = document.getElementById("btn")!;
      btn.remove();
      await settle();
      expect(ov.removeLabel).toHaveBeenCalledWith(btn);
      expect(t.stats().translated).toBe(0);
      t.stop();
    });
  });
});
