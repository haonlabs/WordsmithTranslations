# Architecture

## 1. High-level architecture

```text
YouTube DOM ──> YouTube Adapter ──┐
                                 ├─> Message Pipeline ─> Queue ─> Translator API
CHZZK DOM ────> CHZZK Adapter ────┘                           │
                                                             v
                                                    Translation Renderer
                                                             │
                                                             v
                                                 Inline English translation
```

React digunakan untuk popup/options UI. Content script berinteraksi dengan DOM halaman dan tidak perlu merender seluruh chat menggunakan React.

## 2. Suggested components

### Extension shell
- `manifest.json`: MV3 metadata, permissions, host matches, content scripts, service worker, popup.
- `background/service-worker.ts`: lifecycle ringan, message routing bila diperlukan.
- `popup/`: React UI untuk status dan enable/disable.
- `content/entry.ts`: deteksi host dan bootstrap adapter.

### Platform adapters
Define a common interface:

```ts
interface ChatMessage {
  id: string;
  sourceText: string;
  sourceElement: HTMLElement;
  platform: "youtube" | "chzzk";
}

interface PlatformAdapter {
  canRun(): boolean;
  start(onMessage: (message: ChatMessage) => void): void;
  stop(): void;
}
```

Adapter responsibilities:
- Identify message nodes and extract only textual message content.
- Avoid usernames, badges, timestamps, buttons, emotes metadata, and extension-owned translations.
- Assign stable message identity where possible.
- Observe additions and relevant text changes.
- Handle platform-specific navigation and chat rerender.
- Stop/disconnect observers on teardown.

Selectors must be isolated in adapter files and treated as volatile implementation details. Add comments explaining how selectors were verified.

### Message pipeline
- Validate text and Hangul presence.
- Normalize whitespace for cache key only; preserve source text for display.
- Deduplicate by stable node/message ID plus normalized text hash.
- Enqueue translation job.
- Attach result to originating message only if node remains connected and still represents same message.

### Translation service
Use Chrome Built-in AI Translator API:

```ts
const availability = await Translator.availability({
  sourceLanguage: "ko",
  targetLanguage: "en",
});

const translator = await Translator.create({
  sourceLanguage: "ko",
  targetLanguage: "en",
});

const translatedText = await translator.translate(sourceText);
```

Treat the API as progressive enhancement:
- Feature-detect `globalThis.Translator`.
- Check `availability()` before creation.
- Handle model download / downloading / unavailable / error states.
- Avoid creating multiple translator instances unnecessarily; reuse one instance while valid.
- Handle create/translate errors and expose status to popup.
- Do not assume API availability merely because Chrome is up to date; test actual runtime support and policy/device conditions.
- Confirm current API syntax and requirements against official Chrome documentation before implementation.

### Translation queue
- Configurable concurrency, initially 1–2.
- FIFO order.
- Ignore empty/whitespace-only text.
- Skip text without Hangul.
- Deduplicate in-flight jobs.
- Bounded queue; drop oldest or newest according to a documented policy (prefer retaining newest chat messages).
- Retry only transient failures with small bounded retry count.
- Never retry indefinitely.

### Cache
- In-memory LRU cache is sufficient for MVP.
- Key: source language + target language + normalized source text.
- Bound entries and total approximate size.
- Cache successful results only.
- Do not persist chat contents to `chrome.storage` by default.

### Translation renderer
- Add an extension-owned child element below the source text within a safe message container.
- Mark it with `data-wst-translation="true"`.
- Do not overwrite `textContent` of platform-owned message nodes.
- Use `textContent` for translated output; never inject translated strings as HTML.
- Avoid changing parent layout more than necessary.
- Use Shadow DOM only if it proves necessary; keep initial implementation simple.
- On message node removal/reuse, ensure translation is not attached to a different message.

## 3. React boundary

React should own:
- Popup UI.
- Options/settings UI if needed.
- Status display and toggle.

Content script should own:
- DOM observer.
- Platform adapters.
- Translation queue and cache.
- Inline translation nodes.

Avoid mounting a React root into each chat message. Direct DOM insertion is more robust and lightweight for this use case.

## 4. Messaging and storage

- `chrome.storage.local`: enabled state and non-sensitive preferences only.
- `chrome.runtime.sendMessage`: popup-to-background/content status or settings updates if needed.
- Do not store chat history or translated chat contents persistently.
- Do not request broad permissions such as `<all_urls>`.

## 5. SPA and lifecycle

- Detect URL changes and chat container replacement.
- Make `start()` idempotent.
- Disconnect observers and cancel queued work when leaving a room.
- Reinitialize adapter after navigation.
- Ensure stale async translation results are not rendered into a new room or reused message node.

## 6. Security and privacy

- No backend and no external translation API.
- Translation runs through Chrome's built-in Translator API.
- No API keys or secrets.
- Do not log full chat message contents in production.
- Request only required host permissions.
- Treat page DOM as untrusted input; render translated text as text, not HTML.
