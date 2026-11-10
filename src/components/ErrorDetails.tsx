// Error hacia la UI: título traducido + detalle técnico plegable.
// El detalle (ids, rutas, mensajes del backend, siempre en inglés)
// nunca se mezcla como texto principal en otro idioma.
import { useT } from "../hooks/useT";
import { errorTitle, toAppError } from "../lib/appError";

export function ErrorDetails({ error }: { error: unknown }) {
  const { t, lang } = useT();
  const info = toAppError(error);
  if (!info) return null;
  return (
    <div className="text-[13px] text-red-700 dark:text-red-400">
      <p>{errorTitle(lang, info)}</p>
      {info.detail !== "" && (
        <details className="mt-1">
          <summary className="label cursor-pointer">
            {t("common.details")}
          </summary>
          <p className="mt-1 break-all font-mono text-[11px] text-muted">
            {info.kind !== "unknown" ? `${info.kind}: ` : ""}{info.detail}
          </p>
        </details>
      )}
    </div>
  );
}
