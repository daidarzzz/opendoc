import { describe, expect, it } from "vitest";
import { tidyEntries, type MenuEntry } from "./contextMenu";

const item = (id: string): MenuEntry => ({ kind: "item", id, label: id, onSelect: () => {} });
const sep = (id: string): MenuEntry => ({ kind: "separator", id });

describe("tidyEntries", () => {
  it("quita separadores sobrantes", () => {
    const out = tidyEntries([sep("a"), item("1"), sep("b"), sep("c"), item("2"), sep("d")]);
    expect(out.map((e) => e.id)).toEqual(["1", "b", "2"]);
  });

  it("solo separadores → vacío", () => {
    expect(tidyEntries([sep("a"), sep("b")])).toEqual([]);
  });
});
