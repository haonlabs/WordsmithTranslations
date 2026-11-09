import { LRU } from "./lru";

export interface QueueOptions {
  translate: (text: string) => Promise<string>;
  concurrency?: number;
  /** Pending jobs beyond this drop the OLDEST (chat is read newest-first). */
  maxQueue?: number;
  maxRetries?: number;
  cacheSize?: number;
}

interface Job {
  key: string;
  text: string;
  tries: number;
  resolve: (v: string) => void;
  reject: (e: unknown) => void;
}

// Errors retrying cannot fix (no user gesture for download, unsupported pair, destroyed instance).
const PERMANENT = new Set(["NotSupportedError", "NotAllowedError", "InvalidStateError"]);

/** FIFO queue + in-flight dedupe + LRU cache. `key` must already be normalized. */
export class TranslationQueue {
  private pending: Job[] = [];
  private inflight = new Map<string, Promise<string>>();
  private running = 0;
  private cache: LRU<string>;
  private concurrency: number;
  private maxQueue: number;
  private maxRetries: number;

  constructor(private opts: QueueOptions) {
    this.concurrency = opts.concurrency ?? 2;
    this.maxQueue = opts.maxQueue ?? 100;
    this.maxRetries = opts.maxRetries ?? 2;
    this.cache = new LRU(opts.cacheSize ?? 500);
  }

  enqueue(key: string, text = key): Promise<string> {
    const hit = this.cache.get(key);
    if (hit !== undefined) return Promise.resolve(hit);
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const p = new Promise<string>((resolve, reject) => {
      this.pending.push({ key, text, tries: 0, resolve, reject });
    });
    this.inflight.set(key, p);
    p.catch(() => {}); // caller handles; avoid unhandled rejection for dropped jobs
    while (this.pending.length > this.maxQueue) this.fail(this.pending.shift()!, new Error("dropped"));
    this.pump();
    return p;
  }

  /** Reject everything not yet started (room change / disable). Running jobs finish; callers guard staleness. */
  clear(): void {
    for (const job of this.pending.splice(0)) this.fail(job, new Error("cleared"));
  }

  private fail(job: Job, err: unknown): void {
    this.inflight.delete(job.key);
    job.reject(err);
  }

  private pump(): void {
    while (this.running < this.concurrency && this.pending.length) {
      const job = this.pending.shift()!;
      this.running++;
      this.opts
        .translate(job.text)
        .then((out) => {
          this.cache.set(job.key, out); // successes only
          this.inflight.delete(job.key);
          job.resolve(out);
        })
        .catch((e: unknown) => {
          const name = (e as { name?: string })?.name ?? "";
          if (!PERMANENT.has(name) && job.tries < this.maxRetries) {
            job.tries++;
            this.pending.unshift(job); // ponytail: immediate retry, no backoff; add delay if the API rate-limits
          } else this.fail(job, e);
        })
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
}
