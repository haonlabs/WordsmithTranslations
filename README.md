# WordsmithTranslations

Chrome extension (Manifest V3) that translates Korean and Japanese to English, inline under the original text: live chat messages automatically on YouTube Live Chat and CHZZK, and — on demand — any Korean or Japanese text on any web page via **Translate this page**. It uses Chrome's built-in **Translator API** (on-device): no backend, no API key, no external translation service. Specs live in [`docs/`](docs/README.md).

## Requirements

- Google Chrome **138+** on desktop (developed against 156). Translator API is not in Firefox/Safari/mobile.
- The `ko → en` and `ja → en` language models are downloaded by Chrome on first use (needs network once, and a user click). Chrome only allows one model download per user click, so each language is prepared with its own **Enable** click in the popup. Korean keeps working even if Japanese hasn't been enabled yet.

## Install (unpacked)

```bash
npm install
npm run build        # outputs dist/
```

1. Open `chrome://extensions`, enable **Developer mode**, **Load unpacked**, choose `dist/`.
2. Click the extension icon and press **Enable translation** (downloads the language model once; keep the popup open until it finishes). This works for every supported site.
3. Open a YouTube or CHZZK live with Korean or Japanese chat. New messages in Hangul or kana get an `EN` line below them. The popup toggle turns translation on/off without reloading.

### Translate this page

Beyond live chat, the extension can translate Korean or Japanese text on **any** web page, on demand:

1. Open a page with Korean or Japanese text (an article, comments, docs — anything).
2. Click the extension icon and press **Translate this page**. The language models must already be enabled in the popup (same `ko → en` / `ja → en` models as chat).
3. Translations appear **below the original text** (originals are never modified), automatically for blocks visible in the viewport (plus a 300px margin), and keep up with new content: newly loaded comments, "Read more" expansions, and SPA changes on the same page.
4. Press **Stop translating** in the popup to remove all translations and stop watching. Opening a new page (full document navigation) stops the feature; press the button again on the new page.

The button injects the translation script into the active tab via `chrome.scripting.executeScript` with the `activeTab` + `scripting` permissions — no `<all_urls>` or broad host permissions. Access applies only to the tab you clicked on and ends when the tab navigates or closes.

Scripts: `npm run typecheck`, `npm test`, `npm run build`, `npm run dev` (watch).

## How it works

`adapter → needsTranslation (Hangul/kana script filter) → queue (FIFO, concurrency 2, cap 100, dedupe, LRU cache, bounded retries) → messaging → service worker → offscreen document → Translator → renderer`.
Source language is detected per message by script only — no general-purpose language detection: Hangul → `ko`, kana (hiragana/katakana) → `ja`; the more frequent script wins on mixed messages.
The Translator runs in an offscreen document on the extension's own origin: Chrome tracks model state per origin, so one popup Enable click prepares that language's model for all sites.
Translation nodes are `div[data-wst-translation]`, written with `textContent`; the original message is never modified. Chat text is never stored or logged. React is used only for the popup.

Page translation reuses the same queue → messaging → offscreen path: the popup injects a `page.js` script into the active tab (`chrome.scripting.executeScript`), the script finds visible text blocks, and translations render below the originals. Chat containers already translated by an adapter are marked `data-wst-chat-container` and skipped, so chat is never translated twice.

Layout: `src/content/` (pipeline + `adapters/`), `src/background/` + `src/offscreen/` (translation host), `src/shared/` (settings, Translator wrapper, messaging), `src/popup/`, `test/fixtures/` (real DOM captures).

## Design

Logo, popup states and in-page UI are designed in Figma ("Wordsmith - Translations"); icons in `public/icons/` are exports from it. The popup follows "Popup v3" (Korean + Japanese).

## Status (2026-11-09)

| Area | State |
|---|---|
| Unit tests (language detection, LRU, queue, renderer, messaging, popup view, YouTube + CHZZK adapters on real DOM fixtures) | 64 passing |
| YouTube adapter | Verified on a live Korean stream (YTN) in Ego Lite (Chromium 156): built content script run in a CDP isolated world translated real messages, no duplicates, originals intact |
| CHZZK adapter | Verified on a live stream (logged in) the same way: 22 of 25 messages translated, no duplicates |
| Japanese → English | Verified on a live Japanese YouTube stream (Nijisanji) in Ego Lite: built content script run in an isolated world with real `ja→en` and `ko→en` translators, correct per-language routing, no duplicates (e.g. 「アクションゲーは得意そうね」 → "You are good at action games") |
| Popup UI | Rendered in Ego Lite with stubbed `chrome`/`Translator`; all states (two languages) match Figma "Popup v3" |
| Translator API `ko→en` | Works in Chrome 156 (Ego Lite): top-level page, same-origin chat iframe, isolated world |
| **Offscreen-document translation path** (service worker relay, popup Enable → offscreen `available`) | **Not tested.** Ego Lite cannot load unpacked extensions; needs a run in Google Chrome |
| **Page translation** ("Translate this page" on arbitrary pages) | **Engine written, not yet verified in an installed extension** |

### Known limitations / open risks

- **Untested in a real install:** the offscreen document + messaging path is new. Assumptions to confirm in Google Chrome: Translator is callable in an offscreen document; after the popup downloads the model, the offscreen document reports `available`; the Enable click survives long enough to finish the download.
- **One model download per click** (observed: a second `create()` in the same gesture is rejected), so each language has its own Enable click. Korean keeps working while Japanese is not enabled.
- Japanese messages that are kanji-only (e.g. "草") are skipped: indistinguishable from Chinese without kana.
- **Popup must stay open during the first download** (a closed popup may cancel it). If that proves flaky, start the download from a persistent extension tab instead.
- `offscreen` needs a documented reason; `DOM_PARSER` is the closest fit, which may matter for Chrome Web Store review (unpacked install is unaffected).
- YouTube: only plain text messages. Paid/membership items and author badges were not in the captured DOM.
- CHZZK: only normal chat messages (`_chatting_message_`). Donation/subscription/notice items were not seen and are skipped. CleanBot notices are plain messages and get translated. Pop-out chat is untested. Class names carry build hashes; selectors match the stable prefix and `[role=log]`.
- Messages arriving while the model is not ready are skipped, not buffered.
- **Page translation:** cannot run on Chrome-blocked pages (`chrome://`, Chrome Web Store); cross-origin iframes are usually not covered by `activeTab`; closed Shadow DOM is not read; Japanese text that is kanji-only is skipped; the Translator API processes one request at a time, so very long pages translate progressively as you scroll; text over 1000 characters is split per sentence. The engine is written but not yet verified in an installed extension.
- Japanese messages that contain ONLY kanji (e.g. "草") are skipped: kanji alone cannot be distinguished from Mandarin.
- CHZZK and YouTube chat in Korean or Japanese use the same adapters; the adapters do not filter by language, the pipeline decides.
- DOM selectors are platform internals and may change; they live only in `src/content/adapters/{youtube,chzzk}.ts`.
- Not built: a debug flag.

## Permissions

- `storage`: remembers the on/off toggle.
- `offscreen`: runs Chrome's Translator API.
- Host access to `youtube.com` and `chzzk.naver.com`: content scripts read live chat on those sites.
- `activeTab` + `scripting`: let the popup inject the page-translation script into the tab you clicked on, **only when you press "Translate this page"**. No `<all_urls>` and no broad host permissions; access ends when the tab navigates or closes.
