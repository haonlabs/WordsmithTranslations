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

describe("createOverlay", () => {
  type TestDeps = OverlayDeps & {
    elementFromPointMock: (x: number, y: number) => Element | null;
  };
  let elementFromPointMock: ReturnType<typeof vi.fn<(x: number, y: number) => Element | null>>;
  let rAFMock: ReturnType<typeof vi.fn<(cb: () => void) => void>>;
  let deps: TestDeps;
  let overlay: ReturnType<typeof createOverlay>;

  const flushFrame = async () => new Promise((r) => setTimeout(r, 0));
  const floatLabel = (): HTMLElement => document.querySelector<HTMLElement>("[data-wst-float]")!;
  const mockRect = (el: Element, r: Partial<Rect>): void => {
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, ...r } as DOMRect);
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    elementFromPointMock = vi.fn(() => null);
    rAFMock = vi.fn((cb: () => void) => {
      return setTimeout(cb, 0) as unknown as void;
    });
    deps = {
      elementFromPointMock,
      elementFromPoint: (x, y) => elementFromPointMock(x, y),
      viewport: () => VP,
      rAF: (cb) => {
        rAFMock(cb);
        return setTimeout(cb, 0) as unknown as number;
      },
    };
    overlay = createOverlay(document, deps);
  });

  afterEach(() => {
    overlay.destroy();
    vi.restoreAllMocks();
  });

  it("labels live in our own documentElement layer and land to the right of the target", async () => {
    const target = document.body.appendChild(document.createElement("button"));
    target.textContent = "팔로우";
    mockRect(target, rect(0, 0, 100, 40));
    overlay.setLabel(target, "T:팔로우");
    await flushFrame();
    const layer = document.documentElement.querySelector<HTMLElement>("[data-wst-overlay]")!;
    expect(layer).toBeTruthy();
    const label = floatLabel();
    expect(label).toBeTruthy();
    expect(label.parentElement).toBe(layer);
    expect(label.getAttribute("data-wst-translation")).toBe("true");
    expect(label.getAttribute("data-wst-page")).toBe("true");
    expect(label.textContent).toBe("T:팔로우");
    expect(label.style.display).toBe("block");
    expect(label.style.left).toBe("106px"); // right, centered on the (sizeless) jsdom label
    expect(label.style.top).toBe("20px");
    expect(overlay.count()).toBe(1);
    // page layout untouched
    expect(target.children).toHaveLength(0);
  });

  it("setLabel twice updates the text instead of duplicating", async () => {
    const target = document.body.appendChild(document.createElement("button"));
    mockRect(target, rect(0, 0, 100, 40));
    overlay.setLabel(target, "A");
    overlay.setLabel(target, "B");
    await flushFrame();
    expect(overlay.count()).toBe(1);
    expect(document.querySelectorAll("[data-wst-float]")).toHaveLength(1);
    expect(floatLabel().textContent).toBe("B");
  });

  it("invisible targets hide their label; detached targets are removed", async () => {
    const hidden = document.body.appendChild(document.createElement("button"));
    const gone = document.body.appendChild(document.createElement("button"));
    overlay.setLabel(hidden, "A");
    overlay.setLabel(gone, "B");
    gone.remove();
    await flushFrame();
    expect(overlay.count()).toBe(1); // gone removed
    expect(floatLabel().style.display).toBe("none"); // hidden target → hidden label
  });

  it("no free space → tooltip mode: appears on mouseenter, hides on mouseleave", async () => {
    const target = document.body.appendChild(document.createElement("button"));
    overlay.setLabel(target, "T");
    const isFree = () => false;
    overlay.destroy();
    overlay = createOverlay(document, { ...deps, isFree });
    overlay.setLabel(target, "T");
    await flushFrame();
    expect(floatLabel().style.display).toBe("none"); // relayout found nothing
    target.dispatchEvent(new Event("mouseenter"));
    expect(floatLabel().style.display).toBe("block"); // tooltip shown (jsdom label measures 0×0 → right spot)
    target.dispatchEvent(new Event("mouseleave"));
    expect(floatLabel().style.display).toBe("none");
  });

  it("tooltip clamps bottom-left into the viewport when all candidates are off-viewport", async () => {
    const target = document.body.appendChild(document.createElement("button"));
    document.documentElement.appendChild(document.createElement("div")); // noise
    overlay.setLabel(target, "T");
    await flushFrame();
    mockRect(target, rect(0, 0, 796, 596)); // fills the viewport
    mockRect(floatLabel(), { left: 0, top: 0, width: 240, height: 20, right: 240, bottom: 20 });
    overlay.relayout();
    await flushFrame();
    expect(floatLabel().style.display).toBe("none"); // nothing fits
    target.dispatchEvent(new Event("mouseenter"));
    const label = floatLabel();
    expect(label.style.display).toBe("block");
    expect(label.style.left).toBe("2px"); // clamped into the viewport
    expect(label.style.top).toBe("578px"); // 600 - 20 - 2
    target.dispatchEvent(new Event("mouseleave"));
    expect(label.style.display).toBe("none");
  });

  it("relayout is throttled to one pass per frame", async () => {
    const target = document.body.appendChild(document.createElement("button"));
    overlay.setLabel(target, "A");
    overlay.relayout();
    overlay.relayout();
    overlay.relayout();
    expect(rAFMock).toHaveBeenCalledTimes(1);
    await flushFrame();
  });

  it("destroy removes the layer, all labels and all listeners", async () => {
    const target = document.body.appendChild(document.createElement("button"));
    mockRect(target, rect(0, 0, 100, 40));
    overlay.setLabel(target, "A");
    await flushFrame();
    expect(document.querySelectorAll("[data-wst-float]")).toHaveLength(1);
    overlay.destroy();
    expect(document.querySelector("[data-wst-overlay]")).toBeNull();
    expect(document.querySelector("[data-wst-float]")).toBeNull();
    expect(overlay.count()).toBe(0);
    // listeners gone: dispatch must not resurrect a label or leak nodes
    target.dispatchEvent(new Event("mouseenter"));
    expect(document.querySelector("[data-wst-float]")).toBeNull();
    expect(target.children).toHaveLength(0);
  });
});
