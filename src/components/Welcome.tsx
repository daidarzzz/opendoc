// Página de bienvenida de pestaña vacía (solo con docsets cargados).
// Minimalista a propósito: título, búsqueda, atajos y ejemplo del filtro.
// Sin tarjetas, degradados, emojis ni iconos de terceros.
import { platform } from "@tauri-apps/plugin-os";
import { useT } from "../hooks/useT";
import { tn } from "../lib/i18n";
import { usePalette } from "../store/palette";
import { useCatalog } from "../store/catalog";
import { AppLogo } from "./AppLogo";

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
  const openCatalog = useCatalog((s) => s.open);
  const { t, lang } = useT();
  // Símbolo del modificador según plataforma (macOS: ⌘).
  const mod = platform() === "macos" ? "⌘" : "Ctrl";

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        <AppLogo size={40} />
        OpenDoc
      </h1>
      <div className="mt-6 flex flex-col items-center gap-2">
        <button onClick={() => setOpen(true)} className="text-sm text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text dark:text-gray-400 dark:decoration-gray-700 dark:hover:text-gray-100">
          {t("welcome.searchDocs", { mod })}
        </button>
        <button onClick={openCatalog} className="text-sm text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text dark:text-gray-400 dark:decoration-gray-700 dark:hover:text-gray-100">
          {t("welcome.searchCatalog")}
        </button>
      </div>
      <ul className="mt-8 space-y-1.5" aria-label={t("welcome.shortcuts")}>
        <Shortcut keys={`${mod} K`} label={t("welcome.search")} />
        <Shortcut keys={`${mod} T`} label={t("welcome.newTab")} />
        <Shortcut keys={`${mod} W`} label={t("welcome.closeTab")} />
      </ul>
      <p className="mt-8 text-xs text-gray-400 dark:text-gray-500">
        {t("welcome.filterBy")}{" "}
        <code className="font-mono text-gray-500 dark:text-gray-400">cpp:vector</code>
      </p>
      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
        {tn(lang, docCount, "welcome.docCountOne", "welcome.docCountMany", { n: docCount })}
      </p>
    </div>
  );
}
