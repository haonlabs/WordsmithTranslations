import { expect, it } from "vitest";
import type { Status } from "../shared/translator";
import { toView } from "./view";

const av: Status = { state: "available" };
const dl: Status = { state: "downloadable" };
const busy: Status = { state: "downloading" };
const bad: Status = { state: "error", message: "x" };
const na: Status = { state: "unavailable" };
const s = (ko: Status | null, ja: Status | null) => ({ ko, ja });

// rule 1
it("local download in progress -> downloading headline with percent and disabled cta", () => {
  const v = toView(s(dl, dl), true, { lang: "ja", ratio: 0.42 });
  expect(v.tone).toBe("downloading");
  expect(v.title).toBe("Downloading Japanese model… 42%");
  expect(v.hint).toContain("Keep this popup open");
  expect(v.progress).toBe(0.42);
  expect(v.cta).toEqual({ label: "Downloading…", lang: "ja", disabled: true, variant: "primary" });
  expect(v.check).toBe(false);
  expect(v.languages[1]).toEqual({ lang: "ja", label: "Japanese → English", state: "downloading", text: "42%" });
});

// rule 2
it("any null status -> checking, no cta", () => {
  for (const st of [s(null, null), s(av, null), s(null, dl)]) {
    const v = toView(st, true, null);
    expect(v.tone).toBe("checking");
    expect(v.title).toBe("Checking…");
    expect(v.cta).toBeNull();
  }
});

// rule 3
it("some available -> ready (or paused) with a secondary Add cta for the first extra downloadable", () => {
  const v = toView(s(av, dl), true, null);
  expect(v.tone).toBe("ready");
  expect(v.title).toBe("Ready");
  expect(v.hint).toBe("Korean messages are translated automatically on YouTube and CHZZK.");
  expect(v.cta).toEqual({ label: "Add Japanese → English", lang: "ja", disabled: false, variant: "secondary" });

  const both = toView(s(av, av), true, null);
  expect(both.hint).toBe("Korean and Japanese messages are translated automatically on YouTube and CHZZK.");
  expect(both.cta).toBeNull();

  expect(toView(s(av, av), false, null).tone).toBe("paused");
});

// rule 4
it("none available, some downloadable -> setup with primary Enable cta for the first", () => {
  const v = toView(s(dl, dl), true, null);
  expect(v.tone).toBe("setup");
  expect(v.title).toBe("Set up translation");
  expect(v.cta).toEqual({ label: "Enable Korean → English", lang: "ko", disabled: false, variant: "primary" });
});

it("toggle off does not hide setup", () => {
  expect(toView(s(dl, dl), false, null).tone).toBe("setup");
});

// rule 5
it("chrome is already downloading -> downloading headline, check footer, no cta", () => {
  const v = toView(s(na, busy), true, null);
  expect(v.tone).toBe("downloading");
  expect(v.title).toBe("Downloading language model…");
  expect(v.cta).toBeNull();
  expect(v.check).toBe(true);
  expect(v.languages[1]?.text).toBe("Downloading…");
});

// rule 6
it("some error -> error headline with Try again for the first errored language", () => {
  const v = toView(s(na, bad), true, null);
  expect(v.tone).toBe("error");
  expect(v.title).toBe("Couldn’t download the model");
  expect(v.cta).toEqual({ label: "Try again", lang: "ja", disabled: false, variant: "primary" });
});

// rule 7
it("only unavailable -> unavailable headline with check", () => {
  const v = toView(s(na, na), true, null);
  expect(v.tone).toBe("unavailable");
  expect(v.title).toBe("Unavailable");
  expect(v.hint).toContain("Korean or Japanese");
  expect(v.check).toBe(true);
  expect(v.cta).toBeNull();
});

// languages rows
it("languages rows map every state", () => {
  const v = toView(s(null, dl), true, null);
  expect(v.languages).toEqual([
    { lang: "ko", label: "Korean → English", state: "checking", text: "…" },
    { lang: "ja", label: "Japanese → English", state: "setup", text: "Not set up" },
  ]);
  expect(toView(s(av, na), true, null).languages).toEqual([
    { lang: "ko", label: "Korean → English", state: "ready", text: "Ready" },
    { lang: "ja", label: "Japanese → English", state: "unavailable", text: "Unavailable" },
  ]);
  expect(toView(s(busy, bad), true, null).languages.map((r) => r.state)).toEqual(["downloading", "error"]);
});

// one language ready, the other unavailable: still ready
it("korean ready + japanese unavailable -> still ready", () => {
  const v = toView(s(av, na), true, null);
  expect(v.tone).toBe("ready");
  expect(v.languages[1]?.state).toBe("unavailable");
});
