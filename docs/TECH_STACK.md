# Tech Stack

## Selected stack

| Area | Choice | Notes |
|---|---|---|
| Extension platform | Chrome Manifest V3 | Browser extension lifecycle and permissions |
| Language | TypeScript | Strict typing for adapters and message pipeline |
| UI framework | React | Popup/options UI only |
| Build tool | Vite | Build extension entry points |
| DOM monitoring | MutationObserver | Detect dynamic chat messages |
| Translation | Chrome Built-in AI Translator API | Korean (`ko`) → English (`en`) |
| Settings | `chrome.storage.local` | Enabled state and preferences |
| Unit tests | Vitest | Queue, filters, cache, adapters |
| DOM tests | jsdom or happy-dom | Isolated DOM behavior |
| E2E | Playwright | Browser-level smoke tests where extension support permits |
| Styling | CSS | Lightweight popup and inline translation styles |

## Architecture choice: React + Vite

Use React for extension popup/options. Do not use React to render every chat message. The page integration is a content script that uses TypeScript, MutationObserver, and small DOM-owned translation elements.

## Dependencies

Keep dependencies minimal. Suggested development dependencies:
- `typescript`
- `vite`
- `@vitejs/plugin-react`
- `react`
- `react-dom`
- `@types/chrome`
- `@types/react`
- `@types/react-dom`
- `vitest`
- `jsdom`
- `eslint` and TypeScript ESLint packages (optional but recommended)

Use a Vite/Chrome extension setup that correctly emits:
- Manifest at build output root.
- Popup HTML and bundled React entry.
- Content script bundle(s) compatible with Chrome extension content-script constraints.
- Service worker bundle as an MV3 module or classic script consistent with manifest configuration.

Do not assume a generic Vite build automatically produces a valid extension. Validate output paths and manifest references.

## Browser API typing

If the selected Chrome TypeScript definitions do not include the Translator API, add a small local declaration file for the currently documented API surface. Do not invent API signatures: verify them against official documentation and keep the declaration minimal.

## Translator API constraints

- Feature detection is mandatory.
- Call `Translator.availability({ sourceLanguage: "ko", targetLanguage: "en" })`.
- Handle all documented availability values for the current API version.
- Create/reuse a translator only when supported.
- Handle model download or user-facing unavailable states.
- Re-check the current Chrome documentation for API status, origin/trial/flag requirements, supported language pairs, and extension content-script availability before coding.
- If API cannot be called in the content script context, isolate translation invocation in the extension context that Chrome documents as supported and communicate using `chrome.runtime` messaging. Do not silently switch to a remote API.

## Build commands (proposed)

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build
```

Claude Code should define exact scripts in `package.json` and document how to load `dist/` as an unpacked extension.
