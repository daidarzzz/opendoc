import { describe, expect, it } from "vitest";
import table from "./langIcons.json";
import { badge, iconKeys, langIcon, langIconUrl, monogram, resolveLangIcon } from "./langIcons";
import { DEVDOCS_NAMES } from "./devdocsNames.fixture";

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

  it("ids de DevDocs se reducen a su base", () => {
    expect(resolveLangIcon("devdocs-python~3.12")).toBe("python");
    expect(resolveLangIcon("devdocs-css")).toBe("css3");
    expect(resolveLangIcon("devdocs-node~22_lts")).toBe("nodejs");
    expect(iconKeys("devdocs-")).toEqual([]);
  });

  it("toda documentación de DevDocs tiene icono de Devicon o insignia propia", () => {
    const sinIcono = DEVDOCS_NAMES.filter((name) => !langIcon(name) && !badge(name));
    expect(sinIcono).toEqual([]);
  });

  it("las insignias propias no pisan a Devicon", () => {
    expect(badge("Typst")?.text).toBe("Ty");
    expect(badge("D")?.text).toBe("D");
    expect(badge("Python")).toBeNull();
    expect(badge(null, "Odin")?.text).toBe("Od");
  });
});
