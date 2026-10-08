// Página de bienvenida de pestaña vacía (solo con docsets cargados).
// Minimalista a propósito: título, búsqueda, atajos y ejemplo del filtro.
// Sin tarjetas, degradados, emojis ni iconos de terceros.
import { platform } from "@tauri-apps/plugin-os";
import { usePalette } from "../store/palette";

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <li className="flex items-baseline gap-3">
      <span className="w-20 shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
        {keys}
      </span>
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
    </li>
  );
}

export function Welcome({ docCount }: { docCount: number }) {
  const setOpen = usePalette((s) => s.setOpen);
  // Símbolo del modificador según plataforma (macOS: ⌘).
  const mod = platform() === "macos" ? "⌘" : "Ctrl";

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        OpenDoc
      </h1>
      <button
        onClick={() => setOpen(true)}
        className="mt-6 text-sm text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:decoration-gray-700 dark:hover:text-gray-100"
      >
        Buscar documentación · {mod} K
      </button>
      <ul className="mt-8 space-y-1.5" aria-label="Atajos de teclado">
        <Shortcut keys={`${mod} K`} label="Buscar" />
        <Shortcut keys={`${mod} T`} label="Nueva pestaña" />
        <Shortcut keys={`${mod} W`} label="Cerrar pestaña" />
      </ul>
      <p className="mt-8 text-xs text-gray-400 dark:text-gray-500">
        Filtra por docset:{" "}
        <code className="font-mono text-gray-500 dark:text-gray-400">cpp:vector</code>
      </p>
      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
        {docCount === 1 ? "1 docset cargado" : `${docCount} docsets cargados`}
      </p>
    </div>
  );
}
