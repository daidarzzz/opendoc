import { describe, expect, it } from "vitest";
import {
  appendTab,
  catalogTab,
  closeTab,
  canGoBack,
  canGoForward,
  currentEntry,
  emptyTab,
  goBack,
  goForward,
  MAX_HISTORY,
  MAX_TABS,
  moveTab,
  navigateTab,
  noteScroll,
  replaceCurrent,
  sameDocument,
  tabWithEntry,
} from "./tabHistory";
import type { Tab } from "./types";

const a = { url: "opendoc://d/a.html", title: "A" };
const aFrag = { url: "opendoc://d/a.html#x", title: "A#" };
const b = { url: "opendoc://d/b.html", title: "B" };

function tabWith(urls: string[]): Tab {
  let t = emptyTab();
  for (const u of urls) {
    t = navigateTab(t, { url: u, title: u });
  }
  return t;
}

describe("sameDocument", () => {
  it("ignora solo el hash", () => {
    expect(sameDocument(a.url, aFrag.url)).toBe(true);
    expect(sameDocument(a.url, b.url)).toBe(false);
    expect(sameDocument("opendoc://d/a.html", "opendoc://d/a.html")).toBe(true);
  });
});

describe("navigateTab", () => {
  it("apila y limpia el futuro desde punto medio", () => {
    let t = tabWith([a.url, b.url]);
    t = goBack(t);
    expect(currentEntry(t)?.url).toBe(a.url);
    t = navigateTab(t, { url: "opendoc://d/c.html", title: "C" });
    expect(t.history.map((e) => e.url)).toEqual([a.url, "opendoc://d/c.html"]);
    expect(t.historyIndex).toBe(1);
    expect(currentEntry(t)?.url).toBe("opendoc://d/c.html");
  });

  it("URL idéntica solo refresca el título (eco load/hash)", () => {
    const t = tabWith([a.url]);
    const n = navigateTab(t, { url: a.url, title: "A2" });
    expect(n.history).toEqual([{ ...a, title: "A2" }]);
    expect(currentEntry(n)?.title).toBe("A2");
  });

  it("solo-cambio de ancla sustituye sin apilar", () => {
    const t = tabWith([a.url, b.url]);
    const n = navigateTab(t, { url: "opendoc://d/b.html#frag", title: "B#" });
    expect(n.history.map((e) => e.url)).toEqual([a.url, "opendoc://d/b.html#frag"]);
    expect(currentEntry(n)?.url).toBe("opendoc://d/b.html#frag");
  });

  it("acota el pasado a MAX_HISTORY", () => {
    let t = emptyTab();
    for (let i = 0; i < MAX_HISTORY + 10; i++) {
      t = navigateTab(t, { url: `opendoc://d/p${i}.html`, title: `${i}` });
    }
    expect(t.history.length).toBe(MAX_HISTORY);
    expect(t.historyIndex).toBe(MAX_HISTORY - 1);
  });

  it("navegar desde una pestaña de catálogo la convierte en pestaña de docset", () => {
    const cat = catalogTab();
    expect(cat.type).toBe("catalog");
    const docTab = navigateTab(cat, a);
    expect(docTab.type).toBe("docset");
    expect(currentEntry(docTab)?.url).toBe(a.url);
  });
});

describe("goBack/goForward", () => {
  it("recorre una secuencia con un cursor explícito", () => {
    let t = tabWith([a.url, b.url]);
    expect(canGoBack(t)).toBe(true);
    expect(canGoForward(t)).toBe(false);
    t = goBack(t);
    expect(currentEntry(t)?.url).toBe(a.url);
    expect(t.historyIndex).toBe(0);
    expect(canGoBack(t)).toBe(false);
    expect(canGoForward(t)).toBe(true);
    t = goForward(t);
    expect(currentEntry(t)?.url).toBe(b.url);
    expect(t.historyIndex).toBe(1);
    expect(canGoBack(t)).toBe(true);
    expect(canGoForward(t)).toBe(false);
  });

  it("sin pasado/futuro no cambia", () => {
    const t = tabWith([a.url]);
    expect(goBack(t)).toBe(t);
    expect(goForward(t)).toBe(t);
  });
});

describe("iframe navigation echoes", () => {
  it("refreshing the active URL does not add a history stop or erase forward", () => {
    let t = tabWith([a.url, b.url]);
    t = goBack(t);
    const refreshed = navigateTab(t, { ...a, title: "A loaded" });
    expect(refreshed.history.map((entry) => entry.url)).toEqual([a.url, b.url]);
    expect(refreshed.history[0]?.title).toBe("A loaded");
    expect(refreshed.historyIndex).toBe(0);
    expect(canGoForward(refreshed)).toBe(true);
  });
});

describe("noteScroll", () => {
  it("guarda por URL y actualiza", () => {
    let t = tabWith([a.url]);
    t = noteScroll(t, a.url, 120);
    t = noteScroll(t, a.url, 300);
    expect(t.scrolls[a.url]).toBe(300);
  });
});

describe("closeTab", () => {
  it("activa la vecina derecha, o la izquierda si no hay", () => {
    const mk = (n: string) => tabWithEntry("d", { url: `opendoc://${n}`, title: n });
    const tabs = [mk("a"), mk("b"), mk("c")];
    let r = closeTab(tabs, tabs[1].id, tabs[1].id);
    expect(r.tabs.map((t) => currentEntry(t)?.url)).toEqual(["opendoc://a", "opendoc://c"]);
    expect(r.activeId).toBe(tabs[2].id);
    r = closeTab(tabs, tabs[2].id, tabs[2].id);
    expect(r.activeId).toBe(tabs[1].id);
  });

  it("cerrar otra no mueve la activa", () => {
    const mk = (n: string) => tabWithEntry("d", { url: `opendoc://${n}`, title: n });
    const tabs = [mk("a"), mk("b")];
    const r = closeTab(tabs, tabs[0].id, tabs[1].id);
    expect(r.tabs.length).toBe(1);
    expect(r.activeId).toBe(tabs[0].id);
  });

  it("cerrar la última deja una vacía de bienvenida", () => {
    const tabs = [tabWithEntry("d", a)];
    const r = closeTab(tabs, tabs[0].id, tabs[0].id);
    expect(r.tabs.length).toBe(1);
    expect(currentEntry(r.tabs[0])).toBeNull();
  });

  it("id desconocido no cambia nada", () => {
    const tabs = [tabWithEntry("d", a)];
    expect(closeTab(tabs, tabs[0].id, "nope")).toEqual({ tabs, activeId: tabs[0].id });
  });
});

describe("appendTab/moveTab", () => {
  it("acota a MAX_TABS expulsando la inactiva más vieja", () => {
    let tabs: Tab[] = [];
    const first = tabWithEntry("d", { url: "opendoc://t0", title: "0" });
    tabs = appendTab(tabs, "", first).tabs;
    const active = tabs[0].id;
    for (let i = 1; i <= MAX_TABS + 1; i++) {
      const t = tabWithEntry("d", { url: `opendoc://t${i}`, title: `${i}` });
      tabs = appendTab(tabs, active, t).tabs;
    }
    expect(tabs.length).toBe(MAX_TABS);
    // La activa (t0) se conserva; las expulsadas son las inactivas viejas.
    expect(tabs[0].id).toBe(active);
    expect(tabs.map((t) => currentEntry(t)?.url)).not.toContain("opendoc://t1");
  });

  it("mueve pestañas de posición", () => {
    const mk = (n: string) => tabWithEntry("d", { url: `opendoc://${n}`, title: n });
    const tabs = [mk("a"), mk("b"), mk("c")];
    const moved = moveTab(tabs, tabs[0].id, 2);
    expect(moved.map((t) => currentEntry(t)?.url)).toEqual([
      "opendoc://b",
      "opendoc://c",
      "opendoc://a",
    ]);
    expect(moveTab(tabs, "nope", 1)).toBe(tabs);
  });
});

describe("URL normalization", () => {
  it("the iframe echo of a raw index URL is the same stop (no duplicate)", () => {
    let t = tabWith([a.url]);
    t = navigateTab(t, { url: "opendoc://d/my page.html", title: "raw" });
    const echoed = navigateTab(t, { url: "opendoc://d/my%20page.html", title: "loaded" });
    expect(echoed.history.map((e) => e.url)).toEqual([a.url, "opendoc://d/my%20page.html"]);
    expect(echoed.historyIndex).toBe(1);
    expect(goBack(echoed).historyIndex).toBe(0);
  });

  it("restored raw entries match their normalized echo", () => {
    const raw: Tab = { ...tabWithEntry("d", a), history: [a, { url: "opendoc://d/x y.html", title: "X" }], historyIndex: 1 };
    const echoed = navigateTab(raw, { url: "opendoc://d/x%20y.html", title: "X" });
    expect(echoed.history).toHaveLength(2);
  });
});

describe("replaceCurrent (redirects)", () => {
  const bridge = "opendoc://dart/api/dart-core/dart-core-library.html";
  const target = "opendoc://dart/api/dart-core/index.html";
  const home = "opendoc://dart/api/index.html";

  it("a redirect replaces the bridge page, so Back leaves it (Dart docset trap)", () => {
    let t = tabWith([home, bridge]);
    t = replaceCurrent(t, { url: target, title: "dart:core" });
    expect(t.history.map((e) => e.url)).toEqual([home, target]);
    expect(currentEntry(goBack(t))?.url).toBe(home);
  });

  it("merges with the previous entry when redirected back to it", () => {
    let t = tabWith([home, bridge]);
    t = replaceCurrent(t, { url: home, title: "home" });
    expect(t.history.map((e) => e.url)).toEqual([home]);
    expect(t.historyIndex).toBe(0);
  });

  it("keeps the forward stretch", () => {
    let t = goBack(tabWith([home, bridge, b.url]));
    t = replaceCurrent(t, { url: target, title: "x" });
    expect(t.history.map((e) => e.url)).toEqual([home, target, b.url]);
    expect(canGoForward(t)).toBe(true);
  });
});
