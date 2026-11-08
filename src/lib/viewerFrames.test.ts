import { describe, expect, it } from "vitest";
import { findLoadedFrame, isPendingFrameLoad, pickFrameSlot } from "./viewerFrames";

describe("findLoadedFrame", () => {
  it("reuses a page already loaded in either iframe slot", () => {
    const slots = ["opendoc://d/a.html", "opendoc://d/b.html"];
    expect(findLoadedFrame("opendoc://d/a.html", slots)).toBe(0);
    expect(findLoadedFrame("opendoc://d/b.html", slots)).toBe(1);
  });

  it("does not treat an unloaded slot as a cache hit", () => {
    expect(findLoadedFrame("opendoc://d/a.html", [null, "opendoc://d/b.html"])).toBeNull();
  });
});

describe("isPendingFrameLoad", () => {
  it("rejects a delayed load from a destination that was superseded", () => {
    expect(isPendingFrameLoad({ index: 1, url: "opendoc://d/c.html", version: 3 }, 1, "opendoc://d/b.html", 2))
      .toBe(false);
    expect(isPendingFrameLoad({ index: 1, url: "opendoc://d/c.html", version: 3 }, 1, "opendoc://d/c.html", 2))
      .toBe(false);
    expect(isPendingFrameLoad({ index: 1, url: "opendoc://d/c.html", version: 3 }, 1, "opendoc://d/c.html", 3))
      .toBe(true);
  });
});

describe("pickFrameSlot", () => {
  const prev = "opendoc://d/prev.html";
  it("never picks the visible slot and prefers an empty one", () => {
    expect(pickFrameSlot(0, ["opendoc://d/a.html", prev, null], [prev], [5, 4, 0], true)).toBe(2);
  });

  it("keeps the previous history page when another slot is free", () => {
    expect(pickFrameSlot(0, ["opendoc://d/a.html", prev, "opendoc://d/old.html"], [prev], [9, 8, 1], true)).toBe(2);
  });

  it("falls back to the oldest kept slot for real navigations only", () => {
    const loaded = ["opendoc://d/a.html", prev, "opendoc://d/next.html"];
    const keep = [prev, "opendoc://d/next.html"];
    expect(pickFrameSlot(0, loaded, keep, [9, 3, 7], true)).toBe(1);
    expect(pickFrameSlot(0, loaded, keep, [9, 3, 7], false)).toBeNull();
  });
});
