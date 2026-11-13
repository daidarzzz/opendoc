// Coordinates session hydration and saving around the live tab store.
// Hydration waits for docset discovery. Ordinary writes are debounced and
// serialized, tab switches flush promptly, and window close gives the final
// save a bounded amount of time.
import { getSession, getSettings, saveSession } from "./commands";
import { sessionToTabs, tabsToSession } from "./session";
import { SessionSaver } from "./sessionSaver";
import { useDocsets } from "../store/docsets";
import { useTabs } from "../store/tabs";
import type { SessionData } from "./types";

/** Delay after the latest tab update before scheduling a save. */
export const SESSION_SAVE_DEBOUNCE_MS = 500;
/** Maximum time the window-close handler waits for the final save. */
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

/** Restores once after `initDocsets()` and marks hydration complete on failure. */
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

/** Subscribes to tab changes. Call the returned cleanup on unmount. */
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
 * Changes session persistence at runtime. Enabling it saves the current
 * tabs without applying a previously saved snapshot.
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

/** Saves the latest snapshot on close. The caller supplies the timeout. */
export async function flushSessionForClose(): Promise<void> {
  if (!enabled) return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  saver.requestSave(snapshot());
  await saver.flush();
}
