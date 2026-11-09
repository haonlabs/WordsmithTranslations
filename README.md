# WordsmithTranslations

Chrome extension (Manifest V3) that translates Korean and Japanese live chat messages to English, inline under the original message, on YouTube Live Chat and CHZZK. It uses Chrome's built-in **Translator API** (on-device): no backend, no API key, no external translation service. Specs live in [`docs/`](docs/README.md).

## Requirements

- Google Chrome **138+** on desktop (developed against 156). Translator API is not in Firefox/Safari/mobile.
- The `ko → en` and `ja → en` language models are downloaded by Chrome on first use (needs network once, and a user click). Chrome only allows one model download per user click, so each language is prepared with its own **Enable** click in the popup. Korea keeps working even if Japanese hasn't been enabled yet.

## Install (unpacked)

```bash
npm install
npm run build        # outputs dist/
```

1. Open `chrome://extensions`, enable **Developer mode**, **Load unpacked**, choose `dist/`.
2. Click the extension icon and press **Enable translation** (downloads the language model once; keep the popup open until it finishes). This works for every supported site.
3. Open a YouTube or CHZZK live with Korean or Japanese chat. New messages in Hangul or kana get an `EN` line below them. The popup toggle turns translation on/off without reloading.

Scripts: `npm run typecheck`, `npm test`, `npm run build`, `npm run dev` (watch).

## How it works

`adapter → needsTranslation (Hangul/kana script filter) → queue (FIFO, concurrency 2, cap 100, dedupe, LRU cache, bounded retries) → messaging → service worker → offscreen document → Translator → renderer`.
Source language is detected per message by script only — no general-purpose language detection: Hangul → `ko`, kana (hiragana/katakana) → `ja`; the more frequent script wins on mixed messages.
The Translator runs in an offscreen document on the extension's own origin: Chrome tracks model state per origin, so one popup Enable click prepares that language's model for all sites.
Translation nodes are `div[data-wst-translation]`, written with `textContent`; the original message is never modified. Chat text is never stored or logged. React is used only for the popup.

Layout: `src/content/` (pipeline + `adapters/`), `src/background/` + `src/offscreen/` (translation host), `src/shared/` (settings, Translator wrapper, messaging), `src/popup/`, `test/fixtures/` (real DOM captures).

## Design

Logo, popup states and in-page UI are designed in Figma ("Wordsmith - Translations"); icons in `public/icons/` are exports from it. The popup follows "Popup v2".

## Status (2026-11-09)

| Area | State |
|---|---|
| Unit tests (hangul, LRU, queue, renderer, messaging, popup view, YouTube + CHZZK adapters on real DOM fixtures) | 48 passing |
| YouTube adapter | Verified on a live Korean stream (YTN) in Ego Lite (Chromium 156): built content script run in a CDP isolated world translated real messages, no duplicates, originals intact |
| CHZZK adapter | Verified on a live stream (logged in) the same way: 22 of 25 messages translated, no duplicates |
| Popup UI | Rendered in Ego Lite with stubbed `chrome`/`Translator`; all states match the Figma design |
| Translator API `ko→en` | Works in Chrome 156 (Ego Lite): top-level page, same-origin chat iframe, isolated world |
| **Offscreen-document translation path** (service worker relay, popup Enable → offscreen `available`) | **Not tested.** Ego Lite cannot load unpacked extensions; needs a run in Google Chrome |

### Known limitations / open risks

- **Untested in a real install:** the offscreen document + messaging path is new. Assumptions to confirm in Google Chrome: Translator is callable in an offscreen document; after the popup downloads the model, the offscreen document reports `available`; the Enable click survives long enough to finish the download.
- **Popup must stay open during the first download** (a closed popup may cancel it). If that proves flaky, start the download from a persistent extension tab instead.
- `offscreen` needs a documented reason; `DOM_PARSER` is the closest fit, which may matter for Chrome Web Store review (unpacked install is unaffected).
- YouTube: only plain text messages. Paid/membership items and author badges were not in the captured DOM.
- CHZZK: only normal chat messages (`_chatting_message_`). Donation/subscription/notice items were not seen and are skipped. CleanBot notices are plain messages and get translated. Pop-out chat is untested. Class names carry build hashes; selectors match the stable prefix and `[role=log]`.
- Messages arriving while the model is not ready are skipped, not buffered.
- Japanese messages that contain ONLY kanji (e.g. "草") are skipped: kanji alone cannot be distinguished from Mandarin.
- CHZZK and YouTube chat in Korean or Japanese use the same adapters; the adapters do not filter by language, the pipeline decides.
- DOM selectors are platform internals and may change; they live only in `src/content/adapters/{youtube,chzzk}.ts`.
- Not built: a debug flag.
