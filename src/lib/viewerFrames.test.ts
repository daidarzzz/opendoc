import { describe, expect, it } from "vitest";
import { findLoadedFrame, isPendingFrameLoad } from "./viewerFrames";

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
