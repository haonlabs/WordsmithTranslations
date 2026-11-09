// Thin wrapper over Chrome's built-in Translator API (ko/ja -> en). No remote fallback, ever.
export type Lang = "ko" | "ja";
export const LANGS: readonly Lang[] = ["ko", "ja"];

export type Status =
  | { state: "unsupported" } // no `Translator` global in this context
  | { state: "unavailable" }
  | { state: "downloadable" } // needs user gesture -> prepare()
  | { state: "downloading" }
  | { state: "available" }
  | { state: "error"; message: string };

const instances = new Map<Lang, Translator>();
const opts = (lang: Lang) => ({ sourceLanguage: lang, targetLanguage: "en" } as const);

export async function getStatus(lang: Lang): Promise<Status> {
  if (!("Translator" in self)) return { state: "unsupported" };
  try {
    return { state: await Translator.availability(opts(lang)) };
  } catch (e) {
    return { state: "error", message: String(e) };
  }
}

/** Must be called from a user gesture the first time (model download). One gesture per language. */
export async function prepare(lang: Lang, onProgress?: (ratio: number) => void): Promise<Status> {
  if (!("Translator" in self)) return { state: "unsupported" };
  try {
    instances.set(
      lang,
      await Translator.create({
        ...opts(lang),
        monitor: (m) => m.addEventListener("downloadprogress", (e) => onProgress?.(e.loaded)),
      }),
    );
    return { state: "available" };
  } catch (e) {
    return { state: "error", message: String(e) };
  }
}

/** Reuses one instance per language. Throws if the model isn't ready (caller maps to error state). */
export async function translate(text: string, lang: Lang): Promise<string> {
  const instance = instances.get(lang) ?? (await Translator.create(opts(lang)));
  instances.set(lang, instance);
  return instance.translate(text);
}
