import type { Lang, Status } from "./translator";

type Reply<T> = ({ ok: true } & T) | { ok: false; error: { name: string; message: string } };

const send = <T>(
  msg: { type: "status"; lang: Lang } | { type: "translate"; text: string; lang: Lang },
): Promise<Reply<T> | undefined> => chrome.runtime.sendMessage({ target: "background", ...msg });

/** Translator status as seen by the extension's offscreen document (shared by all sites). */
export async function remoteStatus(lang: Lang): Promise<Status> {
  try {
    const r = await send<{ status: Status }>({ type: "status", lang });
    if (r?.ok) return r.status;
    return { state: "error", message: r?.error.message ?? "no reply from extension" };
  } catch (e) {
    return { state: "error", message: String(e) }; // e.g. extension was reloaded under an old page
  }
}

/** Translate via the offscreen document. Keeps the DOMException name so the queue can tell permanent errors apart. */
export async function remoteTranslate(text: string, lang: Lang): Promise<string> {
  const r = await send<{ text: string }>({ type: "translate", text, lang });
  if (r?.ok) return r.text;
  throw Object.assign(new Error(r?.error.message ?? "no reply from extension"), { name: r?.error.name ?? "Error" });
}
