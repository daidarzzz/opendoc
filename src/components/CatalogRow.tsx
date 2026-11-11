// Tarjeta del catálogo (memoizada): icono, estado, versiones, acción,
// progreso y errores. La acción la decide `rowAction` (lógica pura en
// lib/catalogUi); aquí solo se pinta. El progreso llega indexado por
// feed_id desde el store, así que nunca se atribuye al docset equivocado.
import { memo, useState } from "react";
import { DocsetIcon } from "./DocsetIcon";
import { ErrorDetails } from "./ErrorDetails";
import { CheckIcon, ClockIcon, CloseIcon, DownloadIcon, RefreshIcon, TrashIcon } from "./Icons";
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

/** Estado como píldora con punto de color. */
const BADGE_CLASSES: Record<string, string> = {
  muted: "bg-ink/[0.05] text-muted",
  ok: "bg-emerald-500/[0.12] text-emerald-700 dark:text-emerald-300",
  info: "bg-accent/[0.12] text-accent-text",
  warn: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
};

const BADGE_DOT: Record<string, string> = {
  muted: "bg-faint",
  ok: "bg-emerald-500",
  info: "bg-accent",
  warn: "bg-amber-500",
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
  queuePos,
  onAction,
  onCancel,
  onUninstall,
  onDismiss,
  onChooseFolder,
}: {
  entry: FeedEntry;
  status: InstallStatus | null;
  /** Icono del instalado (`null` = icono de lenguaje o monograma). */
  icon: string | null;
  op: FeedOp;
  /** Puesto en la cola si espera turno (`null` si no). */
  queuePos: number | null;
  onAction: (feedId: string, force: boolean) => void;
  /** Quita de la cola (solo mientras espera turno). */
  onCancel: (feedId: string) => void;
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
  const queued = op.busy && op.progress?.stage === "queued";
  const highlight = badge.tone === "info" ? "border-accent/40 shadow-[0_0_0_3px_rgb(var(--accent-ch)/0.08)]" : "border-line";

  return (
    <li
      className={`group relative flex animate-rise-in flex-col rounded-2xl border bg-card p-4 transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:shadow-float ${highlight}`}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-card-2 ring-1 ring-line transition-transform duration-200 ease-smooth group-hover:scale-105">
          <DocsetIcon icon={icon} name={entry.name} hint={entry.id} size={26} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate pt-0.5 text-[15px] font-semibold leading-tight tracking-[-0.01em]" title={title}>
            {title}
          </p>
          <p className="mt-1 truncate font-mono text-[11px] text-faint" title={lines}>
            {lines}
          </p>
          <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE_CLASSES[badge.tone]}`}>
            <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${BADGE_DOT[badge.tone]}`} />
            {t(badge.key)}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="truncate text-[11.5px] text-faint">{mirrors}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {installed && (
            confirmUninstall ? (
              <>
                <button
                  onClick={() => setConfirmUninstall(false)}
                  disabled={op.busy}
                  className="rounded-lg px-2 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
                >
                  {t("catalog.cancelUninstall")}
                </button>
                <button
                  onClick={() => {
                    setConfirmUninstall(false);
                    onUninstall(entry.id);
                  }}
                  disabled={op.busy}
                  className="btn-danger px-2.5 py-1"
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
                className="icon-btn text-faint hover:bg-red-600/10 hover:text-red-700 dark:hover:text-red-300"
              >
                <TrashIcon size={15} />
              </button>
            )
          )}
          {action !== "none" && !confirmUninstall && (
            <button
              onClick={() => onAction(entry.id, action !== "install")}
              disabled={op.busy}
              className={
                action === "reinstall"
                  ? "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-50"
                  : "btn-primary py-1"
              }
            >
              {queued ? (
                <ClockIcon size={13} />
              ) : op.busy ? (
                <RefreshIcon size={12} className="animate-spin" />
              ) : action === "install" ? (
                <DownloadIcon size={13} />
              ) : (
                <RefreshIcon size={12} />
              )}
              {queued
                ? t("catalog.progressQueuedAt", { n: queuePos ?? 1 })
                : op.busy
                  ? t("catalog.actionBusy")
                  : t(ACTION_KEY[action])}
            </button>
          )}
        </div>
      </div>

      {(op.progress || op.error !== null || op.done) && (
        <div className="mt-3 animate-fade-in border-t border-line pt-3" aria-live="polite">
          {queued && (
            <p className="flex items-center justify-between gap-2 text-[12px] text-muted">
              <span className="min-w-0 flex-1">{t("catalog.progressQueued")}</span>
              <button
                onClick={() => onCancel(entry.id)}
                className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
              >
                {t("catalog.cancelQueued")}
              </button>
            </p>
          )}
          {op.progress && !queued && !op.error && !op.done && (
            <>
              <p className="text-[12px] text-muted">{formatProgress(op.progress, lang)}</p>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]"
                role="progressbar"
                aria-valuenow={pct ?? undefined}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full rounded-full bg-accent transition-[width] duration-300 ease-smooth ${pct === null ? "w-1/3 animate-pulse" : ""}`}
                  style={pct === null ? undefined : { width: `${pct}%` }}
                />
              </div>
            </>
          )}
          {op.done && (
            <p className="flex items-center justify-between text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
              <span className="flex items-center gap-1.5">
                <CheckIcon size={13} strokeWidth={2} />
                {t("catalog.installedOk")}
              </span>
              <button
                onClick={() => onDismiss(entry.id)}
                aria-label={t("catalog.dismissNotice", { name: entry.name })}
                className="icon-btn p-1"
              >
                <CloseIcon size={12} strokeWidth={2} />
              </button>
            </p>
          )}
          {op.error !== null && (
            <div className="text-[13px]">
              <p className="flex items-start justify-between gap-2 text-red-700 dark:text-red-400">
                <span className="min-w-0 flex-1">
                  <ErrorDetails error={op.error} />
                </span>
                <button
                  onClick={() => onDismiss(entry.id)}
                  aria-label={t("catalog.dismissError", { name: entry.name })}
                  className="icon-btn shrink-0 p-1"
                >
                  <CloseIcon size={12} strokeWidth={2} />
                </button>
              </p>
              {op.errorKind === "no_docsets_dir" && (
                <button onClick={onChooseFolder} className="mt-1 text-[12px] font-medium underline underline-offset-4">
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
