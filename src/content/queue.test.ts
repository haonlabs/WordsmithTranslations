import { describe, expect, it, vi } from "vitest";
import { TranslationQueue } from "./queue";

const flush = () => new Promise((r) => setTimeout(r, 0));

const deferred = () => {
  let resolve!: (v: string) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe("TranslationQueue", () => {
  it("translates once for duplicate in-flight input, then serves from cache", async () => {
    const translate = vi.fn(async (t: string) => `EN:${t}`);
    const q = new TranslationQueue({ translate });
    const [a, b] = await Promise.all([q.enqueue("안녕"), q.enqueue("안녕")]);
    expect(a).toBe("EN:안녕");
    expect(b).toBe("EN:안녕");
    await q.enqueue("안녕");
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("never exceeds the concurrency limit and keeps FIFO order", async () => {
    const started: string[] = [];
    const gates = new Map<string, ReturnType<typeof deferred>>();
    let active = 0;
    let peak = 0;
    const q = new TranslationQueue({
      concurrency: 2,
      translate: (t) => {
        started.push(t);
        active++;
        peak = Math.max(peak, active);
        const d = deferred();
        gates.set(t, d);
        return d.promise.finally(() => active--);
      },
    });
    const ps = ["가", "나", "다", "라"].map((t) => q.enqueue(t));
    expect(started).toEqual(["가", "나"]);
    gates.get("가")!.resolve("1");
    await flush();
    expect(started).toEqual(["가", "나", "다"]);
    for (const t of ["나", "다"]) gates.get(t)!.resolve("x");
    await flush();
    gates.get("라")!.resolve("y");
    await Promise.all(ps);
    expect(peak).toBeLessThanOrEqual(2);
    expect(started).toEqual(["가", "나", "다", "라"]);
  });

  it("drops the oldest pending jobs when the queue cap is exceeded", async () => {
    const gate = deferred();
    const q = new TranslationQueue({ concurrency: 1, maxQueue: 2, translate: () => gate.promise });
    const first = q.enqueue("running"); // starts immediately
    const old = q.enqueue("old");
    const mid = q.enqueue("mid");
    const newest = q.enqueue("newest"); // pending is now [old, mid, newest] -> drops old
    await expect(old).rejects.toThrow("dropped");
    gate.resolve("ok");
    await expect(Promise.all([first, mid, newest])).resolves.toEqual(["ok", "ok", "ok"]);
  });

  it("retries transient errors a bounded number of times", async () => {
    const translate = vi.fn().mockRejectedValue(new Error("flaky"));
    const q = new TranslationQueue({ translate, maxRetries: 2 });
    await expect(q.enqueue("실패")).rejects.toThrow("flaky");
    expect(translate).toHaveBeenCalledTimes(3); // 1 try + 2 retries
  });

  it("recovers when a retry succeeds and does not cache failures", async () => {
    const translate = vi.fn().mockRejectedValueOnce(new Error("flaky")).mockResolvedValue("ok");
    const q = new TranslationQueue({ translate });
    await expect(q.enqueue("재시도")).resolves.toBe("ok");
  });

  it("does not retry permanent errors", async () => {
    const err = Object.assign(new Error("no gesture"), { name: "NotAllowedError" });
    const translate = vi.fn().mockRejectedValue(err);
    const q = new TranslationQueue({ translate });
    await expect(q.enqueue("영구")).rejects.toThrow("no gesture");
    expect(translate).toHaveBeenCalledTimes(1);
    // failure was not cached: next call translates again
    await expect(q.enqueue("영구")).rejects.toThrow();
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it("clear() rejects pending jobs", async () => {
    const gate = deferred();
    const q = new TranslationQueue({ concurrency: 1, translate: () => gate.promise });
    const running = q.enqueue("a");
    const waiting = q.enqueue("b");
    q.clear();
    await expect(waiting).rejects.toThrow("cleared");
    gate.resolve("ok");
    await expect(running).resolves.toBe("ok");
  });
});
