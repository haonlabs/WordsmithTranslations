import type { Lang } from "../shared/translator";

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/g;
// no ・(U+30FB) or ー(U+30FC): punctuation-like, not reliable language signals
const KANA = /[ぁ-ゖゝ-ゞァ-ヺｦ-ﾟ]/g;
const URL_RE = /https?:\/\/\S+/g;

/** Collapse whitespace. Used for cache keys only; display text is never normalized. */
export const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();

// ponytail: kanji-only Japanese is skipped, indistinguishable from Chinese
export function detectLanguage(s: string): Lang | null {
  const text = s.replace(URL_RE, "");
  const ko = (text.match(HANGUL) ?? []).length;
  const ja = (text.match(KANA) ?? []).length;
  if (ko + ja === 0) return null;
  return ja > ko ? "ja" : "ko";
}
