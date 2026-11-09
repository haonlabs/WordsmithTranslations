import { expect, it } from "vitest";
import { LRU } from "./lru";

it("hits on same key, misses on different key", () => {
  const c = new LRU<string>(3);
  c.set("a", "A");
  expect(c.get("a")).toBe("A");
  expect(c.get("b")).toBeUndefined();
});

it("evicts least recently used past capacity", () => {
  const c = new LRU<string>(2);
  c.set("a", "A");
  c.set("b", "B");
  c.get("a"); // a is now most recent
  c.set("c", "C"); // evicts b
  expect(c.get("b")).toBeUndefined();
  expect(c.get("a")).toBe("A");
  expect(c.size).toBe(2);
});
