// Relays translation requests from content scripts to the offscreen document, creating it on demand.
// The Translator API only exists in documents (not service workers), and Chrome tracks its model state per
// origin. One extension-origin document means one popup click enables every site.
let creating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const open = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (open.length) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: "offscreen.html",
      // ponytail: no listed reason fits; DOM_PARSER is the closest. Revisit if publishing to the Web Store.
      reasons: ["DOM_PARSER"],
      justification: "Chrome's Translator API is only available in a document, not a service worker.",
    })
    .finally(() => (creating = null));
  await creating;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target !== "background") return;
  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage({ ...msg, target: "offscreen" }))
    .then(reply)
    .catch((e: unknown) => reply({ ok: false, error: { name: (e as Error)?.name ?? "Error", message: String((e as Error)?.message ?? e) } }));
  return true; // async reply
});
