// Barra lateral: docsets (navegación), estado, tema.
import { useDocsets } from "../store/docsets";
import { useTheme } from "../store/theme";
import { useViewer } from "../store/viewer";

export function Sidebar() {
  const { docsets, issues, status, error } = useDocsets();
  const { current, openDoc } = useViewer();
  const { mode, toggle } = useTheme();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center justify-between p-3">
        <h1 className="text-sm font-semibold">OpenDoc</h1>
        <button
          onClick={toggle}
          title="Cambiar tema"
          className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {mode === "dark" ? "Claro" : "Oscuro"}
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
        {docsets.length === 0 && (
          <p className="px-2 py-1 text-xs text-gray-500">
            Sin docsets cargados.
          </p>
        )}
      </nav>

      <div className="border-t border-gray-200 p-3 text-xs text-gray-500 dark:border-gray-800">
        <p>{status}</p>
        {issues.length > 0 && <p>{issues.length} issues (ver consola T6)</p>}
        {error !== "" && <p className="text-red-500">{error}</p>}
      </div>
    </aside>
  );
}
