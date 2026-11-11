import { describe, expect, it } from "vitest";
import {
  MAX_RECENT,
  addRecent,
  filterRecent,
  groupByDay,
  loadRecentFrom,
  normalizeRecent,
  relativeParts,
  removeRecent,
  saveRecentTo,
} from "./recent";

function memory(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("addRecent", () => {
  it("pone la visita primera y sin duplicados (ignora el ancla)", () => {
    let list = addRecent([], "opendoc://py/json.html", "json", 1);
    list = addRecent(list, "opendoc://py/os.html", "os", 2);
    list = addRecent(list, "opendoc://py/json.html#dumps", "json — JSON", 3);
    expect(list.map((p) => p.url)).toEqual(["opendoc://py/json.html", "opendoc://py/os.html"]);
    expect(list[0]).toMatchObject({ title: "json — JSON", docsetId: "py", at: 3 });
  });

  it("un título provisional no pisa el bueno", () => {
    let list = addRecent([], "opendoc://py/index.html", "Python 3.12", 1);
    list = addRecent(list, "opendoc://py/index.html", "py", 2);
    expect(list[0]?.title).toBe("Python 3.12");
    expect(addRecent([], "opendoc://py/x.html", "", 1)[0]?.title).toBe("py");
  });

  it("ignora lo que no es opendoc:// y acota la lista", () => {
    expect(addRecent([], "https://example.com", "x", 1)).toEqual([]);
    let list: ReturnType<typeof addRecent> = [];
    for (let i = 0; i < MAX_RECENT + 5; i++) list = addRecent(list, `opendoc://d/${i}.html`, `p${i}`, i);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]?.url).toBe(`opendoc://d/${MAX_RECENT + 4}.html`);
  });
});

describe("persistencia", () => {
  it("guarda, carga y tolera basura", () => {
    const store = memory();
    const list = addRecent([], "opendoc://py/a.html", "A", 5);
    saveRecentTo(store, list);
    expect(loadRecentFrom(store)).toEqual(list);
    store.setItem("opendoc.recent", "{roto");
    expect(loadRecentFrom(store)).toEqual([]);
    expect(loadRecentFrom(null)).toEqual([]);
    expect(normalizeRecent([{ url: "javascript:x", title: "x", at: 1 }, 3, null, { url: "opendoc://a/b", title: "b", at: 2 }])).toHaveLength(1);
  });
});

describe("relativeParts", () => {
  it("elige la unidad", () => {
    expect(relativeParts(1000, 1000 + 30_000)).toEqual({ value: 0, unit: "minute" });
    expect(relativeParts(0, 5 * 60_000)).toEqual({ value: -5, unit: "minute" });
    expect(relativeParts(0, 3 * 3_600_000)).toEqual({ value: -3, unit: "hour" });
    expect(relativeParts(0, 2 * 86_400_000)).toEqual({ value: -2, unit: "day" });
  });
});

describe("historial completo", () => {
  const now = new Date(2026, 10, 11, 15, 0).getTime();
  const at = (daysAgo: number, h = 12) => new Date(2026, 10, 11 - daysAgo, h, 0).getTime();
  const page = (n: string, t: number) => ({ url: `opendoc://py/${n}.html`, title: n, docsetId: "py", at: t });

  it("agrupa por día y omite grupos vacíos", () => {
    const groups = groupByDay([page("a", at(0)), page("b", at(1)), page("c", at(3)), page("d", at(30))], now);
    expect(groups.map((g) => [g.group, g.pages.map((p) => p.title)])).toEqual([
      ["today", ["a"]],
      ["yesterday", ["b"]],
      ["week", ["c"]],
      ["older", ["d"]],
    ]);
    expect(groupByDay([page("x", at(0))], now).map((g) => g.group)).toEqual(["today"]);
  });

  it("filtra por título, docset o URL", () => {
    const pages = [page("json", now), page("os", now)];
    expect(filterRecent(pages, "JSO", () => "Python 3").map((p) => p.title)).toEqual(["json"]);
    expect(filterRecent(pages, "python", () => "Python 3")).toHaveLength(2);
    expect(filterRecent(pages, "  ", () => "")).toHaveLength(2);
  });

  it("quita una página ignorando el ancla", () => {
    const pages = [page("json", now), page("os", now)];
    expect(removeRecent(pages, "opendoc://py/json.html#dumps").map((p) => p.title)).toEqual(["os"]);
  });
});
