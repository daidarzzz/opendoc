// Persistencia del colapso del panel: ida y vuelta, basura y sin storage.
import { describe, expect, it } from "vitest";
import {
  loadSidebarCollapsed,
  loadSidebarCollapsedFrom,
  saveSidebarCollapsed,
  saveSidebarCollapsedTo,
  type StringStorage,
} from "./sidebar";

function memoryStore(): StringStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("colapso del panel lateral", () => {
  it("visible por defecto y tolera basura o ausencia", () => {
    expect(loadSidebarCollapsedFrom(memoryStore())).toBe(false);
    expect(loadSidebarCollapsedFrom(null)).toBe(false);
    expect(loadSidebarCollapsedFrom(undefined)).toBe(false);
    const store = memoryStore();
    store.data.set("opendoc.sidebarCollapsed", "sí");
    expect(loadSidebarCollapsedFrom(store)).toBe(false);
  });

  it("ida y vuelta", () => {
    const store = memoryStore();
    saveSidebarCollapsedTo(store, true);
    expect(loadSidebarCollapsedFrom(store)).toBe(true);
    saveSidebarCollapsedTo(store, false);
    expect(loadSidebarCollapsedFrom(store)).toBe(false);
  });

  it("sin localStorage (node) no lanza y lee visible", () => {
    expect(loadSidebarCollapsed()).toBe(false);
    expect(() => saveSidebarCollapsed(true)).not.toThrow();
  });
});
