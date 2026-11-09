/**
 * Floating translation tooltips for UI text (menus, buttons): shown ONLY while the pointer is over (or the keyboard
 * focus is on) the element. Translations live in ONE of our own layers appended to document.documentElement, so
 * nothing is ever inserted into the page's layout. The only things attached to page elements are
 * mouseenter/mouseleave/focus/blur listeners, all removed on removeLabel/destroy. Every label carries
 * data-wst-translation + data-wst-page so the rescan never touches it and stop()-style cleanup finds it;
 * textContent only (no innerHTML; Trusted Types safe).
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const mkRect = (x: number, y: number, w: number, h: number): Rect => ({
  left: x,
  top: y,
  right: x + w,
  bottom: y + h,
  width: w,
  height: h,
});

/**
 * PURE spot picker. Candidates in order: right (vertically centered), bottom-left, top-left, left.
 * A candidate wins when it fits the viewport (2px margin), avoids every rect in `taken` and answers
 * yes to `isFree`; otherwise null.
 */
export function chooseSpot(
  target: Rect,
  size: { w: number; h: number },
  viewport: { w: number; h: number },
  isFree: (r: Rect) => boolean,
  taken: Rect[],
): { x: number; y: number } | null {
  const centerY = target.top + (target.height - size.h) / 2;
  const cands: Array<[number, number]> = [
    [target.right + 6, centerY], // right
    [target.left, target.bottom + 2], // bottom-left
    [target.left, target.top - size.h - 2], // top-left
    [target.left - size.w - 6, centerY], // left
  ];
  for (const [x, y] of cands) {
    const r = mkRect(x, y, size.w, size.h);
    if (r.left < 2 || r.top < 2 || r.right > viewport.w - 2 || r.bottom > viewport.h - 2) continue;
    if (taken.some((t) => t.left < r.right && r.left < t.right && t.top < r.bottom && r.top < t.bottom)) continue;
    if (!isFree(r)) continue;
    return { x, y };
  }
  return null;
}

export interface OverlayDeps {
  /** Overrides the DOM emptiness probe (tests). */
  isFree?: (rect: Rect) => boolean;
  viewport?: () => { w: number; h: number };
  elementFromPoint?: (x: number, y: number) => Element | null;
  /** Frame scheduler (tests use setTimeout). */
  rAF?: (cb: () => void) => unknown;
}

export interface OverlayApi {
  /** Create or update the translation tooltip for `target` (hidden until the pointer is over it). */
  setLabel(target: HTMLElement, text: string): void;
  removeLabel(target: HTMLElement): void;
  /** Re-place the tooltip that is showing right now (page scrolled or resized); hides it if the target is gone. */
  relayout(): void;
  destroy(): void;
  count(): number;
}

// Tags whose rendering hides the space behind them for our sampling probe
const FILLED_TAGS = new Set(["IMG", "SVG", "VIDEO", "CANVAS", "IFRAME", "INPUT", "TEXTAREA", "SELECT", "OBJECT", "EMBED"]);
const SWEEP_AT = 200; // purge labels of detached elements once this many have piled up

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

export function createOverlay(doc: Document, deps: OverlayDeps = {}): OverlayApi {
  const win = doc.defaultView;
  const raf = deps.rAF ?? ((cb: () => void) => win?.requestAnimationFrame(cb) ?? 0);
  const viewport = deps.viewport ?? (() => ({ w: win?.innerWidth ?? 0, h: win?.innerHeight ?? 0 }));
  const fromPoint = (x: number, y: number): Element | null =>
    deps.elementFromPoint ? deps.elementFromPoint(x, y) : doc.elementFromPoint ? doc.elementFromPoint(x, y) : null;

  interface Entry {
    el: HTMLDivElement;
    show: () => void;
    hide: () => void;
  }
  let layer: HTMLDivElement | null = null;
  const labels = new Map<HTMLElement, Entry>();
  let active: HTMLElement | null = null; // the target whose tooltip is showing
  let scheduled = false;

  const rectOf = (el: Element): Rect => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };

  const measure = (label: HTMLDivElement): { w: number; h: number } => {
    label.style.display = "block"; // must be rendered to measure
    const r = label.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };

  // Probe an element at (x, y): filled when it renders opaque content (media/input) or has a direct text
  // node whose client rects cover that spot (2px tolerance). Off-viewport counts as filled.
  const pointFilled = (x: number, y: number): boolean => {
    const vp = viewport();
    if (x < 0 || y < 0 || x >= vp.w || y >= vp.h) return true;
    const el = fromPoint(x, y);
    if (!el) return false;
    if (FILLED_TAGS.has(el.tagName) || el instanceof SVGElement) return true;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType !== Node.TEXT_NODE || !(n as Text).data.trim()) continue;
      const range = doc.createRange();
      range.selectNodeContents(n);
      const rects = (range as Range & { getClientRects?: () => DOMRectList }).getClientRects?.() ?? [];
      for (const r of Array.from(rects)) {
        if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) return true;
      }
    }
    return false;
  };

  /**
   * DOM "is this rect empty" probe: a grid with a point about every 8px × 5px (corners and edges included), capped at
   * 60 points, over the label rect plus 3px of air. Our own labels have pointer-events:none, so elementFromPoint never
   * reports them: the page decides. Only runs on hover, so cost is irrelevant.
   */
  const PAD = 3;
  const isFreeDom = (label: Rect): boolean => {
    const rect = mkRect(label.left - PAD, label.top - PAD, label.width + 2 * PAD, label.height + 2 * PAD);
    const nx = clamp(Math.ceil(rect.width / 8), 2, 12);
    const ny = clamp(Math.ceil(rect.height / 5), 2, 5);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x = rect.left + 1 + (rect.width - 2) * (i / (nx - 1));
        const y = rect.top + 1 + (rect.height - 2) * (j / (ny - 1));
        if (pointFilled(x, y)) return false;
      }
    }
    return true;
  };
  const isFree = deps.isFree ?? isFreeDom;

  function ensureLayer(): HTMLDivElement {
    if (!layer) {
      layer = doc.createElement("div");
      layer.setAttribute("data-wst-overlay", "");
      doc.documentElement.appendChild(layer);
      // a shown tooltip follows its element when the page scrolls/resizes; capture so inner scrollers trigger us too
      win?.addEventListener("scroll", schedule, { capture: true, passive: true });
      win?.addEventListener("resize", schedule);
    }
    return layer;
  }

  function detach(target: HTMLElement, lab: Entry): void {
    target.removeEventListener("mouseenter", lab.show);
    target.removeEventListener("mouseleave", lab.hide);
    target.removeEventListener("focus", lab.show);
    target.removeEventListener("blur", lab.hide);
    lab.el.remove();
    labels.delete(target);
    if (active === target) active = null;
  }

  function removeLabel(target: HTMLElement): void {
    const lab = labels.get(target);
    if (lab) detach(target, lab);
  }

  /** Put the tooltip next to its target: a free spot if there is one, else the first spot that fits, else clamped below. */
  function place(target: HTMLElement, lab: Entry): boolean {
    if (!target.isConnected) return false;
    const vp = viewport();
    const r = rectOf(target);
    if ((r.width === 0 && r.height === 0) || r.right <= 0 || r.bottom <= 0 || r.left >= vp.w || r.top >= vp.h) return false;
    const size = measure(lab.el);
    const spot = chooseSpot(r, size, vp, isFree, []) ?? chooseSpot(r, size, vp, () => true, []);
    const x = spot ? spot.x : clamp(r.left, 2, Math.max(2, vp.w - size.w - 2));
    const y = spot ? spot.y : clamp(r.bottom + 2, 2, Math.max(2, vp.h - size.h - 2));
    lab.el.style.left = `${x}px`;
    lab.el.style.top = `${y}px`;
    lab.el.style.display = "block";
    return true;
  }

  function show(target: HTMLElement): void {
    const lab = labels.get(target);
    if (!lab) return;
    if (active && active !== target) labels.get(active)?.hide();
    if (place(target, lab)) active = target;
    else lab.el.style.display = "none";
  }

  function hide(target: HTMLElement): void {
    const lab = labels.get(target);
    if (lab) lab.el.style.display = "none";
    if (active === target) active = null;
  }

  function relayoutNow(): void {
    scheduled = false;
    if (!active) return;
    const lab = labels.get(active);
    if (!lab) {
      active = null;
      return;
    }
    if (!place(active, lab)) {
      lab.el.style.display = "none"; // scrolled out of view or removed: no tooltip
      if (!active.isConnected) removeLabel(active);
      else active = null;
    }
  }

  function schedule(): void {
    if (scheduled) return; // one relayout per frame
    scheduled = true;
    raf(() => relayoutNow());
  }

  function sweep(): void {
    for (const [target, lab] of [...labels]) if (!target.isConnected) detach(target, lab);
  }

  function setLabel(target: HTMLElement, text: string): void {
    let lab = labels.get(target);
    if (!lab) {
      if (labels.size >= SWEEP_AT) sweep();
      const el = doc.createElement("div");
      el.setAttribute("data-wst-translation", "true");
      el.setAttribute("data-wst-page", "true");
      el.setAttribute("data-wst-float", "");
      ensureLayer().appendChild(el);
      const entry: Entry = { el, show: () => show(target), hide: () => hide(target) };
      target.addEventListener("mouseenter", entry.show);
      target.addEventListener("mouseleave", entry.hide);
      target.addEventListener("focus", entry.show);
      target.addEventListener("blur", entry.hide);
      labels.set(target, entry);
      lab = entry;
    }
    if (lab.el.textContent !== text) {
      lab.el.textContent = text;
      if (active === target) schedule(); // new text may need a different size/spot
    }
  }

  return {
    setLabel,
    removeLabel,
    relayout: schedule,
    destroy(): void {
      for (const [target, lab] of [...labels]) detach(target, lab);
      active = null;
      layer?.remove();
      layer = null;
      win?.removeEventListener("scroll", schedule, { capture: true });
      win?.removeEventListener("resize", schedule);
    },
    count: () => labels.size,
  };
}
