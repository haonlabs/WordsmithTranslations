// Only non-sensitive prefs live in storage. Never chat content.
export async function getEnabled(): Promise<boolean> {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  return enabled as boolean;
}
export const setEnabled = (enabled: boolean) => chrome.storage.local.set({ enabled });
export function onEnabledChange(cb: (enabled: boolean) => void): void {
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === "local" && c.enabled) cb(c.enabled.newValue as boolean);
  });
}
