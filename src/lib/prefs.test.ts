import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, docDarkFor, loadPrefsFrom, normalizePrefs, savePrefsTo } from "./prefs";

function memory(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("prefs", () => {
  it("usa los valores por defecto ante basura", () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs("x")).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({ smoothScroll: "yes", paletteLimit: 37, design: "neon" })).toEqual(DEFAULT_PREFS);
  });

  it("conserva valores válidos", () => {
    const p = {
      smoothScroll: false,
      linkPrefetch: false,
      reduceMotion: true,
      paletteLimit: 100,
      design: "paper",
      toc: false,
      home: { greeting: false, search: true, filters: false, recent: true, library: false, shortcuts: true },
      docDarkMode: true,
      docDarkOff: ["dart"],
    };
    expect(normalizePrefs(p)).toEqual(p);
  });

  it("completa las secciones de inicio que falten o sean basura", () => {
    const p = normalizePrefs({ home: { recent: false, library: "no" } });
    expect(p.home).toEqual({ ...DEFAULT_PREFS.home, recent: false });
  });

  it("guarda y carga, tolerando JSON roto o storage ausente", () => {
    const store = memory();
    const p = { ...DEFAULT_PREFS, reduceMotion: true, paletteLimit: 50 as const };
    savePrefsTo(store, p);
    expect(loadPrefsFrom(store)).toEqual(p);
    store.setItem("opendoc.prefs", "{roto");
    expect(loadPrefsFrom(store)).toEqual(DEFAULT_PREFS);
    expect(loadPrefsFrom(null)).toEqual(DEFAULT_PREFS);
  });
});

describe("docDarkMode (beta)", () => {
  it("is off by default and tolerates junk", () => {
    expect(DEFAULT_PREFS.docDarkMode).toBe(false);
    expect(normalizePrefs({ docDarkMode: true }).docDarkMode).toBe(true);
    expect(normalizePrefs({ docDarkMode: "yes" }).docDarkMode).toBe(false);
  });
});

describe("docDarkOff (per-docset)", () => {
  it("keeps only unique non-empty strings", () => {
    expect(normalizePrefs({ docDarkOff: ["dart", "dart", "", 3, "go"] }).docDarkOff).toEqual(["dart", "go"]);
    expect(normalizePrefs({ docDarkOff: "dart" }).docDarkOff).toEqual([]);
  });

  it("docDarkFor needs the global switch and respects exclusions", () => {
    expect(docDarkFor({ docDarkMode: false, docDarkOff: [] }, "dart")).toBe(false);
    expect(docDarkFor({ docDarkMode: true, docDarkOff: [] }, "dart")).toBe(true);
    expect(docDarkFor({ docDarkMode: true, docDarkOff: ["dart"] }, "dart")).toBe(false);
  });
});
