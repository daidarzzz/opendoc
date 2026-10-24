// Página de bienvenida de pestaña vacía (solo con docsets cargados).
// Minimalista con barra de búsqueda interactiva central (estilo Raycast / Spotlight).
import { useCallback, useRef } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { useT } from "../hooks/useT";
import { tn } from "../lib/i18n";
import { usePalette } from "../store/palette";
import { useTabs } from "../store/tabs";
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
  const openCatalogTab = useTabs((s) => s.openCatalogTab);
  const { t, lang } = useT();
  // Símbolo del modificador según plataforma (macOS: ⌘).
  const mod = platform() === "macos" ? "⌘" : "Ctrl";

  const barRef = useRef<HTMLButtonElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        <AppLogo size={40} />
        OpenDoc
      </h1>

      {/* Barra de búsqueda interactiva estilo Raycast / Spotlight */}
      <button
        ref={barRef}
        type="button"
        onClick={() => setOpen(true)}
        onMouseMove={handleMouseMove}
        className="group relative mt-7 flex w-full max-w-md items-center justify-between gap-6 overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/70 px-4 py-2.5 text-sm text-gray-500 shadow-xs transition-all duration-200 hover:border-accent hover:text-gray-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-gray-400 dark:hover:border-accent dark:hover:text-gray-200"
        aria-label={t("welcome.searchDocs", { mod })}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), rgb(var(--accent-ch) / 0.12) 0%, transparent 80%)",
          }}
          aria-hidden="true"
        />
        <div className="relative z-10 flex min-w-0 items-center gap-2.5">
          <svg
            className="h-4 w-4 shrink-0 text-gray-400 transition-colors group-hover:text-accent-text dark:text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
            />
          </svg>
          <span className="truncate font-normal">{t("palette.input")}</span>
        </div>
        <kbd className="relative z-10 shrink-0 rounded border border-gray-200 bg-white px-2 py-0.5 font-mono text-xs text-gray-400 shadow-2xs dark:border-zinc-700/80 dark:bg-zinc-800/80 dark:text-gray-400">
          {mod} K
        </kbd>
      </button>

      <div className="mt-3 flex flex-col items-center">
        <button
          onClick={openCatalogTab}
          className="text-xs text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text dark:text-gray-400 dark:decoration-gray-700 dark:hover:text-gray-100"
        >
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
