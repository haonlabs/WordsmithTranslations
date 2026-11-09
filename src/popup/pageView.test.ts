import { expect, it } from "vitest";
import type { Status, Lang } from "../shared/translator";
import { toPageView } from "./pageView";

const av: Status = { state: "available" };
const dl: Status = { state: "downloadable" };
const na: Status = { state: "unavailable" };

const s = (ko: Status | null, ja: Status | null): Record<Lang, Status | null> => ({ ko, ja });
const bothAvail = s(av, av);
const bothDl = s(dl, dl);
const oneAvail = s(av, dl);

// helper: base checking input
function base(overrides?: Partial<Parameters<typeof toPageView>[0]>): Parameters<typeof toPageView>[0] {
  return {
    tab: { id: 1, url: "https://example.com" },
    statuses: bothAvail,
    page: { active: false, translated: 0 },
    busy: false,
    failed: false,
    ...overrides,
  };
}

// rule a: tab === null → checking
it("tab null → checking", () => {
  const pv = toPageView(base({ tab: null }));
  expect(pv.tone).toBe("checking");
  expect(pv.chip).toEqual({ text: "…", kind: "setup" });
  expect(pv.hint).toBe("Checking this page…");
  expect(pv.button.disabled).toBe(true);
  expect(pv.button.action).toBeNull();
  expect(pv.button.label).toBe("Translate this page");
  expect(pv.button.variant).toBe("primary");
});

// rule a: page === null and not failed → checking
it("page null and not failed → checking", () => {
  const pv = toPageView(base({ page: null }));
  expect(pv.tone).toBe("checking");
  expect(pv.chip.text).toBe("…");
  expect(pv.button.disabled).toBe(true);
});

// rule b: chrome:// URL → blocked-page
it("chrome:// URL → blocked-page", () => {
  const pv = toPageView(base({ tab: { id: 1, url: "chrome://extensions" } }));
  expect(pv.tone).toBe("blocked-page");
  expect(pv.chip).toEqual({ text: "Unavailable", kind: "error" });
  expect(pv.hint).toContain("Chrome doesn't allow extensions");
  expect(pv.button.disabled).toBe(true);
  expect(pv.button.action).toBeNull();
});

// rule b: chromewebstore.google.com → blocked-page
it("chromewebstore.google.com → blocked-page", () => {
  const pv = toPageView(base({ tab: { id: 1, url: "https://chromewebstore.google.com/detail/x" } }));
  expect(pv.tone).toBe("blocked-page");
  expect(pv.chip.kind).toBe("error");
});

// rule b: chrome.google.com/webstore → blocked-page
it("chrome.google.com/webstore → blocked-page", () => {
  const pv = toPageView(base({ tab: { id: 1, url: "https://chrome.google.com/webstore/detail/x" } }));
  expect(pv.tone).toBe("blocked-page");
});

// rule b: file:// URL → blocked-page
it("file:// URL → blocked-page", () => {
  const pv = toPageView(base({ tab: { id: 1, url: "file:///x.html" } }));
  expect(pv.tone).toBe("blocked-page");
});

// rule c: active → show translated count
it("page active → active tone with translated count", () => {
  const pv = toPageView(base({ page: { active: true, translated: 24 } }));
  expect(pv.tone).toBe("active");
  expect(pv.chip).toEqual({ text: "On", kind: "ready" });
  expect(pv.hint).toBe("Translated 24 items so far. New comments and expanded text are picked up automatically.");
  expect(pv.button.label).toBe("Stop translating");
  expect(pv.button.variant).toBe("secondary");
  expect(pv.button.disabled).toBe(false);
  expect(pv.button.action).toBe("stop");
});

// rule d: no language available → blocked-setup
it("no language available → blocked-setup", () => {
  const pv = toPageView(base({ statuses: bothDl }));
  expect(pv.tone).toBe("blocked-setup");
  expect(pv.chip).toEqual({ text: "Unavailable", kind: "error" });
  expect(pv.hint).toContain("Enable Korean or Japanese above");
  expect(pv.button.disabled).toBe(true);
  expect(pv.button.action).toBeNull();
});

it("both unavailable → blocked-setup", () => {
  const pv = toPageView(base({ statuses: s(na, na) }));
  expect(pv.tone).toBe("blocked-setup");
});

// rule e: failed → error
it("failed → error tone", () => {
  const pv = toPageView(base({ page: null, failed: true }));
  expect(pv.tone).toBe("error");
  expect(pv.chip).toEqual({ text: "Error", kind: "error" });
  expect(pv.hint).toContain("Couldn't start on this page");
  expect(pv.button.label).toBe("Translate this page");
  expect(pv.button.variant).toBe("primary");
  expect(pv.button.disabled).toBe(false);
  expect(pv.button.action).toBe("start");
});

// rule f: idle
it("idle when not active, language available, not failed", () => {
  const pv = toPageView(base({ page: { active: false, translated: 0 } }));
  expect(pv.tone).toBe("idle");
  expect(pv.chip).toEqual({ text: "Off", kind: "setup" });
  expect(pv.hint).toContain("Translates Korean and Japanese text");
  expect(pv.button.label).toBe("Translate this page");
  expect(pv.button.variant).toBe("primary");
  expect(pv.button.disabled).toBe(false);
  expect(pv.button.action).toBe("start");
});

// only one language available → still idle
it("only one language available → idle", () => {
  const pv = toPageView(base({ statuses: oneAvail, page: { active: false, translated: 0 } }));
  expect(pv.tone).toBe("idle");
});

// busy disables button in all tones
it("busy disables button when checking", () => {
  const pv = toPageView(base({ tab: null, busy: true }));
  expect(pv.button.disabled).toBe(true);
});

it("busy disables button when active", () => {
  const pv = toPageView(base({ page: { active: true, translated: 0 }, busy: true }));
  expect(pv.button.disabled).toBe(true);
});

it("busy disables button when idle", () => {
  const pv = toPageView(base({ page: { active: false, translated: 0 }, busy: true }));
  expect(pv.button.disabled).toBe(true);
});

it("busy disables button when error", () => {
  const pv = toPageView(base({ page: null, failed: true, busy: true }));
  expect(pv.button.disabled).toBe(true);
});
