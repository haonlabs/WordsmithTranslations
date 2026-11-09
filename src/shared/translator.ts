// Thin wrapper over Chrome's built-in Translator API (ko -> en). No remote fallback, ever.
const OPTS = { sourceLanguage: "ko", targetLanguage: "en" } as const;

export type Status =
  | { state: "unsupported" } // no `Translator` global in this context
  | { state: "unavailable" }
  | { state: "downloadable" } // needs user gesture -> prepare()
  | { state: "downloading" }
  | { state: "available" }
  | { state: "error"; message: string };

let instance: Translator | null = null;

export async function getStatus(): Promise<Status> {
  if (!("Translator" in self)) return { state: "unsupported" };
  try {
    return { state: await Translator.availability(OPTS) };
  } catch (e) {
    return { state: "error", message: String(e) };
  }
}

/** Must be called from a user gesture the first time (model download). */
export async function prepare(onProgress?: (ratio: number) => void): Promise<Status> {
  if (!("Translator" in self)) return { state: "unsupported" };
  try {
    instance = await Translator.create({
      ...OPTS,
      monitor: (m) => m.addEventListener("downloadprogress", (e) => onProgress?.(e.loaded)),
    });
    return { state: "available" };
  } catch (e) {
    return { state: "error", message: String(e) };
  }
}

/** Reuses one instance. Throws if the model isn't ready (caller maps to error state). */
export async function translate(text: string): Promise<string> {
  instance ??= await Translator.create(OPTS);
  return instance.translate(text);
}
