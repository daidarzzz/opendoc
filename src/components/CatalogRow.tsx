// Tarjeta del catálogo (memoizada): icono, estado, versiones, acción,
// progreso y errores. La acción la decide `rowAction` (lógica pura en
// lib/catalogUi); aquí solo se pinta. El progreso llega indexado por
// feed_id desde el store, así que nunca se atribuye al docset equivocado.
import { memo, useState } from "react";
import { DocsetIcon } from "./DocsetIcon";
import { ErrorDetails } from "./ErrorDetails";
import { CheckIcon, CloseIcon, DownloadIcon, RefreshIcon, TrashIcon } from "./Icons";
import { useT } from "../hooks/useT";
import type { FeedEntry, InstallStatus } from "../lib/types";
import type { FeedOp } from "../store/catalog";
import {
  displayName,
  progressPercent,
  rowAction,
  statusBadge,
  versionLine,
  formatProgress,
} from "../lib/catalogUi";
import { t as translate, tn, type I18nKey } from "../lib/i18n";
import type { RowAction } from "../lib/catalogUi";

const BADGE_CLASSES: Record<string, string> = {
  muted: "bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400",
  ok: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  info: "bg-accent/15 text-accent-text ring-1 ring-inset ring-accent-text/20",
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
  /** Icono del instalado (`null` = icono de lenguaje o monograma). */
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
  const lines = versionLine(status, lang) || translate(lang, "catalog.versionsAvailable", { version: entry.version });
  const mirrors = tn(lang, entry.urls.length, "catalog.sourcesOne", "catalog.sourcesMany", { n: entry.urls.length });
  const pct = op.progress ? progressPercent(op.progress) : null;
  const title = displayName(entry.name);
  const installed = status?.installed === true;
  const highlight = badge.tone === "info" ? "border-accent-text/30" : installed ? "border-emerald-500/25" : "border-gray-200/80 dark:border-white/[0.07]";

  return (
    <li
      className={`group flex animate-rise-in flex-col rounded-xl border bg-white p-4 shadow-soft transition-all duration-200 ease-smooth hover:-translate-y-px hover:shadow-md dark:bg-white/[0.03] dark:hover:bg-white/[0.05] ${highlight}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gray-50 dark:border-white/5 dark:bg-white/5">
          <DocsetIcon icon={icon} name={entry.name} hint={entry.id} size={26} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate pt-0.5 text-sm font-semibold tracking-tight" title={title}>
              {title}
            </p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_CLASSES[badge.tone]}`}>
              {t(badge.key)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400" title={lines}>
            {lines}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="truncate text-[11px] text-gray-400 dark:text-gray-500">{mirrors}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {installed && (
            confirmUninstall ? (
              <>
                <button
                  onClick={() => setConfirmUninstall(false)}
                  disabled={op.busy}
                  className="rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  {t("catalog.cancelUninstall")}
                </button>
                <button
                  onClick={() => {
                    setConfirmUninstall(false);
                    onUninstall(entry.id);
                  }}
                  disabled={op.busy}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white shadow-soft transition-all duration-150 hover:bg-red-700 active:scale-[0.98] disabled:opacity-50"
                >
                  <TrashIcon size={12} />
                  {t("catalog.confirmUninstall")}
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmUninstall(true)}
                disabled={op.busy}
                title={op.busy ? t("catalog.uninstalling") : t("catalog.uninstall")}
                aria-label={t("catalog.uninstall")}
                className="icon-btn text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
              >
                <TrashIcon size={15} />
              </button>
            )
          )}
          {action !== "none" && !confirmUninstall && (
            <button
              onClick={() => onAction(entry.id, action !== "install")}
              disabled={op.busy}
              className={`py-1 text-xs ${action === "reinstall" ? "btn" : "btn-primary"}`}
            >
              {op.busy ? (
                <RefreshIcon size={12} className="animate-spin" />
              ) : action === "install" ? (
                <DownloadIcon size={13} />
              ) : (
                <RefreshIcon size={12} />
              )}
              {op.busy ? t("catalog.actionBusy") : t(ACTION_KEY[action])}
            </button>
          )}
        </div>
      </div>

      {(op.progress || op.error !== null || op.done) && (
        <div className="mt-3 animate-fade-in border-t border-gray-100 pt-3 dark:border-white/5" aria-live="polite">
          {op.progress && !op.error && !op.done && (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">{formatProgress(op.progress, lang)}</p>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5"
                role="progressbar"
                aria-valuenow={pct ?? undefined}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full rounded-full bg-accent-text transition-[width] duration-300 ease-smooth ${pct === null ? "w-1/3 animate-pulse" : ""}`}
                  style={pct === null ? undefined : { width: `${pct}%` }}
                />
              </div>
            </>
          )}
          {op.done && (
            <p className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
              <span className="flex items-center gap-1.5">
                <CheckIcon size={13} strokeWidth={2.5} />
                {t("catalog.installedOk")}
              </span>
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
                <button onClick={onChooseFolder} className="mt-1 underline">
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
