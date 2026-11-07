import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, loadPrefsFrom, normalizePrefs, savePrefsTo } from "./prefs";

function memory(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("prefs", () => {
  it("usa los valores por defecto ante basura", () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs("x")).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({ smoothScroll: "yes", paletteLimit: 37 })).toEqual(DEFAULT_PREFS);
  });

  it("conserva valores válidos", () => {
    const p = { smoothScroll: false, linkPrefetch: false, reduceMotion: true, paletteLimit: 100 };
    expect(normalizePrefs(p)).toEqual(p);
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
