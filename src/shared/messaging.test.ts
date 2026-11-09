import { afterEach, expect, it, vi } from "vitest";
import { remoteStatus, remoteTranslate } from "./messaging";

const stub = (impl: (msg: unknown) => unknown) => vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn(async (m: unknown) => impl(m)) } });
afterEach(() => vi.unstubAllGlobals());

it("addresses the background worker", async () => {
  stub(() => ({ ok: true, text: "Hello" }));
  await remoteTranslate("안녕", "ko");
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ target: "background", type: "translate", text: "안녕", lang: "ko" });
});

it("sends the language with translate and status messages", async () => {
  stub(() => ({ ok: true, text: "Hello" }));
  await remoteTranslate("こんにちは", "ja");
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ target: "background", type: "translate", text: "こんにちは", lang: "ja" });
  stub(() => ({ ok: true, status: { state: "available" } }));
  await remoteStatus("ja");
  expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({ target: "background", type: "status", lang: "ja" });
});

it("returns the translated text", async () => {
  stub(() => ({ ok: true, text: "Hello" }));
  await expect(remoteTranslate("안녕", "ko")).resolves.toBe("Hello");
});

it("rethrows remote errors keeping the DOMException name", async () => {
  stub(() => ({ ok: false, error: { name: "NotAllowedError", message: "needs gesture" } }));
  await expect(remoteTranslate("안녕", "ko")).rejects.toMatchObject({ name: "NotAllowedError", message: "needs gesture" });
});

it("treats a missing reply as an error", async () => {
  stub(() => undefined);
  await expect(remoteTranslate("안녕", "ko")).rejects.toThrow("no reply");
  await expect(remoteStatus("ko")).resolves.toMatchObject({ state: "error" });
});

it("remoteStatus passes the status through, and survives a dead extension context", async () => {
  stub(() => ({ ok: true, status: { state: "available" } }));
  await expect(remoteStatus("ko")).resolves.toEqual({ state: "available" });
  vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn().mockRejectedValue(new Error("Extension context invalidated.")) } });
  await expect(remoteStatus("ko")).resolves.toMatchObject({ state: "error" });
});
