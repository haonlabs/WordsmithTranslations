# WordsmithTranslations

Chrome extension (Manifest V3) that translates Korean live chat messages to English, inline under the original message, on YouTube Live Chat and CHZZK. It uses Chrome's built-in **Translator API** (on-device): no backend, no API key, no external translation service. Specs live in [`docs/`](docs/README.md).

## Requirements

- Google Chrome **138+** on desktop (developed against 156). Translator API is not in Firefox/Safari/mobile.
- The `ko → en` language model is downloaded by Chrome on first use (needs network once, and a user click).

## Install (unpacked)

```bash
npm install
npm run build        # outputs dist/
```

1. Open `chrome://extensions`, enable **Developer mode**, **Load unpacked**, choose `dist/`.
2. Open a YouTube live stream or a CHZZK live with Korean chat. Chrome tracks the translation model **per site**, so the first time on each site a blue **Enable translation** button appears in the chat. Click it once (downloads the model if needed).
3. New Hangul messages get an `EN` line below them. The popup toggles translation on/off without reloading.

Scripts: `npm run typecheck`, `npm test`, `npm run build`, `npm run dev` (watch).

## How it works

`adapter → needsTranslation (Hangul filter) → queue (FIFO, concurrency 2, cap 100, dedupe, LRU cache, bounded retries) → Translator → renderer`.
Translation nodes are `div[data-wst-translation]`, written with `textContent`; the original message is never modified. Chat text is never stored or logged. React is used only for the popup.

Layout: `src/content/` (pipeline + `adapters/`), `src/shared/` (settings, Translator wrapper), `src/popup/`, `test/fixtures/` (real DOM captures).

## Status (2026-11-09)

| Area | State |
|---|---|
| Unit tests (hangul, LRU, queue, renderer, enable button, YouTube + CHZZK adapters on real DOM fixtures) | 39 passing |
| YouTube adapter | Verified on a live Korean stream (YTN) in Ego Lite (Chromium 156): built `content.js` run in an isolated world of the chat frame translated real messages, no duplicate nodes, originals intact |
| CHZZK adapter | Verified on a live stream (파카, logged in) the same way: 22 of 25 messages translated (emote-only messages skipped), no duplicates |
| Translator API `ko→en` | Works in Chrome 156 (Ego Lite): top-level page, same-origin chat iframe, and isolated world |
| Real extension install (content script + popup in Google Chrome) | **Not tested yet**: Ego Lite cannot load unpacked extensions |
| On-page "Enable translation" button | Unit-tested only (could not reproduce the `downloadable` state live after the model was cached) |

### Known limitations / open risks

- **Extension context untested.** Checks above ran in a CDP isolated world, not an installed extension. Still to confirm in Google Chrome: `Translator` callable from the content script, and the Enable button flow.
- **Model state is per site** (observed: chzzk.naver.com stayed `downloadable` after the model was downloaded via youtube.com until a click there created a translator). Hence the on-page button; the popup status reflects only the extension's own origin.
- First-time download from inside the YouTube chat iframe failed with `NotSupportedError` once in testing (top-level was fine). If the Enable button hits this in the iframe, the fallback is downloading from the popup/top-level page.
- YouTube: only plain text messages. Paid/membership items and author badges were not in the captured DOM.
- CHZZK: only normal chat messages (`_chatting_message_`). Donation/subscription/notice items were not seen and are skipped. CleanBot notices ("클린봇이 부적절한 표현을 감지했습니다") are plain messages and get translated. Pop-out chat is untested. CSS class names carry build hashes; selectors match the stable prefix and `[role=log]`.
- Messages arriving while the model is not ready are skipped, not buffered.
- DOM selectors are platform internals and may change; they live only in `src/content/adapters/{youtube,chzzk}.ts`.
- Not built: a debug flag (M5), and the popup does not show the page's translation status.
