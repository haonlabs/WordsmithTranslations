import { remoteStatus, remoteTranslate } from "../shared/messaging";
import { createPageTranslator } from "./controller";

interface PageHandle {
  stats(): { active: boolean; translated: number };
  stop(): void;
}

const g = globalThis as typeof globalThis & { __wstPage?: PageHandle };

// Injected on demand (popup -> chrome.scripting.executeScript). A second injection must not build a second engine.
if (!g.__wstPage && document.body) {
  const translator = createPageTranslator({ translate: remoteTranslate, status: remoteStatus, document });
  translator.start();
  g.__wstPage = { stats: () => translator.stats(), stop: () => translator.stop() };
  chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const msg = raw as { target?: string; type?: string };
    if (msg.target !== "page") return undefined; // not ours (background/offscreen/popup)
    if (msg.type === "status") sendResponse({ ok: true, ...translator.stats() });
    else if (msg.type === "stop") {
      translator.stop();
      sendResponse({ ok: true, active: false, translated: 0 });
    }
    return undefined;
  });
}
