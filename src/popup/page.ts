/** Thin wrappers over chrome.* APIs for the "This page" feature. */

/** Returns the active tab in the current window, or null if unavailable. */
export async function getActiveTab(): Promise<{ id?: number; url?: string } | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

/** Queries the page script for its current status. Returns {active:false, translated:0} if the script isn't injected yet. */
export async function queryPage(tabId: number): Promise<{ active: boolean; translated: number }> {
  try {
    const reply = await chrome.tabs.sendMessage(tabId, { target: "page", type: "status" });
    if (reply && reply.ok === true && typeof reply.active === "boolean" && typeof reply.translated === "number") {
      return { active: reply.active as boolean, translated: reply.translated as number };
    }
    return { active: false, translated: 0 };
  } catch {
    return { active: false, translated: 0 };
  }
}

/** Injects page.js into all frames of the tab. Returns true on success, false on failure. */
export async function startPage(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["page.js"] });
    return true;
  } catch {
    return false;
  }
}

/** Sends a stop message to the page script. Errors are ignored. */
export async function stopPage(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { target: "page", type: "stop" });
  } catch {
    // ignore – script may not be running
  }
}
