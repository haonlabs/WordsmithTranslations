import { getStatus, translate, type Lang } from "../shared/translator";

const isLang = (v: unknown): v is Lang => v === "ko" || v === "ja";

// Runs in an extension-origin document, so its Translator state is the one the popup's Enable button prepares.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target !== "offscreen") return;
  if (!isLang(msg.lang)) {
    reply({ ok: false, error: { name: "NotSupportedError", message: "unsupported language" } });
    return;
  }
  if (msg.type === "status") {
    getStatus(msg.lang).then((status) => reply({ ok: true, status }));
  } else if (msg.type === "translate") {
    translate(String(msg.text), msg.lang)
      .then((text) => reply({ ok: true, text }))
      .catch((e: unknown) => reply({ ok: false, error: { name: (e as Error)?.name ?? "Error", message: String((e as Error)?.message ?? e) } }));
  } else return;
  return true; // async reply
});
