# Risks & Compatibility

## 1. Chrome Built-in AI Translator API is not Chrome page translation

The extension must use the documented JavaScript Translator API, not attempt to invoke Chrome's built-in “Translate this page” UI or undocumented internal translation endpoints.

## 2. API maturity and availability

Chrome Built-in AI APIs may have changing availability, browser-version requirements, rollout restrictions, model download requirements, language-pair support, device requirements, or execution-context limitations. Current Chrome documentation describes Translator API for desktop Chrome (Chrome 138+ in the current guidance), and lists Korean (`ko`) and English (`en`) as supported languages. This is not a guarantee that every device/profile can use the pair.

Before implementation:
- Verify current official documentation.
- Verify API availability in the exact Chrome version used for development.
- Verify Korean → English support.
- Verify whether extension content scripts, extension pages, and service workers are supported contexts. The API is document-bound and is not available in Web Workers; do not plan to call it from an MV3 service worker.
- The API is generally available to top-level windows and same-origin iframes. Cross-origin iframes require the embedding page to delegate the `translator` Permissions Policy. This is a key risk for YouTube chat if it is rendered in a cross-origin iframe; test the actual chat frame before committing to the design.
- `Translator.create()` may require transient user activation when it starts or joins a language-pack download. Design the popup/onboarding flow so the user can explicitly click an Enable/Prepare Translation button to initiate model setup. Do not assume a background observer can silently trigger first-time model downloads.
- The documented API uses `Translator.availability({ sourceLanguage: 'ko', targetLanguage: 'en' })`, `Translator.create(options)`, and `translator.translate(text)`. Monitor download progress using the documented `monitor` callback where supported.
- Verify if any flags, origin trial, or user activation are required.
- Handle unavailable and downloading states.

Do not assume that a recent Chrome version guarantees Translator API availability.

## 3. No-backend tradeoff

Advantages:
- No backend hosting or operations.
- No API key to protect.
- No third-party translation bill.
- Chat text need not be sent to an external translation provider.

Tradeoffs:
- Translation quality and speed depend on the locally available model.
- First-time model acquisition may take time and network access.
- Model availability may vary by device/browser.
- The extension cannot guarantee translation when API/model is unavailable.

## 4. Website DOM volatility

YouTube and CHZZK may change DOM structure at any time. CSS class names can be generated or unstable. Prefer semantic attributes and stable structural anchors when available. Keep selectors centralized and add fixture tests.

## 5. MutationObserver pitfalls

- Observing the entire document with broad subtree options can be expensive.
- Inserting translation nodes can trigger the observer.
- Chat nodes may be recycled or reused.
- A single logical message may be rendered in multiple places.
- Initial chat history can create a large burst of work.

Mitigations:
- Observe the narrowest stable chat container.
- Ignore extension-owned nodes.
- Deduplicate by message identity and text.
- Bound initial scan and queue.
- Check that source node is still connected and unchanged before rendering.
- Disconnect and reattach when chat container is replaced.

## 6. Iframe and permissions

YouTube live chat may appear in iframe or pop-out contexts. Manifest `matches`, `all_frames`, `match_about_blank`, and host permissions must be chosen based on verified page structure. Avoid broad permissions. If frames are involved, test origin and injection behavior.

## 7. Translation content quality

Korean chat often contains slang, abbreviations, names, emotes, and mixed scripts. A fixed `ko` → `en` pair is intentional for MVP, but short fragments may translate poorly. Preserve original text so users can always refer to it.

## 8. Privacy

Do not store chat text persistently. Do not send it to a custom server. Be transparent that the browser-managed Translator API may download/use local language models according to Chrome's implementation and policies.

## 9. Official references

- Chrome for Developers — Translator API: https://developer.chrome.com/docs/ai/translator-api
- Chrome Built-in AI guidance: https://developer.chrome.com/docs/ai/
- Chrome AI Translator playground: https://chrome.dev/web-ai-demos/built-in-ai-playground/translator-api/

Re-check these references during Milestone 0 because API availability and requirements can change.
