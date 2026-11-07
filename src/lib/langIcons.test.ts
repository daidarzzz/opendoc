import { describe, expect, it } from "vitest";
import table from "./langIcons.json";
import { iconKeys, langIconUrl, monogram, resolveLangIcon } from "./langIcons";

describe("langIcons", () => {
  it("resuelve ids del catálogo y nombres de docsets", () => {
    expect(resolveLangIcon("Python_3")).toBe("python");
    expect(resolveLangIcon("Python 3")).toBe("python");
    expect(resolveLangIcon("C++")).toBe("cplusplus");
    expect(resolveLangIcon("C")).toBe("c");
    expect(resolveLangIcon("Ruby_on_Rails")).toBe("rails");
    expect(resolveLangIcon("Android_(Kotlin)")).toBe("android");
    expect(resolveLangIcon("Lua_5.4")).toBe("lua");
    expect(resolveLangIcon("Java_SE17")).toBe("java");
    expect(resolveLangIcon("jQuery UI")).toBe("jquery");
    expect(resolveLangIcon("Vue.js")).toBe("vuejs");
  });

  it("no inventa iconos y prueba varios nombres en orden", () => {
    expect(resolveLangIcon("Xojo")).toBeNull();
    expect(resolveLangIcon("")).toBeNull();
    expect(resolveLangIcon(null, "Xojo", "Swift")).toBe("swift");
    expect(iconKeys("  ")).toEqual([]);
  });

  it("cada entrada de la tabla tiene su SVG empaquetado", () => {
    for (const key of Object.keys(table)) {
      expect(langIconUrl(key), key).not.toBeNull();
    }
  });

  it("monograma estable con iniciales legibles", () => {
    expect(monogram("Font Awesome").text).toBe("FA");
    expect(monogram("Tcl").text).toBe("Tc");
    expect(monogram("Lo-Dash").text).toBe("LD");
    expect(monogram("Xojo").color).toBe(monogram("Xojo").color);
  });
});
