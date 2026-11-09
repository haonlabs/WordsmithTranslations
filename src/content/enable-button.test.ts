import { beforeEach, expect, it, vi } from "vitest";
import { ENABLE_ATTR, showEnableButton } from "./enable-button";

const btn = () => document.querySelector<HTMLButtonElement>(`[${ENABLE_ATTR}]`);
beforeEach(() => (document.body.innerHTML = ""));

it("shows one button even if called twice", () => {
  const prepare = vi.fn();
  showEnableButton(prepare, () => {});
  showEnableButton(prepare, () => {});
  expect(document.querySelectorAll(`[${ENABLE_ATTR}]`)).toHaveLength(1);
});

it("click runs prepare, then removes the button and calls onReady", async () => {
  const onReady = vi.fn();
  showEnableButton(async () => ({ state: "available" }), onReady);
  btn()!.click();
  await new Promise((r) => setTimeout(r, 0));
  expect(onReady).toHaveBeenCalledOnce();
  expect(btn()).toBeNull();
});

it("keeps the button for retry when prepare fails", async () => {
  const onReady = vi.fn();
  showEnableButton(async () => ({ state: "error", message: "x" }), onReady);
  btn()!.click();
  await new Promise((r) => setTimeout(r, 0));
  expect(onReady).not.toHaveBeenCalled();
  expect(btn()!.disabled).toBe(false);
  expect(btn()!.textContent).toContain("retry");
});
