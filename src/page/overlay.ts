/**
 * Floating-label overlay for UI text (menus, buttons): translations live in ONE of our own layers
 * appended to document.documentElement — nothing is ever inserted into the page's layout. The only
 * things attached to page elements are mouseenter/mouseleave/focus/blur listeners, all removed on
 * removeLabel/destroy. Every label carries data-wst-translation + data-wst-page so the rescan never
 * touches it and stop()-style cleanup finds it; textContent only (no innerHTML; Trusted Types safe).
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
 * yes to `isFree`; otherwise null (safety bias: no label beats a hidden label).
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
  /** Create or update the floating label for `target`. */
  setLabel(target: HTMLElement, text: string): void;
  removeLabel(target: HTMLElement): void;
  /** Re-place every label (rAF-throttled: at most one pass per frame). */
  relayout(): void;
  destroy(): void;
  count(): number;
}

// Tags whose rendering hides the space behind them for our sampling probe
const FILLED_TAGS = new Set(["IMG", "SVG", "VIDEO", "CANVAS", "IFRAME", "INPUT", "TEXTAREA", "SELECT", "OBJECT", "EMBED"]);

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

export function createOverlay(doc: Document, deps: OverlayDeps = {}): OverlayApi {
  const win = doc.defaultView;
  const raf = deps.rAF ?? ((cb: () => void) => win?.requestAnimationFrame(cb) ?? 0);
  const viewport = deps.viewport ?? (() => ({ w: win?.innerWidth ?? 0, h: win?.innerHeight ?? 0 }));
  const fromPoint = (x: number, y: number): Element | null =>
    deps.elementFromPoint ? deps.elementFromPoint(x, y) : (doc.elementFromPoint ? doc.elementFromPoint(x, y) : null);

  let layer: HTMLDivElement | null = null;
  interface Entry {
    el: HTMLDivElement;
    show: () => void;
    hide: () => void;
    /** Last good placement, relative to the target: scroll just moves it along instead of re-probing the page. */
    spot?: { dx: number; dy: number; w: number; h: number; tw: number; th: number };
    /** A full probe was already tried (and found nothing): skip it until the next settle/resize. */
    tried?: boolean;
  }
  const labels = new Map<HTMLElement, Entry>();
  let scheduled = false;
  let needFull = false; // resize or scroll-settled: re-probe every label
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  const canHit = !!(deps.elementFromPoint || doc.elementFromPoint);

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
   * DOM "is this rect empty" probe: a grid with a point about every 8px × 5px (corners and edges included), capped
   * at 60 points. Our own labels have pointer-events:none, so elementFromPoint never reports them: the page decides.
   */
  const PAD = 3; // keep a little air around the label: probe a slightly larger rect than the label itself
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
      // relayout on scroll/resize; capture so inner scrollers (overflow containers) trigger us too
      win?.addEventListener("scroll", onScroll, { capture: true, passive: true });
      win?.addEventListener("resize", onResize);
    }
    return layer;
  }

  function removeLabel(target: HTMLElement): void {
    const lab = labels.get(target);
    if (!lab) return;
    target.removeEventListener("mouseenter", lab.show);
    target.removeEventListener("mouseleave", lab.hide);
    target.removeEventListener("focus", lab.show);
    target.removeEventListener("blur", lab.hide);
    lab.el.remove();
    labels.delete(target);
  }

  // Visible = on screen AND actually painted at its centre: an element clipped by a scroller or covered by a dialog
  // is not the one under that point, so it gets no label (labels never float over the wrong thing).
  function visible(target: HTMLElement, r: Rect, vp: { w: number; h: number }): boolean {
    if ((r.width === 0 && r.height === 0) || r.right <= 0 || r.bottom <= 0 || r.left >= vp.w || r.top >= vp.h) return false;
    if (!canHit) return true;
    const hit = fromPoint(clamp(r.left + r.width / 2, 0, vp.w - 1), clamp(r.top + r.height / 2, 0, vp.h - 1));
    return !!hit && target.contains(hit);
  }

  function relayoutNow(): void {
    scheduled = false;
    if (!layer) return;
    const full = needFull;
    needFull = false;
    const vp = viewport();
    const placed: Rect[] = [];
    for (const [target, lab] of [...labels]) {
      if (!target.isConnected) {
        removeLabel(target); // element left the DOM: label goes with it
        continue;
      }
      if (full) lab.tried = false;
      const r = rectOf(target);
      if (!visible(target, r, vp)) {
        lab.el.style.display = "none";
        lab.spot = undefined;
        lab.tried = false; // probe again when it becomes visible
        continue;
      }
      // cheap path: same target size and a known spot, so just carry the label along with it
      if (!full && lab.spot && lab.spot.tw === r.width && lab.spot.th === r.height) {
        const x = r.left + lab.spot.dx;
        const y = r.top + lab.spot.dy;
        const cr = mkRect(x, y, lab.spot.w, lab.spot.h);
        if (cr.left >= 2 && cr.top >= 2 && cr.right <= vp.w - 2 && cr.bottom <= vp.h - 2) {
          lab.el.style.display = "block";
          lab.el.style.left = `${x}px`;
          lab.el.style.top = `${y}px`;
          placed.push(cr);
          continue;
        }
      }
      if (lab.tried && !lab.spot) {
        lab.el.style.display = "none"; // nothing free earlier: stay hidden (tooltip mode) until the next settle
        continue;
      }
      const size = measure(lab.el);
      const spot = chooseSpot(r, size, vp, isFree, placed);
      lab.tried = true;
      if (spot) {
        lab.spot = { dx: spot.x - r.left, dy: spot.y - r.top, w: size.w, h: size.h, tw: r.width, th: r.height };
        lab.el.style.display = "block";
        lab.el.style.left = `${spot.x}px`;
        lab.el.style.top = `${spot.y}px`;
        placed.push(mkRect(spot.x, spot.y, size.w, size.h));
      } else {
        // no free space: hide here and fall back to hover/focus tooltip mode
        lab.spot = undefined;
        lab.el.style.display = "none";
      }
    }
  }

  // scroll: carry labels along every frame; once scrolling stops, re-probe the free space once
  function onScroll(): void {
    schedule();
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      needFull = true;
      schedule();
    }, 150);
  }

  function onResize(): void {
    needFull = true;
    schedule();
  }

  function schedule(): void {
    if (scheduled) return; // one relayout per frame
    scheduled = true;
    raf(() => relayoutNow());
  }

  function setLabel(target: HTMLElement, text: string): void {
    let lab = labels.get(target);
    if (!lab) {
      const el = doc.createElement("div");
      el.setAttribute("data-wst-translation", "true");
      el.setAttribute("data-wst-page", "true");
      el.setAttribute("data-wst-float", "");
      ensureLayer().appendChild(el);
      const entry = { el, show: () => show(target), hide: () => hide(target) };
      target.addEventListener("mouseenter", entry.show);
      target.addEventListener("mouseleave", entry.hide);
      target.addEventListener("focus", entry.show);
      target.addEventListener("blur", entry.hide);
      labels.set(target, entry);
      lab = entry;
    }
    if (lab.el.textContent !== text) lab.el.textContent = text;
    schedule();
  }

  // Tooltip mode: same spots, but no isFree/taken — the user asked for it. If everything is off-viewport,
  // bottom-left clamped into the viewport.
  function show(target: HTMLElement): void {
    const lab = labels.get(target);
    if (!lab || !layer) return;
    const vp = viewport();
    const r = rectOf(target);
    const size = measure(lab.el);
    const spot = chooseSpot(r, size, vp, () => true, []);
    let x: number, y: number;
    if (spot) {
      x = spot.x;
      y = spot.y;
    } else {
      x = clamp(r.left, 2, Math.max(2, vp.w - size.w - 2));
      y = clamp(r.bottom + 2, 2, Math.max(2, vp.h - size.h - 2));
    }
    lab.el.style.left = `${x}px`;
    lab.el.style.top = `${y}px`;
    lab.el.style.display = "block";
  }

  function hide(target: HTMLElement): void {
    const lab = labels.get(target);
    if (lab) lab.el.style.display = "none";
  }

  return {
    setLabel,
    removeLabel,
    relayout: schedule,
    destroy(): void {
      for (const [target, lab] of [...labels]) {
        target.removeEventListener("mouseenter", lab.show);
        target.removeEventListener("mouseleave", lab.hide);
        target.removeEventListener("focus", lab.show);
        target.removeEventListener("blur", lab.hide);
        lab.el.remove();
      }
      labels.clear();
      layer?.remove();
      layer = null;
      win?.removeEventListener("scroll", onScroll, { capture: true });
      win?.removeEventListener("resize", onResize);
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = null;
    },
    count: () => labels.size,
  };
}
