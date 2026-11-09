# Instructions for Claude Code

You are implementing the WordsmithTranslations Chrome Extension. Treat the documents in this repository as the product source of truth.

## Read first

Read:
- `README.md`
- `PROJECT_SPEC.md`
- `ARCHITECTURE.md`
- `TECH_STACK.md`
- `IMPLEMENTATION_PLAN.md`
- `RISKS_AND_COMPATIBILITY.md`
- `TEST_PLAN.md`

## Product constraints

- Chrome Extension Manifest V3.
- React + Vite + TypeScript.
- YouTube Live Chat and CHZZK only.
- Korean (`ko`) → English (`en`).
- Automatically translate every message containing Hangul.
- Preserve original message and render English below it.
- Use Chrome Built-in AI Translator API.
- No backend, no Google Cloud Translation API, no API key, and no external translation provider.
- React is for popup/options, not for rendering each chat message.
- Use separate YouTube and CHZZK adapters.
- Use MutationObserver, queue, deduplication, and bounded cache.

## Mandatory first task

Do not start by building the complete extension.

First perform **Milestone 0: API feasibility spike**:
1. Consult current official Chrome Translator API docs.
2. Verify current API status and requirements.
3. Verify that the `ko` → `en` language pair is supported.
4. Verify whether the API is callable from the intended Chrome extension context (content script vs extension page). Translator API is document-bound; do not call it from the MV3 service worker.
5. Test YouTube chat iframe context. Cross-origin iframes need the embedding page to delegate the `translator` Permissions Policy; do not assume YouTube delegates it.
6. Verify whether first-time model download requires a user gesture and implement an explicit user-initiated preparation flow.
7. Implement the smallest possible spike and run it in Chrome.
8. Record Chrome version, API availability result, context/iframe results, and model download behavior.

If the API is not callable from an extension context or the pair is unavailable, stop and explain the blocker. Do not replace it with Google Cloud or an undocumented translate endpoint.

## Engineering rules

- Use strict TypeScript.
- Keep dependencies minimal.
- Keep platform selectors isolated in adapter files.
- Do not assume DOM selectors from memory; inspect current platform DOM or ask for representative HTML snapshots.
- Never mutate or replace original chat message text.
- Render translation with `textContent`, never `innerHTML`.
- Mark extension-owned nodes with a stable data attribute.
- Prevent MutationObserver self-trigger loops.
- Make adapter start/stop idempotent.
- Disconnect observers on navigation and teardown.
- Bound queue size, concurrency, retries, and cache.
- Handle stale async results when message nodes are removed or reused.
- Do not persist chat message contents in Chrome storage.
- Avoid logging private chat contents.
- Request minimum permissions and target only required hosts.
- Do not use `<all_urls>`.
- Do not claim a platform is supported until tested on that platform.

## Workflow

- Work one milestone at a time from `IMPLEMENTATION_PLAN.md`.
- Before each milestone, state intended changes.
- After each milestone, run typecheck, tests, and build.
- Fix regressions before moving forward.
- Add tests for message filtering, deduplication, queue, cache, and renderer.
- Update README with setup, installation, supported Chrome requirements, and known limitations.
- Keep project documents synchronized with material architecture changes.

## Definition of done

Use acceptance criteria in `PROJECT_SPEC.md` and test cases in `TEST_PLAN.md`. Report verified behavior separately from assumptions and untested items.
