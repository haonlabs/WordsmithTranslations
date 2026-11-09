import type { Status } from "../shared/translator";

export const ENABLE_ATTR = "data-wst-enable";

/**
 * Chrome reports Translator model state per site, and creating a translator needs a user click on THAT site
 * (the popup runs on the extension's origin, so it cannot do this for youtube.com / chzzk.naver.com).
 * Shows one button; the click runs `prepare`. Returns a remover. Idempotent.
 */
export function showEnableButton(
  prepare: (onProgress: (ratio: number) => void) => Promise<Status>,
  onReady: () => void,
  doc: Document = document,
): () => void {
  const existing = doc.querySelector<HTMLElement>(`[${ENABLE_ATTR}]`);
  if (existing) return () => existing.remove();

  const btn = doc.createElement("button");
  btn.setAttribute(ENABLE_ATTR, "true");
  btn.type = "button";
  btn.textContent = "Enable translation (downloads model once)";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Preparing…";
    const s = await prepare((r) => (btn.textContent = `Downloading ${Math.round(r * 100)}%`));
    if (s.state === "available") {
      btn.remove();
      onReady();
    } else {
      btn.disabled = false;
      btn.textContent = "Translation unavailable. Click to retry";
    }
  });
  doc.body.append(btn);
  return () => btn.remove();
}
