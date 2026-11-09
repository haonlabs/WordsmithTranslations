import { afterEach, expect, it, vi } from "vitest";
import { remoteStatus, remoteTranslate } from "./messaging";

const stub = (impl: (msg: unknown) => unknown) => vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn(async (m: unknown) => impl(m)) } });
afterEach(() => vi.unstubAllGlobals());

it("addresses the background worker", async () => {
  stub(() => ({ ok: true, text: "Hello" }));
  await remoteTranslate("안녕");
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ target: "background", type: "translate", text: "안녕" });
});

it("returns the translated text", async () => {
  stub(() => ({ ok: true, text: "Hello" }));
  await expect(remoteTranslate("안녕")).resolves.toBe("Hello");
});

it("rethrows remote errors keeping the DOMException name", async () => {
  stub(() => ({ ok: false, error: { name: "NotAllowedError", message: "needs gesture" } }));
  await expect(remoteTranslate("안녕")).rejects.toMatchObject({ name: "NotAllowedError", message: "needs gesture" });
});

it("treats a missing reply as an error", async () => {
  stub(() => undefined);
  await expect(remoteTranslate("안녕")).rejects.toThrow("no reply");
  await expect(remoteStatus()).resolves.toMatchObject({ state: "error" });
});

it("remoteStatus passes the status through, and survives a dead extension context", async () => {
  stub(() => ({ ok: true, status: { state: "available" } }));
  await expect(remoteStatus()).resolves.toEqual({ state: "available" });
  vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn().mockRejectedValue(new Error("Extension context invalidated.")) } });
  await expect(remoteStatus()).resolves.toMatchObject({ state: "error" });
});
