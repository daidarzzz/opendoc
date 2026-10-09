import { describe, expect, it } from "vitest";
import {
  apiErrorText,
  filterCatalog,
  formatBytes,
  formatFetchedAt,
  formatProgress,
  progressPercent,
  rowAction,
  statusBadge,
  versionLine,
} from "./catalogUi";
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
  it("distintivos por estado", () => {
    expect(statusBadge(null)).toEqual({ text: "No instalado", tone: "muted" });
    expect(statusBadge(status({ installed: true, update_available: true })).text).toBe(
      "Actualizable",
    );
    expect(statusBadge(status({ installed: true, update_available: null })).text).toBe(
      "Instalado",
    );
    expect(statusBadge(status({ ambiguous: true })).text).toBe("Ambigua");
  });
  it("versiones solo con datos reales", () => {
    expect(
      versionLine(status({ installed: true, installed_version: "0.9", available_version: "1" })),
    ).toBe("instalada 0.9 · disponible 1");
    expect(
      versionLine(status({ installed: true, installed_version: null, available_version: "2" })),
    ).toBe("instalada (versión desconocida) · disponible 2");
    expect(versionLine(null)).toBe("");
    expect(versionLine(status({ ambiguous: true, ambiguous_ids: ["a", "b"] }))).toContain("a, b");
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

describe("apiErrorText", () => {
  it("cada kind F1/F2 con su detalle", () => {
    expect(apiErrorText({ kind: "no_feed_repo" })).toContain("repositorio");
    expect(apiErrorText({ kind: "feed_failed", message: "HTTP 500" })).toContain("HTTP 500");
    expect(apiErrorText({ kind: "catalog_missing" })).toContain("Actualiz");
    expect(apiErrorText({ kind: "download_failed", id: "X", message: "HTTP 404" })).toContain(
      "HTTP 404",
    );
    expect(
      apiErrorText({ kind: "ambiguous_match", id: "X", candidates: ["a", "b"] }),
    ).toContain("a, b");
    expect(apiErrorText({ kind: "no_docsets_dir", path: null })).toContain("elige");
    expect(apiErrorText({ kind: "no_docsets_dir", path: "C:/x" })).toContain("C:/x");
    expect(apiErrorText({ kind: "already_installed", id: "X" })).toContain("instalado");
  });
  it("errores genéricos no se pierden", () => {
    expect(apiErrorText(new Error("roto"))).toBe("roto");
    expect(apiErrorText({ raro: 1 })).toContain("raro");
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
  it("unidades", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
  it("porcentaje solo con total conocido", () => {
    expect(progressPercent(progress({ received_bytes: 50, total_bytes: 100 }))).toBe(50);
    expect(progressPercent(progress({ received_bytes: 10, total_bytes: null }))).toBeNull();
    expect(progressPercent(progress({ stage: "extracting", files: 3 }))).toBeNull();
    expect(
      formatProgress(progress({ received_bytes: 50, total_bytes: 100 })),
    ).toContain("50%");
    expect(
      formatProgress(progress({ received_bytes: 2048, total_bytes: null })),
    ).toBe("2.0 KB descargados");
    expect(formatProgress(progress({ stage: "extracting", files: 7 }))).toContain("7");
    expect(formatProgress(progress({ stage: "verifying" }))).toBe("Verificando…");
    expect(formatProgress(progress({ stage: "done" }))).toBe("Instalado");
    expect(formatProgress(progress({ stage: "error", message: "HTTP 404" }))).toContain(
      "HTTP 404",
    );
  });
});

describe("formatFetchedAt", () => {
  it("nunca sin fecha, legible con fecha", () => {
    expect(formatFetchedAt(null)).toBe("nunca");
    expect(formatFetchedAt(Number.NaN)).toBe("nunca");
    const text = formatFetchedAt(1_700_000_000);
    expect(text).not.toBe("nunca");
    expect(text).toContain("2023");
  });
});
