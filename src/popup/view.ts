import type { Status } from "../shared/translator";

export type Tone = "checking" | "setup" | "downloading" | "ready" | "paused" | "unavailable" | "error";

export interface View {
  tone: Tone;
  title: string;
  hint: string;
  /** 0..1 while this popup is downloading the model, else null. */
  progress: number | null;
  /** Primary full-width button under the status card. */
  cta: { label: string; disabled: boolean } | null;
  /** Secondary "Check again" button in the footer. */
  check: boolean;
}

const view = (tone: Tone, title: string, hint: string, extra: Partial<View> = {}): View => ({ tone, title, hint, progress: null, cta: null, check: false, ...extra });

/** Maps translator status + toggle + local download progress to what the popup shows (see Figma "Popup v2"). */
export function toView(status: Status | null, enabled: boolean, progress: number | null): View {
  if (progress !== null)
    return view("downloading", `Downloading language model… ${Math.round(progress * 100)}%`, "Keep this popup open until it finishes. This only happens once.", {
      progress,
      cta: { label: "Downloading…", disabled: true },
    });
  if (!status) return view("checking", "Checking…", "Looking for Chrome’s translation model.");
  switch (status.state) {
    case "available":
      return enabled
        ? view("ready", "Ready", "Korean messages are translated automatically on YouTube and CHZZK.")
        : view("paused", "Paused", "Translation is off. New messages are left as they are.");
    case "downloadable":
      return view("setup", "Set up translation", "Download the Korean → English language model once. It then works on every supported site.", {
        cta: { label: "Enable translation", disabled: false },
      });
    case "downloading":
      return view("downloading", "Downloading language model…", "Chrome is already downloading it. Check again in a moment.", { check: true });
    case "unsupported":
    case "unavailable":
      return view("unavailable", "Unavailable", "This Chrome can’t translate Korean → English. Needs desktop Chrome 138+.", { check: true });
    case "error":
      return view("error", "Couldn’t download the model", "Check your connection, then try again. Your chat is untouched.", {
        cta: { label: "Try again", disabled: false },
      });
  }
}
