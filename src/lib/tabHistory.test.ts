import { describe, expect, it } from "vitest";
import {
  appendTab,
  closeTab,
  consumePending,
  emptyTab,
  goBack,
  goForward,
  MAX_HISTORY,
  MAX_TABS,
  moveTab,
  navigateTab,
  noteScroll,
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
    expect(t.current?.url).toBe(a.url);
    t = navigateTab(t, { url: "opendoc://d/c.html", title: "C" });
    expect(t.future).toEqual([]);
    expect(t.past.map((e) => e.url)).toEqual([a.url]);
    expect(t.current?.url).toBe("opendoc://d/c.html");
  });

  it("URL idéntica solo refresca el título (eco load/hash)", () => {
    const t = tabWith([a.url]);
    const n = navigateTab(t, { url: a.url, title: "A2" });
    expect(n.past).toEqual([]);
    expect(n.current?.title).toBe("A2");
  });

  it("solo-cambio de ancla sustituye sin apilar", () => {
    const t = tabWith([a.url, b.url]);
    const n = navigateTab(t, { url: "opendoc://d/b.html#frag", title: "B#" });
    expect(n.past.map((e) => e.url)).toEqual([a.url]);
    expect(n.current?.url).toBe("opendoc://d/b.html#frag");
    expect(n.future).toEqual([]);
  });

  it("acota el pasado a MAX_HISTORY", () => {
    let t = emptyTab();
    for (let i = 0; i < MAX_HISTORY + 10; i++) {
      t = navigateTab(t, { url: `opendoc://d/p${i}.html`, title: `${i}` });
    }
    expect(t.past.length).toBe(MAX_HISTORY);
  });
});

describe("goBack/goForward", () => {
  it("recorre atrás y adelante con pendingUrl", () => {
    let t = tabWith([a.url, b.url]);
    t = goBack(t);
    expect(t.current?.url).toBe(a.url);
    expect(t.pendingUrl).toBe(a.url);
    expect(t.future.map((e) => e.url)).toEqual([b.url]);
    t = goForward(t);
    expect(t.current?.url).toBe(b.url);
    expect(t.pendingUrl).toBe(b.url);
    expect(t.future).toEqual([]);
  });

  it("sin pasado/futuro no cambia", () => {
    const t = tabWith([a.url]);
    expect(goBack(t)).toBe(t);
    expect(goForward(t)).toBe(t);
  });
});

describe("consumePending", () => {
  it("consume el eco esperado sin tocar pilas", () => {
    let t = tabWith([a.url, b.url]);
    t = goBack(t);
    const { tab: n, consumed } = consumePending(t, a.url);
    expect(consumed).toBe(true);
    expect(n.pendingUrl).toBeNull();
    expect(n.past).toEqual([]);
  });

  it("no consume URLs distintas", () => {
    let t = tabWith([a.url]);
    t = { ...t, pendingUrl: b.url };
    expect(consumePending(t, a.url).consumed).toBe(false);
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
    expect(r.tabs.map((t) => t.current?.url)).toEqual(["opendoc://a", "opendoc://c"]);
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
    expect(r.tabs[0].current).toBeNull();
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
    expect(tabs.map((t) => t.current?.url)).not.toContain("opendoc://t1");
  });

  it("mueve pestañas de posición", () => {
    const mk = (n: string) => tabWithEntry("d", { url: `opendoc://${n}`, title: n });
    const tabs = [mk("a"), mk("b"), mk("c")];
    const moved = moveTab(tabs, tabs[0].id, 2);
    expect(moved.map((t) => t.current?.url)).toEqual([
      "opendoc://b",
      "opendoc://c",
      "opendoc://a",
    ]);
    expect(moveTab(tabs, "nope", 1)).toBe(tabs);
  });
});
