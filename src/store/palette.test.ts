// Paleta: escribir no vacía los resultados (sin parpadeo de "sin
// resultados") e Intro con búsqueda en curso espera a los nuevos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "../lib/types";

const searchDocs = vi.fn();
const openEntry = vi.fn();

vi.mock("../lib/commands", () => ({ searchDocs: (...a: unknown[]) => searchDocs(...a) }));
vi.mock("./tabs", () => ({ useTabs: { getState: () => ({ openEntry }) } }));

const { usePalette } = await import("./palette");

const hit = (name: string): SearchResult => ({ docset_id: "css", name, kind: "Property", path: `${name}.html`, score: 1 });
const reply = (names: string[]) => ({ request_id: 1, results: names.map(hit), applied: [], unknown: [] });

describe("palette store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchDocs.mockReset();
    openEntry.mockReset();
    usePalette.setState({ open: true, query: "", results: [], applied: [], unknown: [], activeIndex: 0, pending: false });
  });
  afterEach(() => vi.useRealTimers());

  it("conserva los resultados anteriores mientras busca", async () => {
    searchDocs.mockResolvedValueOnce(reply(["align-items"]));
    usePalette.getState().setQuery("al");
    await vi.runAllTimersAsync();
    expect(usePalette.getState().results.map((r) => r.name)).toEqual(["align-items"]);

    searchDocs.mockResolvedValueOnce(reply(["align-self"]));
    usePalette.getState().setQuery("ali");
    // Antes de responder: sigue mostrando lo anterior, marcado como pendiente.
    expect(usePalette.getState().pending).toBe(true);
    expect(usePalette.getState().results.map((r) => r.name)).toEqual(["align-items"]);
    await vi.runAllTimersAsync();
    expect(usePalette.getState().pending).toBe(false);
    expect(usePalette.getState().results.map((r) => r.name)).toEqual(["align-self"]);
  });

  it("Intro con búsqueda en curso abre el resultado nuevo, no el viejo", async () => {
    searchDocs.mockResolvedValueOnce(reply(["old"]));
    usePalette.getState().setQuery("o");
    await vi.runAllTimersAsync();

    searchDocs.mockResolvedValueOnce(reply(["new"]));
    usePalette.getState().setQuery("ne");
    usePalette.getState().chooseActive();
    expect(openEntry).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(openEntry).toHaveBeenCalledWith("css", { name: "new", path: "new.html" }, { newTab: undefined });
  });

  it("consulta vacía limpia al momento, sin búsqueda", () => {
    usePalette.setState({ results: [hit("x")] });
    usePalette.getState().setQuery("  ");
    expect(usePalette.getState().results).toEqual([]);
    expect(usePalette.getState().pending).toBe(false);
    expect(searchDocs).not.toHaveBeenCalled();
  });
});
