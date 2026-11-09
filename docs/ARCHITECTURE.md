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
- `background/index.ts`: service worker. Hanya me-relay pesan `translate`/`status` dari content script ke offscreen document dan membuatnya bila belum ada. Tidak memanggil Translator API.
- `offscreen/index.ts` + `offscreen.html`: document extension-origin yang memegang Translator API (API hanya ada di document, status model dicatat Chrome per origin). Satu klik "Enable translation" di popup menyiapkan model bahasa itu untuk semua situs; Chrome hanya mengizinkan satu pengunduhan model per klik pengguna, jadi tiap bahasa (`ko`, `ja`) disiapkan dengan klik "Enable" sendiri. Korea tetap berfungsi walau Jepang belum disiapkan.
- `popup/`: React UI: status (`view.ts` memetakan status → tampilan), toggle, tombol Enable translation (user gesture untuk unduh model pertama).
- `shared/messaging.ts`: `remoteStatus()` / `remoteTranslate()` yang dipakai content script.
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
- Adapters do not filter by language — Korean and Japanese chats on both YouTube and CHZZK use the same adapters; the pipeline decides.
- Avoid usernames, badges, timestamps, buttons, emotes metadata, and extension-owned translations.
- Assign stable message identity where possible.
- Observe additions and relevant text changes.
- Handle platform-specific navigation and chat rerender.
- Stop/disconnect observers on teardown.

Selectors must be isolated in adapter files and treated as volatile implementation details. Add comments explaining how selectors were verified.

### Message pipeline
- Validate text and script presence (Hangul or kana). Source language is detected per message by script only: Hangul → `ko`, kana (hiragana/katakana) → `ja`; the more frequent script wins on mixed messages. Messages containing only Japanese kanji (e.g. "草") are skipped — kanji alone cannot be distinguished from Mandarin.
- Normalize whitespace for cache key only; preserve source text for display.
- Deduplicate by stable node/message ID plus normalized text hash.
- Enqueue translation job.
- Attach result to originating message only if node remains connected and still represents same message.

### Translation service
Berjalan di offscreen document (bukan content script). Alasan (diamati 2026-11-09): status model Translator dilaporkan per origin dan `create()` perlu klik pengguna di origin itu, jadi dari content script tiap situs butuh klik sendiri. Dengan origin extension tunggal, satu klik popup cukup. Alur: content script → `chrome.runtime.sendMessage` → service worker → offscreen document → `translator.translate()`.

Use Chrome Built-in AI Translator API (the `ko` → `en` pair is shown as the example; `ja` → `en` is created the same way for messages detected as kana):

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
- Skip text without Hangul or kana.
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

## 3. Page translation ("Translate this page")

Selain chat live, popup bisa menyuntikkan script terjemahan halaman ke tab aktif:

```text
Popup ("Translate this page") ─> chrome.scripting.executeScript (activeTab + scripting)
                              ─> page.js di tab aktif
                              ─> messaging (service worker) ─> offscreen Translator
```

Komponen baru di `src/page/`:
- `blocks.ts`: menemukan blok teks Korea/Jepang yang terlihat di viewport (+ margin 300px), melewati node extension-owned, elemen interaktif, dan container chat yang sudah ditandai `data-wst-chat-container` (ditandai adapter chat agar chat tidak diterjemahkan dua kali).
- `controller.ts`: lifecycle fitur. Memasang `IntersectionObserver` untuk menerjemahkan blok saat masuk viewport, `MutationObserver` untuk konten baru (komentar yang baru dimuat, "Read more", perubahan SPA di halaman yang sama), merender terjemahan di bawah teks asli (teks asli tidak diubah), dan membersihkan semuanya saat stop.
- `chunk.ts`: memecah teks > 1000 karakter per kalimat sebelum masuk queue. Translator API memproses satu permintaan pada satu waktu, jadi halaman sangat panjang diterjemahkan bertahap saat di-scroll.
- `entry.ts`: titik masuk `page.js` yang di-inject.

Akses berakhir saat tab berpindah halaman (navigasi dokumen penuh) atau ditutup; pengguna menekan tombol lagi di halaman baru. Tidak ada `<all_urls>` atau host permission luas. Batasan: halaman yang diblokir Chrome (`chrome://`, Chrome Web Store), iframe lintas-origin, dan Shadow DOM tertutup tidak tercakup.

## 4. React boundary

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

## 5. Messaging and storage

- `chrome.storage.local`: enabled state and non-sensitive preferences only.
- `chrome.runtime.sendMessage`: popup-to-background/content status or settings updates if needed.
- Do not store chat history or translated chat contents persistently.
- Do not request broad permissions such as `<all_urls>`.

## 6. SPA and lifecycle

- Detect URL changes and chat container replacement.
- Make `start()` idempotent.
- Disconnect observers and cancel queued work when leaving a room.
- Reinitialize adapter after navigation.
- Ensure stale async translation results are not rendered into a new room or reused message node.

## 7. Security and privacy

- No backend and no external translation API.
- Translation runs through Chrome's built-in Translator API.
- No API keys or secrets.
- Do not log full chat message contents in production.
- Request only required host permissions.
- Treat page DOM as untrusted input; render translated text as text, not HTML.
