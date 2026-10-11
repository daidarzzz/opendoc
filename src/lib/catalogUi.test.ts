import { describe, expect, it } from "vitest";
import {
  filterCatalog,
  formatBytes,
  formatProgress,
  progressPercent,
  rowAction,
  statusBadge,
  versionLine,
} from "./catalogUi";
import { t } from "./i18n";
import type { CatalogRowData } from "./catalogUi";
import type { DocsetProgress, InstallStatus } from "./types";

function status(over: Partial<InstallStatus>): InstallStatus {
  return {
    feed_id: "Demo",
    name: "Demo",
    installed: false,
    docset_id: null,
    installed_version: null,
    available_version: "1.0",
    update_available: null,
    ambiguous: false,
    ambiguous_ids: [],
    ...over,
  };
}

function rows(): CatalogRowData[] {
  return [
    {
      entry: { id: "CSS", name: "CSS", version: "1", urls: ["a"] },
      status: status({
        feed_id: "CSS",
        installed: true,
        docset_id: "css",
        installed_version: "0.9",
        update_available: true,
      }),
    },
    {
      entry: { id: "Python_3", name: "Python_3", version: "2", urls: ["a", "b"] },
      status: status({
        feed_id: "Python_3",
        installed: true,
        docset_id: "python-3",
        installed_version: null,
        available_version: "2",
        update_available: null,
      }),
    },
    {
      entry: { id: "Go", name: "Go", version: "3", urls: [] },
      status: null,
    },
  ];
}

describe("rowAction", () => {
  it("sin estado o no instalado → instalar (null no bloquea)", () => {
    expect(rowAction(null)).toBe("install");
    expect(rowAction(status({ installed: false, update_available: null }))).toBe(
      "install",
    );
    expect(rowAction(status({ installed: false, update_available: false }))).toBe(
      "install",
    );
  });
  it("instalado con update true → actualizar; si no, reinstalar", () => {
    expect(
      rowAction(status({ installed: true, update_available: true })),
    ).toBe("update");
    expect(
      rowAction(status({ installed: true, update_available: false })),
    ).toBe("reinstall");
    expect(
      rowAction(status({ installed: true, update_available: null })),
    ).toBe("reinstall");
  });
  it("ambigua → ninguna acción", () => {
    expect(
      rowAction(status({ installed: false, ambiguous: true, ambiguous_ids: ["a", "b"] })),
    ).toBe("none");
  });
});

describe("statusBadge y versionLine", () => {
  it("distintivos por estado (texto vía diccionario)", () => {
    expect(statusBadge(null)).toEqual({ key: "catalog.badgeNotInstalled", tone: "muted" });
    expect(t("en", statusBadge(status({ installed: true, update_available: true })).key)).toBe(
      "Updatable",
    );
    expect(t("es", statusBadge(status({ installed: true, update_available: null })).key)).toBe(
      "Instalado",
    );
    expect(t("en", statusBadge(status({ ambiguous: true })).key)).toBe("Ambiguous");
  });
  it("versiones solo con datos reales", () => {
    expect(
      versionLine(status({ installed: true, installed_version: "0.9", available_version: "1" }), "en"),
    ).toBe("installed 0.9 · available 1");
    expect(
      versionLine(status({ installed: true, installed_version: null, available_version: "2" }), "es"),
    ).toBe("instalada (versión desconocida) · disponible 2");
    expect(versionLine(null, "en")).toBe("");
    expect(versionLine(status({ ambiguous: true, ambiguous_ids: ["a", "b"] }), "en")).toContain("a, b");
  });
});

describe("filterCatalog", () => {
  it("texto por nombre o id, insensible a mayúsculas", () => {
    expect(filterCatalog(rows(), "css", "all")).toHaveLength(1);
    expect(filterCatalog(rows(), "PYTHON", "all")).toHaveLength(1);
    expect(filterCatalog(rows(), "zzz", "all")).toHaveLength(0);
    expect(filterCatalog(rows(), "  ", "all")).toHaveLength(3);
  });
  it("filtros por estado", () => {
    expect(filterCatalog(rows(), "", "installed")).toHaveLength(2);
    expect(filterCatalog(rows(), "", "not-installed")).toHaveLength(1);
    expect(filterCatalog(rows(), "", "updatable")).toHaveLength(1);
    expect(filterCatalog(rows(), "go", "installed")).toHaveLength(0);
  });
});

function progress(over: Partial<DocsetProgress>): DocsetProgress {
  return {
    feed_id: "Demo",
    docset_id: null,
    stage: "downloading",
    received_bytes: 0,
    total_bytes: null,
    files: 0,
    message: null,
    ...over,
  };
}

describe("formatBytes y progreso", () => {
  it("unidades (número con Intl)", () => {
    expect(formatBytes("en", 0)).toBe("0 B");
    expect(formatBytes("en", 512)).toBe("512 B");
    expect(formatBytes("en", 2048)).toBe("2.0 KB");
    expect(formatBytes("en", 5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes("es", 2048)).toBe("2,0 KB");
  });
  it("porcentaje solo con total conocido", () => {
    expect(progressPercent(progress({ received_bytes: 50, total_bytes: 100 }))).toBe(50);
    expect(progressPercent(progress({ received_bytes: 10, total_bytes: null }))).toBeNull();
    expect(progressPercent(progress({ stage: "extracting", files: 3 }))).toBeNull();
    expect(
      formatProgress(progress({ received_bytes: 50, total_bytes: 100 }), "en"),
    ).toContain("50%");
    expect(
      formatProgress(progress({ received_bytes: 2048, total_bytes: null }), "en"),
    ).toBe("2.0 KB downloaded");
    expect(formatProgress(progress({ stage: "extracting", files: 7 }), "es")).toContain("7");
    expect(formatProgress(progress({ stage: "verifying" }), "es")).toBe("Verificando…");
    expect(formatProgress(progress({ stage: "done" }), "en")).toBe("Installed");
    expect(formatProgress(progress({ stage: "error", message: "HTTP 404" }), "en")).toContain(
      "HTTP 404",
    );
  });
});
