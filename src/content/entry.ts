import { getEnabled, onEnabledChange } from "../shared/settings";
import { remoteStatus, remoteTranslate } from "../shared/messaging";

import { createChzzkAdapter } from "./adapters/chzzk";
import { createYouTubeAdapter } from "./adapters/youtube";
import { detectLanguage, normalize } from "./language";
import { createReadiness } from "./readiness";
import { TranslationQueue } from "./queue";
import { render } from "./renderer";
import type { ChatMessage, PlatformAdapter } from "./types";

function pickAdapter(): PlatformAdapter | null {
  if (location.hostname === "www.youtube.com") return createYouTubeAdapter();
  if (location.hostname === "chzzk.naver.com") return createChzzkAdapter();
  return null;
}

const adapter = pickAdapter();
if (adapter?.canRun()) {
  const queue = new TranslationQueue({ translate: remoteTranslate });
  // The model must be 'available' before we enqueue (first-time setup is the popup's Enable button).
  // ponytail: messages arriving while not ready are skipped, not buffered; re-checks at most every 5s per language.
  const isReady = createReadiness(remoteStatus);

  const handle = (msg: ChatMessage): void => {
    const lang = detectLanguage(msg.sourceText);
    if (!lang) return;
    isReady(lang)
      .then((ok) => (ok ? queue.enqueue(normalize(msg.sourceText), msg.sourceText, lang) : undefined))
      .then((out) => out !== undefined && render(msg, out))
      .catch(() => {
        // failure leaves the original message untouched; never log chat text
      });
  };

  const apply = (enabled: boolean): void => {
    if (enabled) adapter.start(handle);
    else {
      adapter.stop();
      queue.clear();
    }
  };
  getEnabled().then(apply);
  onEnabledChange(apply);
}
