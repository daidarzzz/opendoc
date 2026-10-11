import { describe, expect, it } from "vitest";
import { toBackendUrl } from "./iframeMessages";
import {
  folderNameOf,
  fromNeutral,
  isValidDocsetId,
  isValidRelPath,
  resolveDocset,
  sessionToTabs,
  tabsToSession,
  toNeutral,
  trimHistoryWindow,
} from "./session";
import { navigateTab, noteScroll, tabWithEntry } from "./tabHistory";
import type { Docset, PendingTarix, Tab } from "./types";

function docset(id: string, root: string, bundle: string | null = null): Docset {
  return {
    id,
    name: id,
    platform: null,
    version: null,
    bundle_id: bundle,
    home_path: null,
    icon: null,
    root_path: root,
    contents_path: `${root}/Contents`,
  };
}

const DOCSETS = [
  docset("python-3", "/docs/Python.docset", "org.python.docset"),
  docset("css", "/docs/CSS.docset"),
];
const PENDING: PendingTarix[] = [
  { id: "rust", name: "Rust", icon: null, root_path: "/docs/Rust.docset" },
];

function tabWithUrls(docsetId: string, urls: string[], title = "T"): Tab {
  let t = tabWithEntry(docsetId, { url: urls[0] ?? "", title });
  for (const u of urls.slice(1)) {
    t = navigateTab(t, { url: u, title: u });
  }
  return t;
}

describe("toNeutral/fromNeutral", () => {
  it("convierte la forma canónica y la de Windows", () => {
    expect(toNeutral("opendoc://css/a.html#x")).toEqual({ docsetId: "css", rel: "a.html#x" });
    const win = "http://opendoc.localhost/css/a.html";
    const backend = toBackendUrl(win);
    expect(backend).not.toBeNull();
    expect(toNeutral(backend ?? "")).toEqual({ docsetId: "css", rel: "a.html" });
  });

  it("rechaza esquemas externos y formas rotas", () => {
    expect(toNeutral("https://example.com/x")).toBeNull();
    expect(toNeutral("file:///etc/passwd")).toBeNull();
    expect(toNeutral("opendoc://")).toBeNull();
    expect(toNeutral("opendoc:///a.html")).toBeNull();
    expect(toNeutral("opendoc://css")).toBeNull();
  });

  it("reconstruye la URL canónica", () => {
    expect(fromNeutral("css", "a/b.html#f")).toBe("opendoc://css/a/b.html#f");
    expect(fromNeutral("", "a.html")).toBeNull();
    expect(fromNeutral("css", "../x.html")).toBeNull();
  });
});

describe("isValidRelPath/isValidDocsetId", () => {
  it("acepta rutas normales con ancla y query", () => {
    expect(isValidRelPath("a.html")).toBe(true);
    expect(isValidRelPath("sub/index.html#frag")).toBe(true);
    expect(isValidRelPath("a.html?v=2")).toBe(true);
  });

  it("descarta traversal, absolutas, esquemas y rarezas", () => {
    for (const p of [
      "../x.html",
      "a/../../x.html",
      "..%2Fx.html",
      "..%252Fx.html",
      "..",
      "/x.html",
      "C:/x.html",
      "https://example.com/x",
      "opendoc://css/a.html",
      "a\\b.html",
      "",
      "a.html\0",
      `a/${"x".repeat(5000)}.html`,
    ]) {
      expect(isValidRelPath(p)).toBe(false);
    }
    expect(isValidDocsetId("")).toBe(false);
    expect(isValidDocsetId("a/b")).toBe(false);
    expect(isValidDocsetId("C:")).toBe(false);
    expect(isValidDocsetId("python-3")).toBe(true);
  });
});

describe("trimHistoryWindow", () => {
  const hist = Array.from({ length: 100 }, (_, i) => `p${i}`);

  it("conserva la ventana centrada sin perder la actual", () => {
    let r = trimHistoryWindow(hist, 3, 50);
    expect(r.history).toHaveLength(50);
    expect(r.history[r.index]).toBe("p3");
    r = trimHistoryWindow(hist, 60, 50);
    expect(r.history).toHaveLength(50);
    expect(r.history[r.index]).toBe("p60");
    r = trimHistoryWindow(hist, 99, 50);
    expect(r.history).toHaveLength(50);
    expect(r.history[r.index]).toBe("p99");
    expect(r.history).toContain("p99");
  });

  it("es idempotente si ya cabe", () => {
    const small = ["a", "b"];
    expect(trimHistoryWindow(small, 1, 50)).toEqual({ history: small, index: 1 });
  });
});

describe("folderNameOf", () => {
  it("saca la carpeta en ambas plataformas", () => {
    expect(folderNameOf({ root_path: "/docs/Python.docset" })).toBe("Python");
    expect(folderNameOf({ root_path: "C:\\docs\\CSS.docset" })).toBe("CSS");
  });
});

describe("resolveDocset", () => {
  it("id exacto manda", () => {
    expect(
      resolveDocset({ id: "css", name: "X", bundleId: "Y" }, DOCSETS, []),
    ).toEqual({ status: "ok", id: "css" });
  });

  it("bundle_id único reencuentra tras renumerar el slug", () => {
    expect(
      resolveDocset({ id: "python-3-2", name: null, bundleId: "org.python.docset" }, DOCSETS, []),
    ).toEqual({ status: "ok", id: "python-3" });
  });

  it("nombre de carpeta único, insensible a mayúsculas", () => {
    expect(
      resolveDocset({ id: "python-9", name: "python", bundleId: null }, DOCSETS, []),
    ).toEqual({ status: "ok", id: "python-3" });
  });

  it("ambigüedad → missing sin adivinar", () => {
    const dupes = [
      docset("a-1", "/docs/Lib.docset", "same.bundle"),
      docset("a-2", "/docs/lib.docset", "same.bundle"),
    ];
    expect(
      resolveDocset({ id: "zzz", name: "lib", bundleId: "same.bundle" }, dupes, []),
    ).toEqual({ status: "missing", id: "zzz" });
  });

  it("tarix pendiente cuenta como existente sin instalar", () => {
    expect(
      resolveDocset({ id: "rust", name: null, bundleId: null }, DOCSETS, ["rust"]),
    ).toEqual({ status: "pending", id: "rust" });
    expect(
      resolveDocset({ id: "desconocido", name: null, bundleId: null }, DOCSETS, ["rust"]),
    ).toEqual({ status: "missing", id: "desconocido" });
  });
});

describe("tabsToSession/sessionToTabs", () => {
  it("ida y vuelta conserva historial, activa y scroll", () => {
    let t = tabWithUrls("python-3", ["opendoc://python-3/a.html", "opendoc://python-3/b.html#f"]);
    t = noteScroll(t, "opendoc://python-3/b.html#f", 300);
    const data = tabsToSession([t], t.id, DOCSETS);
    expect(data.version).toBe(1);
    expect(data.tabs).toHaveLength(1);
    expect(data.tabs[0]?.docset_id).toBe("python-3");
    expect(data.tabs[0]?.history.map((h) => h.path)).toEqual(["a.html", "b.html#f"]);
    expect(data.tabs[0]?.scroll).toBe(300);
    const back = sessionToTabs(data, DOCSETS, PENDING);
    expect(back.tabs).toHaveLength(1);
    expect(back.tabs[0]?.history.map((e) => e.url)).toEqual([
      "opendoc://python-3/a.html",
      "opendoc://python-3/b.html#f",
    ]);
    expect(back.tabs[0]?.scrolls["opendoc://python-3/b.html#f"]).toBe(300);
    expect(back.activeId).toBe(back.tabs[0]?.id);
  });

  it("no guarda bienvenidas vacías; solo-vacía restaura bienvenida", () => {
    const t = tabWithUrls("css", ["opendoc://css/a.html"]);
    const data = tabsToSession([t], t.id, DOCSETS);
    expect(data.tabs).toHaveLength(1);
    const empty = sessionToTabs({ version: 1, tabs: [], active: 0 }, DOCSETS, PENDING);
    expect(empty.tabs).toHaveLength(1);
    expect(empty.tabs[0]?.history).toHaveLength(0);
  });

  it("sanitiza títulos y scrolls maliciosos sin romper", () => {
    const t = tabWithEntry("css", { url: "opendoc://css/a.html", title: `A\0${"x".repeat(500)}` });
    const withScroll = noteScroll(t, "opendoc://css/a.html", Number.NaN);
    const data = tabsToSession([withScroll], withScroll.id, DOCSETS);
    expect(data.tabs[0]?.history[0]?.title).toBeDefined();
    expect(data.tabs[0]?.history[0]?.title).not.toContain("\0");
    expect(data.tabs[0]?.history[0]?.title.length).toBeLessThanOrEqual(200);
    expect(data.tabs[0]?.scroll).toBeUndefined();
  });

  it("docset ausente se conserva con su id; pista válida actualiza el id", () => {
    const missing = sessionToTabs(
      {
        version: 1,
        tabs: [
          {
            docset_id: "viejo",
            docset_name: null,
            bundle_id: null,
            history: [{ path: "a.html", title: "A" }],
            history_index: 0,
          },
        ],
        active: 0,
      },
      DOCSETS,
      PENDING,
    );
    expect(missing.tabs[0]?.docsetId).toBe("viejo");
    const found = sessionToTabs(
      {
        version: 1,
        tabs: [
          {
            docset_id: "python-3-2",
            docset_name: "Python",
            bundle_id: null,
            history: [{ path: "a.html", title: "A" }],
            history_index: 0,
          },
        ],
        active: 0,
      },
      DOCSETS,
      PENDING,
    );
    expect(found.tabs[0]?.docsetId).toBe("python-3");
    expect(found.tabs[0]?.history[0]?.url).toBe("opendoc://python-3/a.html");
  });

  it("activa inexistente → última; entradas inválidas se descartan", () => {
    const back = sessionToTabs(
      {
        version: 1,
        tabs: [
          {
            docset_id: "css",
            history: [
              { path: "../x.html", title: "X" },
              { path: "ok.html", title: "OK" },
            ],
            history_index: 9,
          },
        ],
        active: 7,
      },
      DOCSETS,
      PENDING,
    );
    expect(back.tabs).toHaveLength(1);
    expect(back.tabs[0]?.history.map((e) => e.url)).toEqual(["opendoc://css/ok.html"]);
    expect(back.activeId).toBe(back.tabs[0]?.id);
  });

  it("archivo malicioso no rompe nada", () => {
    const back = sessionToTabs(
      {
        version: 1,
        tabs: [
          {
            docset_id: "css",
            history: [
              { path: "../../etc/passwd", title: "p" },
              { path: "https://evil.com/x", title: "e" },
              { path: "a.html", title: `ok${"y".repeat(1000)}` },
            ],
            history_index: 0,
          },
        ],
        active: 0,
      },
      DOCSETS,
      PENDING,
    );
    expect(back.tabs).toHaveLength(1);
    expect(back.tabs[0]?.history).toHaveLength(1);
    expect(back.tabs[0]?.history[0]?.title.length).toBeLessThanOrEqual(200);
  });
});
