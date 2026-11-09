import { getEnabled, onEnabledChange } from "../shared/settings";
import { getStatus, prepare, translate } from "../shared/translator";
import { createChzzkAdapter } from "./adapters/chzzk";
import { createYouTubeAdapter } from "./adapters/youtube";
import { showEnableButton } from "./enable-button";
import { needsTranslation, normalize } from "./hangul";
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
  const queue = new TranslationQueue({ translate });

  // Translator must be 'available' before we enqueue (first-time download needs a popup click).
  // ponytail: messages arriving while not ready are skipped, not buffered; re-checks at most every 5s.
  let ready = false;
  let checkedAt = 0;
  let removeButton = (): void => {};
  const isReady = async (): Promise<boolean> => {
    if (ready) return true;
    if (Date.now() - checkedAt < 5000) return false;
    checkedAt = Date.now();
    const { state } = await getStatus();
    ready = state === "available";
    // Per-site model state + user-click requirement: offer a one-time on-page enable button.
    if (state === "downloadable" || state === "downloading") removeButton = showEnableButton(prepare, () => (ready = true));
    return ready;
  };

  const handle = (msg: ChatMessage): void => {
    if (!needsTranslation(msg.sourceText)) return;
    isReady()
      .then((ok) => (ok ? queue.enqueue(normalize(msg.sourceText), msg.sourceText) : undefined))
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
      removeButton();
    }
  };
  getEnabled().then(apply);
  onEnabledChange(apply);
}
