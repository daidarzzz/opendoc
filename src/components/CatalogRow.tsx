// Fila del catálogo (memoizada): estado, acción, progreso y errores.
// La acción la decide `rowAction` (lógica pura en lib/catalogUi); aquí
// solo se pinta. El progreso llega indexado por feed_id desde el store,
// así que nunca se atribuye al docset equivocado.
import { memo, useState } from "react";
import { DocsetIcon } from "./DocsetIcon";
import { ErrorDetails } from "./ErrorDetails";
import { CloseIcon } from "./Icons";
import { useT } from "../hooks/useT";
import type { FeedEntry, InstallStatus } from "../lib/types";
import type { FeedOp } from "../store/catalog";
import {
  progressPercent,
  rowAction,
  statusBadge,
  versionLine,
  formatProgress,
} from "../lib/catalogUi";
import { tn, type I18nKey } from "../lib/i18n";
import type { RowAction } from "../lib/catalogUi";

const BADGE_CLASSES: Record<string, string> = {
  muted: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300",
  ok: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  info: "bg-accent/15 text-accent-text",
  warn: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20",
};

const ACTION_KEY: Record<Exclude<RowAction, "none">, I18nKey> = {
  install: "catalog.actionInstall",
  update: "catalog.actionUpdate",
  reinstall: "catalog.actionReinstall",
};

export const CatalogRow = memo(function CatalogRow({
  entry,
  status,
  icon,
  op,
  onAction,
  onUninstall,
  onDismiss,
  onChooseFolder,
}: {
  entry: FeedEntry;
  status: InstallStatus | null;
  /** Icono del instalado (`null` = genérico). */
  icon: string | null;
  op: FeedOp;
  onAction: (feedId: string, force: boolean) => void;
  onUninstall: (feedId: string) => void;
  onDismiss: (feedId: string) => void;
  onChooseFolder: () => void;
}) {
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const { t, lang } = useT();
  const action = rowAction(status);
  const badge = statusBadge(status);
  const lines = versionLine(status, lang);
  const mirrors = tn(
    lang,
    entry.urls.length,
    "catalog.sourcesOne",
    "catalog.sourcesMany",
    { n: entry.urls.length },
  );
  const pct = op.progress ? progressPercent(op.progress) : null;

  return (
    <li className="animate-rise-in rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-soft transition-all duration-200 ease-smooth hover:border-gray-300 hover:shadow-md dark:border-white/5 dark:bg-white/[0.03] dark:hover:border-white/10">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <DocsetIcon icon={icon} name={entry.name} />
            <span className="truncate text-sm font-medium">{entry.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_CLASSES[badge.tone]}`}
            >
              {t(badge.key)}
            </span>
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
            {[lines, mirrors].filter((s) => s !== "").join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {action !== "none" && (
            <button
              onClick={() => onAction(entry.id, action !== "install")}
              disabled={op.busy}
              className={`shrink-0 text-xs ${action === "install" ? "btn-primary" : "btn"}`}
            >
              {op.busy ? t("catalog.actionBusy") : t(ACTION_KEY[action])}
            </button>
          )}
          {status?.installed && (
            confirmUninstall ? (
              <>
                <button
                  onClick={() => setConfirmUninstall(false)}
                  disabled={op.busy}
                  className="btn border-transparent bg-transparent text-xs shadow-none dark:bg-transparent"
                >
                  {t("catalog.cancelUninstall")}
                </button>
                <button
                  onClick={() => {
                    setConfirmUninstall(false);
                    onUninstall(entry.id);
                  }}
                  disabled={op.busy}
                  className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-all duration-150 hover:bg-red-700 active:scale-[0.98] disabled:opacity-50"
                >
                  {t("catalog.confirmUninstall")}
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmUninstall(true)}
                disabled={op.busy}
                className="inline-flex items-center rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-all duration-150 hover:bg-red-50 active:scale-[0.98] disabled:opacity-50 dark:border-red-500/20 dark:text-red-300 dark:hover:bg-red-500/10"
              >
                {op.busy ? t("catalog.uninstalling") : t("catalog.uninstall")}
              </button>
            )
          )}
        </div>
      </div>
      {(op.progress || op.error !== null || op.done) && (
        <div className="mt-2 animate-fade-in" aria-live="polite">
          {op.progress && !op.error && !op.done && (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatProgress(op.progress, lang)}
              </p>
              {pct !== null && (
                <div
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-accent-text transition-[width] duration-300 ease-smooth"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </>
          )}
          {op.done && (
            <p className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
              <span>{t("catalog.installedOk")}</span>
              <button
                onClick={() => onDismiss(entry.id)}
                aria-label={t("catalog.dismissNotice", { name: entry.name })}
                className="icon-btn p-1"
              >
                <CloseIcon size={12} strokeWidth={2.5} />
              </button>
            </p>
          )}
          {op.error !== null && (
            <div className="text-xs">
              <p className="flex items-start justify-between gap-2 text-red-600 dark:text-red-400">
                <span className="min-w-0 flex-1">
                  <ErrorDetails error={op.error} />
                </span>
                <button
                  onClick={() => onDismiss(entry.id)}
                  aria-label={t("catalog.dismissError", { name: entry.name })}
                  className="icon-btn shrink-0 p-1"
                >
                  <CloseIcon size={12} strokeWidth={2.5} />
                </button>
              </p>
              {op.errorKind === "no_docsets_dir" && (
                <button
                  onClick={onChooseFolder}
                  className="mt-1 underline"
                >
                  {t("catalog.chooseFolder")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
});
