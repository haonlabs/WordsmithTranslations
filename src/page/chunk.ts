import { detectLanguage } from "../content/language";
import type { Lang } from "../shared/translator";

const MAX = 1000; //Translator API input limit

/**
 * Splits long text at line/sentence boundaries (`\n`, `. `, `! `, `? `, `。`, `！`, `？`) so every
 * chunk is <= MAX chars; a run without any boundary is hard-cut (the limit is non-negotiable).
 * Boundaries stay inside the chunks, so concatenating the translations preserves them.
 */
export function chunkText(text: string): string[] {
  if (text.length <= MAX) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (text.length - start > MAX) {
    let cut = -1;
    for (let i = start + 1; i <= start + MAX; i++) {
      const prev = text[i - 1]!;
      const next = text[i]!;
      if (prev === "\n" || prev === "。" || prev === "！" || prev === "？" || ((prev === "." || prev === "!" || prev === "?") && next === " ")) cut = i;
    }
    if (cut < 0) cut = start + MAX;
    chunks.push(text.slice(start, cut));
    start = cut;
  }
  chunks.push(text.slice(start));
  return chunks;
}

/** Translates pieces of at most MAX chars, sequentially (the queue already serializes, but stay honest). */
export async function translateChunked(
  text: string,
  lang: Lang,
  translate: (t: string, l: Lang) => Promise<string>,
): Promise<string> {
  // If text has newlines, translate per-line
  if (text.includes("\n")) {
    const lines = text.split("\n");
    const results: string[] = [];
    for (const line of lines) {
      if (line === "") {
        // Preserve blank lines as-is
        results.push("");
      } else if (detectLanguage(line) === null) {
        // No ko/ja on this line: return as-is without calling translate
        results.push(line);
      } else {
        // Translate this line, using chunk splitting if needed
        const parts = chunkText(line);
        if (parts.length === 1) {
          results.push(await translate(line, lang));
        } else {
          const out: string[] = [];
          for (const part of parts) out.push(await translate(part, lang));
          results.push(out.join(""));
        }
      }
    }
    return results.join("\n");
  }

  const parts = chunkText(text);
  if (parts.length === 1) return translate(text, lang);
  const out: string[] = [];
  for (const part of parts) out.push(await translate(part, lang));
  return out.join("");
}
