// Traducción ligada al idioma actual: `const { t, lang } = useT()`.
import { useCallback } from "react";
import { t as translate, type I18nKey, type I18nVars } from "../lib/i18n";
import { useLang } from "../store/lang";
import type { Language } from "../lib/types";

export interface Translator {
  (key: I18nKey, vars?: I18nVars): string;
}

export function useT(): { t: Translator; lang: Language } {
  const lang = useLang((s) => s.lang);
  const t = useCallback(
    (key: I18nKey, vars?: I18nVars) => translate(lang, key, vars),
    [lang],
  );
  return { t, lang };
}
