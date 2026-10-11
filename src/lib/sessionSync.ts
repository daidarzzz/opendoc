// Orquesta persistir/restaurar pestañas (hidratación única + guardado).
// - `hydrateSessionOnce()`: tras el escaneo (los docsets cargan de forma
//   progresiva: no se marca nada como ausente antes). Con restore_tabs
//   desactivado o sin nada guardado, solo marca hidratado.
// - Guardado con debounce (~500 ms) tras cambios; al cambiar de pestaña
//   se vuelca de inmediato (el scroll de la saliente queda guardado).
//   Nunca se escribe por evento de scroll: el mapa `scrolls` ya está en el
//   store y solo se serializa al guardar.
// - Un único `SessionSaver` serializa las escrituras (sin solapes).
// - Cierre (opción b): el estado vive en el frontend, así que es el
//   frontend quien hace el último guardado en `onCloseRequested` con
//   tiempo máximo (~1 s) y luego destruye la ventana. La alternativa (que
//   Rust cachee el último envío y lo vuelque al cerrar) duplicaría el
//   estado y arriesgaría escribir algo obsoleto. Si el guardado falla al
//   cerrar, igual se cierra (nunca se cuelga la ventana): la copia del
//   debounce (≤500 ms) ya acota la pérdida.
import { getSession, getSettings, saveSession } from "./commands";
import { sessionToTabs, tabsToSession } from "./session";
import { SessionSaver } from "./sessionSaver";
import { useDocsets } from "../store/docsets";
import { useTabs } from "../store/tabs";
import type { SessionData } from "./types";

/** Debounce tras el último cambio antes de guardar. */
export const SESSION_SAVE_DEBOUNCE_MS = 500;
/** Tiempo máximo del guardado final: la ventana nunca se queda colgada. */
export const CLOSE_SAVE_TIMEOUT_MS = 1000;

const saver = new SessionSaver(async (json: string) => {
  await saveSession(JSON.parse(json) as SessionData);
});

let enabled = true;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let hydratePromise: Promise<void> | null = null;

function snapshot(): SessionData {
  const { tabs, activeId } = useTabs.getState();
  return tabsToSession(tabs, activeId, useDocsets.getState().docsets);
}

/** Restaura una vez (llamar tras `initDocsets()`). Nunca deja sin hidratar. */
export function hydrateSessionOnce(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const tabsApi = useTabs.getState();
    try {
      const settings = await getSettings();
      enabled = settings.restore_tabs ?? true;
      if (!enabled) {
        tabsApi.markHydrated();
        saver.markHydrated();
        return;
      }
      const data = await getSession();
      const { docsets, pending } = useDocsets.getState();
      if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) {
        tabsApi.markHydrated();
        saver.markHydrated();
        return;
      }
      const restored = sessionToTabs(data, docsets, pending);
      tabsApi.restoreSession(restored.tabs, restored.activeId);
      saver.markHydrated();
    } catch {
      tabsApi.markHydrated();
      saver.markHydrated();
    }
  })();
  return hydratePromise;
}

/** Suscribe el autoguardado. Devolver la limpieza al desmontar. */
export function startSessionSync(): () => void {
  return useTabs.subscribe((s, prev) => {
    if (s.tabs === prev.tabs && s.activeId === prev.activeId) return;
    if (!enabled) return;
    if (s.activeId !== prev.activeId) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      saver.requestSave(snapshot());
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      saver.requestSave(snapshot());
    }, SESSION_SAVE_DEBOUNCE_MS);
  });
}

/**
 * Activar/desactivar en caliente (interruptor de Ajustes). Al activar no
 * se restaura nada encima: se guarda el estado actual.
 */
export function setSessionEnabled(on: boolean): void {
  enabled = on;
  if (!on) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    return;
  }
  useTabs.getState().markHydrated();
  saver.markHydrated();
  saver.requestSave(snapshot());
}

/** Último guardado (cierre): vuelca lo pendiente y espera (con tope fuera). */
export async function flushSessionForClose(): Promise<void> {
  if (!enabled) return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  saver.requestSave(snapshot());
  await saver.flush();
}
