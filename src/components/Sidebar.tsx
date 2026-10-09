// Barra lateral: árbol de navegación, carpeta, catálogo, pendientes, estado, tema.
import { BrowseTree } from "./BrowseTree";
import { DocsetIcon } from "./DocsetIcon";
import { useDocsets } from "../store/docsets";
import { useTheme } from "../store/theme";
import { useState, type CSSProperties } from "react";

const THEME_LABEL = { light: "Claro", dark: "Oscuro", system: "Sistema" } as const;

export function Sidebar({ style }: { style: CSSProperties }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const mode = useTheme((s) => s.mode);

  return (
    <aside style={style} className="flex h-full min-w-0 shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center justify-between p-3">
        <h1 className="text-sm font-semibold">OpenDoc</h1>
        <button
          onClick={() => setSettingsOpen(true)}
          title="Ajustes"
          aria-label="Ajustes"
          className="rounded p-1.5 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54A.49.49 0 0 0 13.92 2h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.21.07-.47-.12-.61l-2.03-1.58ZM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6Z" />
          </svg>
        </button>
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-[18vh]" onClick={() => setSettingsOpen(false)} role="presentation">
          <section role="dialog" aria-modal="true" aria-label="Ajustes" className="w-full max-w-sm space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Ajustes</h2><button aria-label="Cerrar ajustes" onClick={() => setSettingsOpen(false)}>×</button></div>
            <div><p className="mb-2 text-xs text-gray-500">Tema</p><div className="flex gap-2">{(["system", "light", "dark"] as const).map((value) => <button key={value} aria-pressed={mode === value} onClick={() => void useTheme.getState().setMode(value)} className={`rounded border px-3 py-1 text-sm ${mode === value ? "border-blue-500" : "border-gray-300 dark:border-gray-700"}`}>{THEME_LABEL[value]}</button>)}</div></div>
            <div><p className="mb-1 text-xs text-gray-500">Carpeta de docsets</p><p className="break-all text-xs text-gray-600 dark:text-gray-300">{savedDir ?? "Sin configurar"}</p><button onClick={() => void choose()} className="mt-2 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800">Elegir carpeta…</button></div>
          </section>
        </div>
      )}

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
