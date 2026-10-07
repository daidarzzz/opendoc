// Barra lateral: docsets (navegación), carpeta, estado, tema.
import { useDocsets } from "../store/docsets";
import { useTheme } from "../store/theme";
import { useViewer } from "../store/viewer";

const THEME_LABEL = { light: "Claro", dark: "Oscuro", system: "Sistema" } as const;

export function Sidebar() {
  const {
    docsets,
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
  const { current, openDoc } = useViewer();
  const { mode, cycle } = useTheme();

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

      <div className="px-3 pb-2">
        <button
          onClick={() => void choose()}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-left text-xs hover:bg-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Carpeta…
        </button>
      </div>

      <nav aria-label="Docsets" className="flex-1 overflow-y-auto px-2">
        <ul className="space-y-0.5">
          {docsets.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => void openDoc(d.id)}
                aria-current={current?.docsetId === d.id}
                className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-gray-200 dark:hover:bg-gray-800 ${
                  current?.docsetId === d.id
                    ? "bg-gray-200 font-medium dark:bg-gray-800"
                    : ""
                }`}
              >
                {d.name}
              </button>
            </li>
          ))}
        </ul>
        {docsets.length === 0 && pending.length === 0 && (
          <p className="px-2 py-1 text-xs text-gray-500">
            Sin docsets cargados.
          </p>
        )}
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
                    <span>{p.name}</span>
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
