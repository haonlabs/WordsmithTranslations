import type { Lang } from "../shared/translator";

const THROTTLE_MS = 5000;

/**
 * `true` once a status check said the language is available. Parallel callers share one in-flight
 * check per language (they must not be dropped while it runs); repeat checks while not ready are
 * throttled to one per THROTTLE_MS per language.
 */
export function createReadiness(
  getStatus: (lang: Lang) => Promise<{ state: string }>,
): (lang: Lang) => Promise<boolean> {
  const ready = new Map<Lang, boolean>();
  const checkedAt = new Map<Lang, number>();
  const inflight = new Map<Lang, Promise<boolean>>();
  return (lang) => {
    if (ready.get(lang)) return Promise.resolve(true);
    const running = inflight.get(lang);
    if (running) return running; // a check is already under way: wait for the same answer
    if (Date.now() - (checkedAt.get(lang) ?? 0) < THROTTLE_MS) return Promise.resolve(false);
    checkedAt.set(lang, Date.now());
    const check = getStatus(lang)
      .then((status) => {
        const ok = status.state === "available";
        ready.set(lang, ok);
        return ok;
      })
      .finally(() => {
        inflight.delete(lang);
      });
    inflight.set(lang, check);
    return check;
  };
}
