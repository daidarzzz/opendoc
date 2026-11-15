import { describe, expect, it } from "vitest";
import {
  addFavorite,
  filterFavorites,
  isFavorite,
  loadFavoritesFrom,
  normalizeFavorites,
  removeFavorite,
  saveFavoritesTo,
  toggleFavorite,
} from "./favorites";

function memory(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("favorites", () => {
  it("añade al principio y conserva el ancla", () => {
    const a = addFavorite([], "opendoc://css/a.html#x", "A", 1);
    const b = addFavorite(a, "opendoc://css/b.html", "B", 2);
    expect(b.map((f) => f.url)).toEqual(["opendoc://css/b.html", "opendoc://css/a.html#x"]);
    expect(b[1]?.docsetId).toBe("css");
  });

  it("distingue la misma página con anclas distintas", () => {
    let l = addFavorite([], "opendoc://py/m.html#a", "a", 1);
    l = addFavorite(l, "opendoc://py/m.html#b", "b", 2);
    expect(l).toHaveLength(2);
  });

  it("no duplica y un título provisional no pisa el bueno", () => {
    const a = addFavorite([], "opendoc://css/a.html", "Título", 1);
    const b = addFavorite(a, "opendoc://css/a.html", "css", 2);
    expect(b).toHaveLength(1);
    expect(b[0]?.title).toBe("Título");
    expect(b[0]?.at).toBe(1);
    expect(addFavorite(a, "opendoc://css/a.html", "Nuevo", 3)[0]?.title).toBe("Nuevo");
  });

  it("ignora URLs que no son de un docset", () => {
    expect(addFavorite([], "https://example.com", "x", 1)).toEqual([]);
    expect(addFavorite([], "opendoc:///x", "x", 1)).toEqual([]);
  });

  it("alterna y quita", () => {
    const a = toggleFavorite([], "opendoc://css/a.html", "A", 1);
    expect(isFavorite(a, "opendoc://css/a.html")).toBe(true);
    expect(toggleFavorite(a, "opendoc://css/a.html", "A", 2)).toEqual([]);
    expect(removeFavorite(a, "opendoc://css/a.html")).toEqual([]);
  });

  it("normaliza basura del storage", () => {
    expect(normalizeFavorites("x")).toEqual([]);
    const out = normalizeFavorites([
      { url: "opendoc://css/a.html", title: "A", at: 1 },
      { url: "opendoc://css/a.html", title: "dup", at: 2 },
      { url: "http://x", title: "x", at: 1 },
      { url: "opendoc://css/b.html", title: 3, at: 1 },
      null,
    ]);
    expect(out.map((f) => f.title)).toEqual(["A"]);
  });

  it("guarda y carga, tolerando JSON roto o storage ausente", () => {
    const store = memory();
    const l = addFavorite([], "opendoc://css/a.html", "A", 1);
    saveFavoritesTo(store, l);
    expect(loadFavoritesFrom(store)).toEqual(l);
    store.setItem("opendoc.favorites", "{roto");
    expect(loadFavoritesFrom(store)).toEqual([]);
    expect(loadFavoritesFrom(null)).toEqual([]);
  });

  it("filtra por título, docset o URL", () => {
    const l = addFavorite(addFavorite([], "opendoc://css/a.html", "Grid", 1), "opendoc://py/b.html", "asyncio", 2);
    const name = (id: string): string => (id === "css" ? "CSS" : "Python 3");
    expect(filterFavorites(l, "grid", name)).toHaveLength(1);
    expect(filterFavorites(l, "python", name)).toHaveLength(1);
    expect(filterFavorites(l, "", name)).toHaveLength(2);
  });
});
