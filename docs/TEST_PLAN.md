# Test Plan

## 1. Unit tests

### Hangul filter
- Korean sentence → accepted.
- Korean + English mixed sentence → accepted.
- English-only sentence → skipped.
- URL-only → skipped.
- Emoji-only → skipped.
- Numbers/punctuation-only → skipped.
- Empty/whitespace → skipped.

### Queue
- Jobs processed FIFO.
- Concurrency never exceeds configured limit.
- Same message submitted twice while pending → one translation.
- Queue cap respected during chat burst.
- Transient error retry is bounded.
- Permanent error does not retry forever.

### Cache
- Same normalized Korean text and language pair → cache hit.
- Different source text → cache miss.
- Cache evicts entries after capacity reached.
- Failed translations are not cached as successful.

### Renderer
- Translation inserted below source text.
- Original text remains unchanged.
- Renderer uses `textContent`.
- Existing translation node updated rather than duplicated.
- Extension-owned node is ignored by observer.
- Removed/recycled message node does not receive stale result.

## 2. Adapter tests

Use representative HTML fixtures captured from current versions of each platform. Do not rely exclusively on hand-written selectors with no fixture validation.

### YouTube
- Normal live chat message.
- Message with author badge and username.
- Message with emoji/emote.
- Membership/superchat/system message.
- Pop-out chat if included in MVP.
- Chat container replacement.
- SPA navigation to another live stream.

### CHZZK
- Normal chat message.
- Message with badges/emotes.
- System/notice message.
- Chat list rerender.
- Room navigation.
- DOM node reuse if observed.

## 3. Manual end-to-end scenarios

1. Install unpacked extension in a clean Chrome profile.
2. Open popup and verify Translator API status.
3. If model is not available, verify UI communicates download/unavailable state.
4. Open YouTube Live Chat with Korean messages.
5. Verify each new Hangul message receives one English translation below it.
6. Verify English-only messages are skipped.
7. Verify mixed Korean-English messages are translated.
8. Repeat on CHZZK.
9. Disable extension and verify new messages are no longer translated.
10. Re-enable and verify translation resumes.
11. Simulate API error/unavailable and verify original chat remains usable.
12. Test fast chat burst and ensure queue stays bounded.
13. Navigate between streams without full page reload.
14. Verify no duplicate translation elements and no observer loops.

## 4. Acceptance checklist

- [ ] MV3 extension builds and loads.
- [ ] Popup works and setting persists.
- [ ] Translator API availability is checked.
- [ ] Korean → English pair works in actual Chrome environment.
- [ ] YouTube adapter verified on live chat.
- [ ] CHZZK adapter verified on live chat.
- [ ] Inline translation preserves original message.
- [ ] Non-Hangul-only messages skipped.
- [ ] Queue/cache/deduplication tested.
- [ ] SPA navigation tested.
- [ ] No backend or external translation API.
- [ ] Known limitations documented.
