import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseSpot, createOverlay, type OverlayDeps, type Rect } from "./overlay";

const rect = (left: number, top: number, w: number, h: number): Rect => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
  width: w,
  height: h,
});
const VP = { w: 800, h: 600 };
const ok = () => true;

describe("chooseSpot (pure)", () => {
  it("prefers the right, vertically centered", () => {
    expect(chooseSpot(rect(0, 0, 100, 40), { w: 50, h: 20 }, VP, ok, [])).toEqual({ x: 106, y: 10 });
  });

  it("falls back to bottom-left, then top-left, then left", () => {
    const t = rect(200, 200, 100, 40);
    expect(chooseSpot(t, { w: 50, h: 20 }, VP, ok, [])).toEqual({ x: 306, y: 210 });
    expect(chooseSpot(t, { w: 50, h: 20 }, VP, ok, [rect(306, 210, 50, 20)])).toEqual({ x: 200, y: 242 });
    expect(chooseSpot(t, { w: 50, h: 20 }, VP, ok, [rect(306, 210, 50, 20), rect(200, 242, 100, 5)])).toEqual({ x: 200, y: 178 });
    expect(
      chooseSpot(t, { w: 50, h: 20 }, VP, ok, [rect(306, 210, 50, 20), rect(200, 242, 100, 5), rect(200, 178, 100, 5)]),
    ).toEqual({ x: 144, y: 210 });
  });

  it("rejects candidates outside the viewport", () => {
    // target fills the viewport: right and left clip horizontally, top/bottom clip vertically
    expect(chooseSpot(rect(0, 0, 796, 596), { w: 50, h: 20 }, VP, ok, [])).toBeNull();
    // everything just off-margin is rejected too
    expect(chooseSpot(rect(0, 0, 796, 596), { w: 50, h: 21 }, { w: 800, h: 598 }, ok, [])).toBeNull();
  });

  it("rejects candidates colliding with taken rects or failing isFree", () => {
    const t = rect(200, 0, 100, 40);
    expect(chooseSpot(t, { w: 50, h: 20 }, VP, ok, [rect(306, 10, 50, 20)])).toEqual({ x: 200, y: 42 });
    expect(chooseSpot(t, { w: 50, h: 20 }, VP, () => false, [])).toBeNull();
  });
});

describe("createOverlay (hover-only tooltips)", () => {
  let deps: OverlayDeps;
  let overlay: ReturnType<typeof createOverlay>;
  const flushFrame = async () => new Promise((r) => setTimeout(r, 0));
  const floatLabel = (): HTMLElement => document.querySelector<HTMLElement>("[data-wst-float]")!;
  const mockRect = (el: Element, r: Partial<Rect>): void => {
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, ...r } as DOMRect);
  };
  const btn = (r: Rect = rect(0, 0, 100, 40)): HTMLElement => {
    const b = document.body.appendChild(document.createElement("button"));
    b.textContent = "팔로우";
    mockRect(b, r);
    return b;
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    deps = { viewport: () => VP, elementFromPoint: () => null, rAF: (cb) => void setTimeout(cb, 0) };
    overlay = createOverlay(document, deps);
  });
  afterEach(() => {
    overlay.destroy();
    vi.restoreAllMocks();
  });

  it("the label lives in our own documentElement layer and is HIDDEN until the pointer is over the element", () => {
    const target = btn();
    overlay.setLabel(target, "T:팔로우");
    const layer = document.documentElement.querySelector<HTMLElement>("[data-wst-overlay]")!;
    const label = floatLabel();
    expect(label.parentElement).toBe(layer);
    expect(label.getAttribute("data-wst-translation")).toBe("true");
    expect(label.getAttribute("data-wst-page")).toBe("true");
    expect(label.textContent).toBe("T:팔로우");
    expect(label.style.display).not.toBe("block"); // not shown by itself
    expect(target.children).toHaveLength(0); // page layout untouched
    expect(overlay.count()).toBe(1);
  });

  it("mouseenter shows it to the right of the element, mouseleave hides it", () => {
    const target = btn();
    overlay.setLabel(target, "T");
    target.dispatchEvent(new Event("mouseenter"));
    expect(floatLabel().style.display).toBe("block");
    expect(floatLabel().style.left).toBe("106px");
    expect(floatLabel().style.top).toBe("20px");
    target.dispatchEvent(new Event("mouseleave"));
    expect(floatLabel().style.display).toBe("none");
  });

  it("keyboard focus and blur work like hover", () => {
    const target = btn();
    overlay.setLabel(target, "T");
    target.dispatchEvent(new Event("focus"));
    expect(floatLabel().style.display).toBe("block");
    target.dispatchEvent(new Event("blur"));
    expect(floatLabel().style.display).toBe("none");
  });

  it("prefers a spot that is free of page text, and still shows when nothing is free", () => {
    const target = btn(rect(200, 200, 100, 40));
    const freeOnlyBelow = (r: Rect) => r.top > 240; // right/left spots are 'busy', bottom-left is free
    overlay.destroy();
    overlay = createOverlay(document, { ...deps, isFree: freeOnlyBelow });
    overlay.setLabel(target, "T");
    target.dispatchEvent(new Event("mouseenter"));
    expect(floatLabel().style.left).toBe("200px");
    expect(floatLabel().style.top).toBe("242px"); // bottom-left
    target.dispatchEvent(new Event("mouseleave"));
    overlay.destroy();
    overlay = createOverlay(document, { ...deps, isFree: () => false });
    overlay.setLabel(target, "T");
    target.dispatchEvent(new Event("mouseenter"));
    expect(floatLabel().style.display).toBe("block"); // a hover tooltip may overlap: the user asked for it
    expect(floatLabel().style.left).toBe("306px"); // first spot that fits (right)
  });

  it("only one tooltip at a time", () => {
    const a = btn(rect(0, 0, 100, 40));
    const b = btn(rect(0, 100, 100, 40));
    overlay.setLabel(a, "A");
    overlay.setLabel(b, "B");
    a.dispatchEvent(new Event("mouseenter"));
    b.dispatchEvent(new Event("mouseenter")); // pointer jumped without a leave event
    const shown = [...document.querySelectorAll<HTMLElement>("[data-wst-float]")].filter((l) => l.style.display === "block");
    expect(shown.map((l) => l.textContent)).toEqual(["B"]);
  });

  it("setLabel twice updates the text instead of duplicating", () => {
    const target = btn();
    overlay.setLabel(target, "A");
    overlay.setLabel(target, "B");
    expect(overlay.count()).toBe(1);
    expect(document.querySelectorAll("[data-wst-float]")).toHaveLength(1);
    expect(floatLabel().textContent).toBe("B");
  });

  it("a shown tooltip follows its element when the page scrolls, and hides when it scrolls out of view", async () => {
    const target = btn(rect(0, 100, 100, 40));
    overlay.setLabel(target, "T");
    target.dispatchEvent(new Event("mouseenter"));
    expect(floatLabel().style.top).toBe("120px");
    mockRect(target, rect(0, 60, 100, 40)); // scrolled up by 40px
    window.dispatchEvent(new Event("scroll"));
    await flushFrame();
    expect(floatLabel().style.top).toBe("80px");
    mockRect(target, rect(0, -80, 100, 40)); // scrolled out of the viewport
    window.dispatchEvent(new Event("scroll"));
    await flushFrame();
    expect(floatLabel().style.display).toBe("none");
  });

  it("removeLabel and destroy take the label and every listener away", () => {
    const target = btn();
    const add = vi.spyOn(target, "removeEventListener");
    overlay.setLabel(target, "T");
    overlay.removeLabel(target);
    expect(overlay.count()).toBe(0);
    expect(document.querySelector("[data-wst-float]")).toBeNull();
    expect(add.mock.calls.map((c) => c[0]).sort()).toEqual(["blur", "focus", "mouseenter", "mouseleave"]);
    overlay.setLabel(target, "T");
    overlay.destroy();
    expect(document.querySelector("[data-wst-overlay]")).toBeNull();
    expect(overlay.count()).toBe(0);
  });

  it("labels of elements that left the DOM are swept once enough pile up", () => {
    const gone: HTMLElement[] = [];
    for (let i = 0; i < 200; i++) {
      const b = btn();
      overlay.setLabel(b, `L${i}`);
      gone.push(b);
    }
    gone.forEach((b) => b.remove());
    overlay.setLabel(btn(), "fresh"); // the 201st label triggers the sweep
    expect(overlay.count()).toBe(1);
  });
});
