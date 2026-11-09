# Implementation Plan

Implement in small, verifiable milestones. Do not attempt both platform adapters at once.

## Milestone 0 — API feasibility spike

Goal: prove Chrome Translator API works in the target Chrome environment before building the full extension.

Tasks:
1. Check official Chrome Built-in AI Translator API documentation.
2. Confirm current availability/status and any origin trial, flag, version, hardware, language-model download, or user activation requirements.
3. Create a tiny TypeScript test page or extension spike.
4. Check `Translator` feature detection.
5. Call `Translator.availability({ sourceLanguage: "ko", targetLanguage: "en" })`.
6. Create translator and translate a Korean test phrase.
7. Record exact Chrome version and result in README.

Exit criteria:
- API can be invoked from the chosen extension execution context.
- Korean → English pair is supported.
- Model availability and failure states are understood.

**Stop and report** if API is not available in extension context or language pair is unsupported. Do not substitute a remote API without product approval.

## Milestone 1 — Extension skeleton

- Setup React + Vite + TypeScript.
- Configure MV3 manifest.
- Add popup UI with enabled toggle and Translator API status.
- Add `chrome.storage.local` settings wrapper.
- Build and load unpacked extension.
- Verify content scripts only match target sites.

Exit criteria:
- Extension loads without manifest errors.
- Popup opens.
- Enable setting persists across browser restarts.

## Milestone 2 — Shared message pipeline

- Define `ChatMessage` and `PlatformAdapter` types.
- Implement Hangul filter.
- Implement queue, concurrency limit, in-flight dedupe, and LRU cache.
- Implement translation service wrapper around Chrome Translator API.
- Add unit tests.

Exit criteria:
- Given a synthetic Korean message, queue produces one English result.
- Duplicate input is translated once.
- Non-Korean-only text is skipped.
- API failures do not crash the pipeline.

## Milestone 3 — YouTube adapter

- Inspect current YouTube live chat DOM on a real stream.
- Inspect regular embedded chat and pop-out chat separately.
- Determine message container and message text selectors.
- Avoid capturing author name, badges, timestamps, buttons, or emote labels.
- Implement observer with idempotent start/stop.
- Insert translation below source message.
- Test SPA navigation and chat container replacement.

Exit criteria:
- New Korean messages are translated inline.
- Existing messages can optionally be processed on initial scan, subject to queue cap.
- No duplicate translation nodes or observer loops.
- Chat scroll and controls remain usable.

## Milestone 4 — CHZZK adapter

- Inspect current CHZZK live chat DOM.
- Determine stable message and text selectors.
- Implement adapter independently from YouTube.
- Handle rerendering and room navigation.
- Add platform-specific fixtures for tests.

Exit criteria:
- Same shared pipeline works for CHZZK.
- New Korean messages get English translations inline.
- No regressions in YouTube adapter.

## Milestone 5 — UX, settings, resilience

- Polish translation style.
- Add status labels: ready, checking, downloading, unavailable, error.
- Add enable/disable toggle.
- Add bounded queue and cache.
- Add retry behavior for transient failures.
- Add debug mode that logs metadata, not message content.

Exit criteria:
- User can disable translation without reloading browser.
- Failure states are understandable.
- No uncontrolled queue growth.

## Milestone 6 — Release readiness

- Test on supported Chrome version and clean profile.
- Test API unavailable / model download / offline cases.
- Test high-volume chat.
- Test long messages, emojis, mixed Korean-English, repeated messages.
- Verify no external network calls from extension except browser-managed model availability/download as documented.
- Document known limitations and manual installation.

## Suggested Claude Code execution style

Ask Claude to:
1. Read all project documents.
2. Execute only one milestone at a time.
3. Before editing, summarize the plan and files to change.
4. After each milestone, run typecheck/tests/build.
5. Report actual test output and unresolved issues.
6. Never claim platform adapter works without validating against current live DOM or representative fixtures.
