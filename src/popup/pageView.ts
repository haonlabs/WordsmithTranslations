import type { Lang, Status } from "../shared/translator";

export type PageTone = "checking" | "idle" | "active" | "blocked-setup" | "blocked-page" | "error";
export interface PageView {
  tone: PageTone;
  chip: { text: string; kind: "ready" | "setup" | "error" };
  hint: string;
  button: { label: string; variant: "primary" | "secondary"; disabled: boolean; action: "start" | "stop" | null };
}

function isAllowedUrl(url: string | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname;
  if (host === "chromewebstore.google.com") return false;
  if (host === "chrome.google.com" && parsed.pathname.startsWith("/webstore")) return false;
  return true;
}

/** Maps tab + statuses + page state to what the "This page" block shows (see Figma "Popup v4"). */
export function toPageView(input: {
  tab: { id?: number; url?: string } | null;
  statuses: Record<Lang, Status | null>;
  page: { active: boolean; translated: number } | null;
  busy: boolean;
  failed: boolean;
}): PageView {
  const { tab, statuses, page, busy, failed } = input;

  // a. tab === null OR page === null and not failed → checking
  if (tab === null || (page === null && !failed)) {
    return {
      tone: "checking",
      chip: { text: "…", kind: "setup" },
      hint: "Checking this page…",
      button: { label: "Translate this page", variant: "primary", disabled: true, action: null },
    };
  }

  // b. URL not http/https OR blocked host → blocked-page
  if (!isAllowedUrl(tab.url)) {
    return {
      tone: "blocked-page",
      chip: { text: "Unavailable", kind: "error" },
      hint: "Chrome doesn't allow extensions on this page (for example chrome:// pages or the Web Store).",
      button: { label: "Translate this page", variant: "primary", disabled: true, action: null },
    };
  }

  // c. page active → active
  if (page?.active) {
    return {
      tone: "active",
      chip: { text: "On", kind: "ready" },
      hint: `Translated ${page.translated} items so far. New comments and expanded text are picked up automatically.`,
      button: { label: "Stop translating", variant: "secondary", disabled: busy, action: "stop" },
    };
  }

  // d. no language available → blocked-setup
  const hasAvailable = (statuses.ko?.state === "available") || (statuses.ja?.state === "available");
  if (!hasAvailable) {
    return {
      tone: "blocked-setup",
      chip: { text: "Unavailable", kind: "error" },
      hint: "Enable Korean or Japanese above, then translate this page.",
      button: { label: "Translate this page", variant: "primary", disabled: true, action: null },
    };
  }

  // e. failed → error
  if (failed) {
    return {
      tone: "error",
      chip: { text: "Error", kind: "error" },
      hint: "Couldn't start on this page. Reload the page and try again.",
      button: { label: "Translate this page", variant: "primary", disabled: busy, action: "start" },
    };
  }

  // f. idle
  return {
    tone: "idle",
    chip: { text: "Off", kind: "setup" },
    hint: "Translates Korean and Japanese text as you scroll, below the original. Works on this tab until you leave the page.",
    button: { label: "Translate this page", variant: "primary", disabled: busy, action: "start" },
  };
}
