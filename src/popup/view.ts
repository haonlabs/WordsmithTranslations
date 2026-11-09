import { LANGS, type Lang, type Status } from "../shared/translator";

export type Tone = "checking" | "setup" | "downloading" | "ready" | "paused" | "unavailable" | "error";
export type LangState = "checking" | "ready" | "setup" | "downloading" | "unavailable" | "error";
export interface LangRow {
  lang: Lang;
  label: string;
  state: LangState;
  text: string;
}
export interface View {
  tone: Tone;
  title: string;
  hint: string;
  progress: number | null;
  /** Button under the status card; primary = full-width blue, secondary = full-width plain. */
  cta: { label: string; lang: Lang; disabled: boolean; variant: "primary" | "secondary" } | null;
  /** "Check again" button in the footer. */
  check: boolean;
  /** One row per language, ko then ja. */
  languages: LangRow[];
}

const SHORT: Record<Lang, string> = { ko: "Korean", ja: "Japanese" };

// order of checks mirrors the headline rules below
function rows(statuses: Record<Lang, Status | null>, download: { lang: Lang; ratio: number } | null): LangRow[] {
  return LANGS.map((lang) => {
    if (download?.lang === lang)
      return { lang, label: SHORT[lang], state: "downloading" as const, text: `${Math.round(download.ratio * 100)}%` };
    const state = statuses[lang]?.state;
    switch (state) {
      case "available":
        return { lang, label: SHORT[lang], state: "ready", text: "Ready" };
      case "downloadable":
        return { lang, label: SHORT[lang], state: "setup", text: "Not set up" };
      case "downloading":
        return { lang, label: SHORT[lang], state: "downloading", text: "Downloading…" };
      case "error":
        return { lang, label: SHORT[lang], state: "error", text: "Error" };
      case null:
      case undefined:
        return { lang, label: SHORT[lang], state: "checking", text: "…" };
      default: // unsupported | unavailable
        return { lang, label: SHORT[lang], state: "unavailable", text: "Unavailable" };
    }
  });
}

/** Maps translator statuses + toggle + local download progress to what the popup shows (see Figma "Popup v3"). */
export function toView(statuses: Record<Lang, Status | null>, enabled: boolean, download: { lang: Lang; ratio: number } | null): View {
  const languages = rows(statuses, download);
  const base: View = { tone: "unavailable", title: "", hint: "", progress: null, cta: null, check: false, languages };
  const first = (state: string) => LANGS.find((l) => statuses[l]?.state === state) as Lang | undefined;

  if (download) {
    const pct = Math.round(download.ratio * 100);
    return {
      ...base,
      tone: "downloading",
      title: `Downloading ${SHORT[download.lang]} model… ${pct}%`,
      hint: "Keep this popup open until it finishes. This only happens once.",
      progress: download.ratio,
      cta: { label: "Downloading…", lang: download.lang, disabled: true, variant: "primary" },
    };
  }
  if (statuses.ko === null || statuses.ja === null) return { ...base, tone: "checking", title: "Checking…", hint: "Looking for Chrome’s translation model." };

  const firstDownloadable = first("downloadable");
  if (statuses.ko?.state === "available" || statuses.ja?.state === "available") {
    const names = LANGS.filter((l) => statuses[l]?.state === "available").map((l) => SHORT[l]).join(" and ");
    return enabled
      ? {
          ...base,
          tone: "ready",
          title: "Ready",
          hint: `${names} messages are translated automatically on YouTube and CHZZK.`,
          cta: firstDownloadable ? { label: `Add ${SHORT[firstDownloadable]} → English`, lang: firstDownloadable, disabled: false, variant: "secondary" } : null,
        }
      : { ...base, tone: "paused", title: "Paused", hint: "Translation is off. New messages are left as they are." };
  }
  if (firstDownloadable)
    return {
      ...base,
      tone: "setup",
      title: "Set up translation",
      hint: "Download Chrome’s translation model once per language. One click enables one language.",
      cta: { label: `Enable ${SHORT[firstDownloadable]} → English`, lang: firstDownloadable, disabled: false, variant: "primary" },
    };
  if (first("downloading"))
    return { ...base, tone: "downloading", title: "Downloading language model…", hint: "Chrome is already downloading it. Check again in a moment.", check: true };
  const firstError = first("error");
  if (firstError) return { ...base, tone: "error", title: "Couldn’t download the model", hint: "Check your connection, then try again. Your chat is untouched.", cta: { label: "Try again", lang: firstError, disabled: false, variant: "primary" } };
  return { ...base, tone: "unavailable", title: "Unavailable", hint: "This Chrome can’t translate Korean or Japanese → English. Needs desktop Chrome 138+.", check: true };
}
