// Fila del catálogo (memoizada): estado, acción, progreso y errores.
// La acción la decide `rowAction` (lógica pura en lib/catalogUi); aquí
// solo se pinta. El progreso llega indexado por feed_id desde el store,
// así que nunca se atribuye al docset equivocado.
import { memo, useState } from "react";
import { DocsetIcon } from "./DocsetIcon";
import { ErrorDetails } from "./ErrorDetails";
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
  muted: "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  ok: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  info: "bg-accent/15 text-accent-text",
  warn: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100",
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
    <li className="rounded border border-gray-200 px-3 py-2 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <DocsetIcon icon={icon} name={entry.name} />
            <span className="truncate text-sm font-medium">{entry.name}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] ${BADGE_CLASSES[badge.tone]}`}
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
              className={`shrink-0 rounded px-3 py-1 text-xs ${
                action === "install"
                  ? "bg-accent-solid text-on-accent hover:brightness-110 disabled:opacity-50"
                  : "border border-gray-300 hover:bg-gray-200 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              }`}
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
                  className="rounded px-2 py-1 text-xs hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-800"
                >
                  {t("catalog.cancelUninstall")}
                </button>
                <button
                  onClick={() => {
                    setConfirmUninstall(false);
                    onUninstall(entry.id);
                  }}
                  disabled={op.busy}
                  className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {t("catalog.confirmUninstall")}
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmUninstall(true)}
                disabled={op.busy}
                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              >
                {op.busy ? t("catalog.uninstalling") : t("catalog.uninstall")}
              </button>
            )
          )}
        </div>
      </div>
      {(op.progress || op.error !== null || op.done) && (
        <div className="mt-1.5" aria-live="polite">
          {op.progress && !op.error && !op.done && (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatProgress(op.progress, lang)}
              </p>
              {pct !== null && (
                <div
                  className="mt-1 h-1 overflow-hidden rounded bg-gray-200 dark:bg-gray-800"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-accent-text"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </>
          )}
          {op.done && (
            <p className="flex items-center justify-between text-xs text-green-700 dark:text-green-300">
              <span>{t("catalog.installedOk")}</span>
              <button
                onClick={() => onDismiss(entry.id)}
                aria-label={t("catalog.dismissNotice", { name: entry.name })}
                className="rounded px-1 hover:bg-gray-200 dark:hover:bg-gray-800"
              >
                ×
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
                  className="shrink-0 rounded px-1 hover:bg-gray-200 dark:hover:bg-gray-800"
                >
                  ×
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
