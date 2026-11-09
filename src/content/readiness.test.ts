import { describe, expect, it, vi } from "vitest";
import { createReadiness } from "./readiness";

describe("createReadiness", () => {
  it("caches available languages and stops calling the status check", async () => {
    const getStatus = vi.fn().mockResolvedValue({ state: "available" });
    const isReady = createReadiness(getStatus);
    await expect(isReady("ko")).resolves.toBe(true);
    await expect(isReady("ko")).resolves.toBe(true);
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it("throttles repeat checks while a language is not ready", async () => {
    vi.useFakeTimers();
    const getStatus = vi.fn().mockResolvedValue({ state: "downloadable" });
    const isReady = createReadiness(getStatus);
    await expect(isReady("ja")).resolves.toBe(false);
    await expect(isReady("ja")).resolves.toBe(false); // throttled: no extra call
    expect(getStatus).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5001);
    await expect(isReady("ja")).resolves.toBe(false);
    expect(getStatus).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("parallel callers for the same language share one in-flight check", async () => {
    const getStatus = vi.fn().mockImplementation(
      () => new Promise((res) => setTimeout(() => res({ state: "available" }), 10)), // check takes a tick
    );
    const isReady = createReadiness(getStatus);
    const [a, b, c] = await Promise.all([isReady("ko"), isReady("ko"), isReady("ko")]); // all arrive while the check runs
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual([true, true, true]); // nobody is dropped with a false while the check runs
  });

  it("a paused check lets later callers share it instead of getting a throttled false", async () => {
    let resolve!: (v: { state: string }) => void;
    const getStatus = vi.fn().mockImplementation(() => new Promise<{ state: string }>((r) => (resolve = r)));
    const isReady = createReadiness(getStatus);
    const first = isReady("ko");
    const second = isReady("ko"); // same tick, still running: must wait, not return false
    resolve({ state: "available" });
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(getStatus).toHaveBeenCalledTimes(1);
  });
});
