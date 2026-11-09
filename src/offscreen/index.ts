import { getStatus, translate } from "../shared/translator";

// Runs in an extension-origin document, so its Translator state is the one the popup's Enable button prepares.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target !== "offscreen") return;
  if (msg.type === "status") {
    getStatus().then((status) => reply({ ok: true, status }));
  } else if (msg.type === "translate") {
    translate(String(msg.text))
      .then((text) => reply({ ok: true, text }))
      .catch((e: unknown) => reply({ ok: false, error: { name: (e as Error)?.name ?? "Error", message: String((e as Error)?.message ?? e) } }));
  } else return;
  return true; // async reply
});
