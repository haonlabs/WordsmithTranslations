import { expect, it } from "vitest";
import { toView } from "./view";

it("not set up yet -> setup card with an enabled Enable button", () => {
  const v = toView({ state: "downloadable" }, true, null);
  expect(v.tone).toBe("setup");
  expect(v.cta).toEqual({ label: "Enable translation", disabled: false });
});

it("local download in progress -> downloading with percent and a disabled button", () => {
  const v = toView({ state: "downloadable" }, true, 0.42);
  expect(v.tone).toBe("downloading");
  expect(v.title).toContain("42%");
  expect(v.progress).toBe(0.42);
  expect(v.cta).toEqual({ label: "Downloading…", disabled: true });
});

it("available -> ready, or paused when toggled off", () => {
  expect(toView({ state: "available" }, true, null).tone).toBe("ready");
  expect(toView({ state: "available" }, false, null).tone).toBe("paused");
});

it("toggle off does not hide setup: an unprepared model still needs the button", () => {
  expect(toView({ state: "downloadable" }, false, null).tone).toBe("setup");
});

it("unsupported / unavailable -> unavailable with Check again", () => {
  for (const state of ["unsupported", "unavailable"] as const) {
    const v = toView({ state }, true, null);
    expect(v.tone).toBe("unavailable");
    expect(v.check).toBe(true);
    expect(v.cta).toBeNull();
  }
});

it("error -> Try again; null status -> checking", () => {
  expect(toView({ state: "error", message: "x" }, true, null).cta?.label).toBe("Try again");
  expect(toView(null, true, null).tone).toBe("checking");
});
