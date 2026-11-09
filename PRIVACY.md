# Privacy Policy: WordsmithTranslations

_Last updated: 2026-11-09_

WordsmithTranslations is a Chrome extension that translates Korean and Japanese to English: live chat messages automatically on YouTube Live and CHZZK, and, when you press "Translate this page" in the popup, Korean or Japanese text on the web page you are viewing.

## What the extension does with data

- **Chat messages are processed on your device only.** The extension reads the text of chat messages on `youtube.com` and `chzzk.naver.com` pages and translates them with Chrome's built-in Translator API, which runs locally in your browser.
- **Page text is processed on your device only.** When you press "Translate this page", the extension reads visible Korean or Japanese text on the current tab and translates it with the same on-device Translator API. That text is not sent anywhere and is not stored — translations live in the page and disappear when you stop translating or close the tab.
- **Nothing is sent to us or to any third party.** There is no backend, no analytics, no telemetry, no accounts and no remote translation service. The extension makes no network requests of its own.
- **Nothing is stored.** Chat text is not saved, logged or cached beyond the open tab (an in-memory cache is cleared when the page closes).
- **One setting is stored.** Whether translation is turned on or off, using `chrome.storage.local` on your device.

## Language models

The first time you enable a language, Chrome itself downloads its translation model. That download is performed and managed by Chrome, not by this extension, under Chrome's own terms and privacy practices.

## Permissions

- `storage`: remembers the on/off toggle.
- `offscreen`: runs Chrome's Translator API, which is only available in a document, not in an extension service worker.
- `activeTab` + `scripting`: used **only when you press "Translate this page"**, to inject the translation script into the tab you clicked on. Access is limited to that tab and ends when the tab navigates or closes. No `<all_urls>` or broad host permissions are requested.
- Access to `youtube.com` and `chzzk.naver.com`: to read live chat messages on those sites and show the translation under each message.

## Changes and contact

If this policy changes, the updated version is published here with a new date. Questions: open an issue at https://github.com/haonlabs/WordsmithTranslations/issues
