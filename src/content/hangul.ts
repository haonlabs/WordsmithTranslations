const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const URL_RE = /https?:\/\/\S+/g;

/** Collapse whitespace. Used for cache keys only; display text is never normalized. */
export const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();

/** True if the message has Hangul outside URLs. English/emoji/number/URL-only text is skipped. */
export const needsTranslation = (s: string): boolean => HANGUL.test(s.replace(URL_RE, ""));
