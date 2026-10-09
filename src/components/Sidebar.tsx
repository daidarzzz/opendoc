// Barra lateral: árbol de navegación, carpeta, catálogo, pendientes, estado, tema.
import { BrowseTree } from "./BrowseTree";
import { DocsetIcon } from "./DocsetIcon";
import { useCatalog } from "../store/catalog";
import { useDocsets } from "../store/docsets";
import { useTheme } from "../store/theme";

const THEME_LABEL = { light: "Claro", dark: "Oscuro", system: "Sistema" } as const;

export function Sidebar() {
  const {
    pending,
    extractingIds,
    issues,
    status,
    error,
    dirMissing,
    savedDir,
    choose,
    extract,
  } = useDocsets();
  const { mode, cycle } = useTheme();
  const catalogView = useCatalog((s) => s.view);
  const openCatalog = useCatalog((s) => s.open);
  const updatable = useCatalog((s) => s.updatable);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center justify-between p-3">
        <h1 className="text-sm font-semibold">OpenDoc</h1>
        <button
          onClick={() => void cycle()}
          title="Cambiar tema (Claro / Oscuro / Sistema)"
          className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {THEME_LABEL[mode]}
        </button>
      </div>

      <div className="space-y-1 px-3 pb-2">
        <button
          onClick={() => void choose()}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-left text-xs hover:bg-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Carpeta…
        </button>
        <button
          onClick={openCatalog}
          aria-current={catalogView === "catalog"}
          className={`w-full rounded border px-2 py-1.5 text-left text-xs hover:bg-gray-200 dark:hover:bg-gray-800 ${
            catalogView === "catalog"
              ? "border-blue-500 font-medium"
              : "border-gray-300 dark:border-gray-700"
          }`}
        >
          Catálogo
          {updatable > 0 && (
            <span className="ml-1 rounded bg-blue-600 px-1.5 text-[11px] text-white">
              {updatable}
            </span>
          )}
        </button>
      </div>

      <nav aria-label="Docsets" className="flex min-h-0 flex-1 flex-col px-2">
        <BrowseTree />
        {pending.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-2 text-[11px] uppercase text-gray-400">
              Por instalar (tarix)
            </p>
            <ul className="space-y-0.5">
              {pending.map((p) => {
                const busy = extractingIds.includes(p.id);
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded px-2 py-1.5 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <DocsetIcon icon={p.icon} name={p.name} />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <button
                      onClick={() => void extract(p.id)}
                      disabled={busy}
                      className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    >
                      {busy ? "Extrayendo…" : "Instalar"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-gray-200 p-3 text-xs text-gray-500 dark:border-gray-800">
        <p>{status}</p>
        {dirMissing && (
          <div className="mt-1 rounded bg-yellow-100 p-2 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100">
            <p>Carpeta no disponible{savedDir ? `: ${savedDir}` : ""}.</p>
            <button
              onClick={() => void choose()}
              className="mt-1 underline"
            >
              Elegir otra carpeta
            </button>
          </div>
        )}
        {issues.length > 0 && <p>{issues.length} issues (ver consola T6)</p>}
        {error !== "" && <p className="text-red-500">{error}</p>}
      </div>
    </aside>
  );
}
