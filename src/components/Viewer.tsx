// Visor de documentación (T8 + pestañas V2-3): el HTML del docset aislado
// en iframes (sandbox="allow-scripts", origen opaco). Solo la pestaña
// activa monta su par de iframes; uno puede preparar la siguiente página en
// segundo plano mientras el otro conserva la página visible.
// El hijo reporta navegaciones/anclas/scroll/teclas por postMessage
// (inyectado por el protocolo); aquí se valida todo: fuente = el iframe
// visible, forma exacta, URLs opendoc de docsets cargados, título ≤200 sin
// controles, scrollY finito en rango y teclas a ≤10/s.
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorDetails } from "./ErrorDetails";
import { Welcome } from "./Welcome";
import { useT } from "../hooks/useT";
import { useDocsets } from "../store/docsets";
import { usePalette } from "../store/palette";
import { useTabs } from "../store/tabs";
import {
  validateKeyMessage,
  validateNavigateMessage,
  validateNavMessage,
  validateOpenTabMessage,
  validatePrefetchMessage,
  validateReadyMessage,
  validateScrollMessage,
} from "../lib/iframeMessages";
import { toBackendUrl } from "../lib/iframeMessages";
import { toViewerUrl } from "../lib/opendocUrl";
import { currentEntry } from "../lib/tabHistory";
import { findLoadedFrame, isPendingFrameLoad } from "../lib/viewerFrames";
import { CatalogView } from "./CatalogView";

export function Viewer() {
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);
  const tabError = useTabs((s) => s.error);
  const childNav = useTabs((s) => s.childNav);
  const childScroll = useTabs((s) => s.childScroll);
  const childKey = useTabs((s) => s.childKey);
  const openTabUrl = useTabs((s) => s.openTabUrl);
  const newTab = useTabs((s) => s.newTab);
  const { docsets, loading, dirMissing, savedDir, choose, pending, extract, extractingIds } = useDocsets();
  const docsetsError = useDocsets((s) => s.error);
  const { t } = useT();
  const [frameUrls, setFrameUrls] = useState<[string | null, string | null]>([null, null]);
  const [frameVersions, setFrameVersions] = useState<[number, number]>([0, 0]);
  const [frontFrame, setFrontFrame] = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const frames = useRef<[HTMLIFrameElement | null, HTMLIFrameElement | null]>([null, null]);
  const loadedFrameUrls = useRef<[string | null, string | null]>([null, null]);
  const frameVersionsRef = useRef<[number, number]>([0, 0]);
  const frontFrameRef = useRef<number | null>(null);
  const pendingFrame = useRef<{ index: number; url: string; version: number } | null>(null);
  const preloadedFrame = useRef<{ index: number; url: string; version: number } | null>(null);
  const prefetchTime = useRef(0);

  // WKWebView can route trackpad wheel input to the outer document instead
  // of the nested docset iframe. Relay those deltas to the active frame.
  // Callback ref (not an effect): the <main> node changes between the
  // empty and docset branches, and the listener must always sit on the
  // live node. Pinch (ctrlKey) is swallowed, never relayed as scroll.
  const wheelCleanup = useRef<(() => void) | null>(null);
  const attachWheel = useCallback((viewer: HTMLElement | null): void => {
    wheelCleanup.current?.();
    wheelCleanup.current = null;
    if (!viewer) return;
    const relayWheel = (event: WheelEvent): void => {
      if (event.ctrlKey) {
        event.preventDefault();
        return;
      }
      const index = frontFrameRef.current;
      const frame = index === null ? null : frames.current[index];
      const child = frame?.contentWindow;
      if (!child || (event.deltaX === 0 && event.deltaY === 0)) { event.preventDefault(); return; }
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      child.postMessage(
        {
          type: "opendoc-wheel",
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          ctrlKey: false,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        },
        "*",
      );
    };
    viewer.addEventListener("wheel", relayWheel, { passive: false, capture: true });
    wheelCleanup.current = () => viewer.removeEventListener("wheel", relayWheel, true);
  }, []);

  const active = tabs.find((t) => t.id === activeId);
  const activeEntry = active ? currentEntry(active) : null;
  const activeTitle = activeEntry?.title ?? "";
  const backendUrl = activeEntry?.url ?? null;
  /** Es la pestaña de catálogo (sin iframe). */
  const isCatalogTab = active?.type === "catalog";
  /** Estado del docset de la pestaña activa: cargado, tarix sin instalar
   *  o ausente (la pestaña se conserva atenuada en ambos casos). */
  const docsetState: "ok" | "pending" | "missing" = isCatalogTab || !activeEntry || !active
    ? "ok"
    : docsets.some((d) => d.id === active.docsetId)
      ? "ok"
      : pending.some((p) => p.id === active.docsetId)
        ? "pending"
        : "missing";

  // Activa un iframe ya cargado o recién terminado y restaura su estado.
  const activateFrame = useCallback((index: number): void => {
    const frame = frames.current[index];
    pendingFrame.current = null;
    preloadedFrame.current = null;
    frontFrameRef.current = index;
    setFrontFrame(index);
    setTransitioning(false);
    const win = frame?.contentWindow;
    if (!win) return;
    // El tema oscuro solo afecta a la interfaz de OpenDoc. El contenido de
    // los docsets conserva su presentación clara original.
    win.postMessage({ type: "opendoc-theme", value: "light" }, "*");
    const tab = useTabs.getState().active();
    const url = tab ? currentEntry(tab)?.url : undefined;
    if (url) {
      const y = tab?.scrolls[url];
      if (y !== undefined) win.postMessage({ type: "opendoc-scroll-to", y }, "*");
    }
  }, []);

  // Carga en el iframe oculto. La página actual sigue visible hasta que la
  // nueva termine de cargar, evitando el destello blanco durante la navegación.
  useEffect(() => {
    // Un docset puede haberse actualizado en disco con las mismas URLs.
    loadedFrameUrls.current = [null, null];
    preloadedFrame.current = null;
  }, [docsets]);

  useEffect(() => {
    let alive = true;
    if (!backendUrl) {
      pendingFrame.current = null;
      setTransitioning(false);
      loadedFrameUrls.current = [null, null];
      frameVersionsRef.current = [0, 0];
      setFrameVersions([0, 0]);
      setFrontFrame(null);
      frontFrameRef.current = null;
      setFrameUrls([null, null]);
      return;
    }
    setTransitioning(true);
    void toViewerUrl(backendUrl).then((url) => {
      if (!alive) return;
      const cachedIndex = findLoadedFrame(url, loadedFrameUrls.current);
      if (cachedIndex !== null) {
        activateFrame(cachedIndex);
        return;
      }
      const warmed = preloadedFrame.current;
      if (warmed?.url === url) {
        pendingFrame.current = warmed;
        preloadedFrame.current = null;
        return;
      }
      preloadedFrame.current = null;
      const currentFront = frontFrameRef.current;
      const index = currentFront === 0 ? 1 : 0;
      const versions: [number, number] = [...frameVersionsRef.current];
      versions[index] += 1;
      frameVersionsRef.current = versions;
      setFrameVersions(versions);
      pendingFrame.current = { index, url, version: versions[index] };
      setFrameUrls((current) => {
        const next: [string | null, string | null] = [...current];
        next[index] = url;
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [activeId, backendUrl, activateFrame, docsets]);

  // Mensajes del hijo, con validación estricta.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data: unknown = e.data;
      if (typeof data !== "object" || data === null) return;
      const type = (data as Record<string, unknown>)["type"];
      const ids = useDocsets.getState().docsets.map((d) => d.id);
      if (type === "opendoc-ready") {
        const ready = validateReadyMessage(data, true, ids);
        if (!ready) return;
        const activeTab = useTabs.getState().active();
        const activeUrl = activeTab ? currentEntry(activeTab)?.url : null;
        const pending = pendingFrame.current;
        if (
          pending && activeUrl === ready.url &&
          e.source === frames.current[pending.index]?.contentWindow && pending.url === ready.url
        ) {
          loadedFrameUrls.current[pending.index] = pending.url;
          activateFrame(pending.index);
          return;
        }
        const preloaded = preloadedFrame.current;
        if (preloaded && e.source === frames.current[preloaded.index]?.contentWindow && preloaded.url === ready.url) {
          loadedFrameUrls.current[preloaded.index] = preloaded.url;
          preloadedFrame.current = null;
        }
        return;
      }
      const frame = frontFrameRef.current === null
        ? null
        : frames.current[frontFrameRef.current];
      if (!frame || e.source !== frame.contentWindow) return;
      if (type === "opendoc-scroll") {
        // Sin puerta de `transitioning` a propósito: el reporte trae su
        // propia URL (incluye el volcado final en pagehide) y childScroll
        // solo acepta URLs del historial de la pestaña activa.
        const sc = validateScrollMessage(data, true);
        const rawUrl: unknown = (data as Record<string, unknown>)["url"];
        const url = typeof rawUrl === "string" ? toBackendUrl(rawUrl) : null;
        if (sc && url) childScroll(url, sc.y);
        return;
      }
      if (transitioning) return;
      if (type === "opendoc-nav") {
        const nav = validateNavMessage(data, true, ids);
        if (nav) childNav(nav.url, nav.title);
      } else if (type === "opendoc-navigate") {
        const nav = validateNavigateMessage(data, true, ids);
        if (nav) childNav(nav.url, nav.title);
      } else if (type === "opendoc-prefetch") {
        const prefetch = validatePrefetchMessage(data, true, ids);
        const tab = useTabs.getState().active();
        const currentUrl = tab ? currentEntry(tab)?.url : null;
        const now = performance.now();
        if (
          !prefetch || transitioning || pendingFrame.current ||
          frontFrameRef.current === null || prefetch.url === currentUrl ||
          findLoadedFrame(prefetch.url, loadedFrameUrls.current) !== null ||
          preloadedFrame.current?.url === prefetch.url || now - prefetchTime.current < 250
        ) return;
        prefetchTime.current = now;
        const index = frontFrameRef.current === 0 ? 1 : 0;
        const versions: [number, number] = [...frameVersionsRef.current];
        versions[index] += 1;
        frameVersionsRef.current = versions;
        loadedFrameUrls.current[index] = null;
        preloadedFrame.current = { index, url: prefetch.url, version: versions[index] };
        setFrameVersions(versions);
        setFrameUrls((current) => {
          const next: [string | null, string | null] = [...current];
          next[index] = prefetch.url;
          return next;
        });
      } else if (type === "opendoc-key") {
        const kp = validateKeyMessage(data, true);
        if (!kp) return;
        if (kp.key === "k") {
          usePalette.getState().toggle();
          return;
        }
        // Ctrl/Cmd+T abre pestaña vacía + paleta (no es acción de pestaña).
        if (kp.key === "t" && !kp.shift) {
          newTab();
          usePalette.getState().setOpen(true);
          return;
        }
        childKey(kp.key, kp.shift);
      } else if (type === "opendoc-open-tab") {
        const req = validateOpenTabMessage(data, true, ids);
        if (!req) return;
        const meta = useDocsets
          .getState()
          .docsets.find((d) => d.id === req.url.slice("opendoc://".length).split("/", 1)[0]);
        openTabUrl(req.url, meta?.name ?? req.url);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [activateFrame, childNav, childScroll, childKey, openTabUrl, newTab, transitioning]);

  // Solo promover la carga que sigue siendo la solicitada; un destino lento
  // sustituido por otra navegación no debe robar el visor al destino nuevo.
  const onIframeLoad = (index: number, loadedUrl: string | null, version: number): void => {
    const pending = pendingFrame.current;
    if (!isPendingFrameLoad(pending, index, loadedUrl, version)) {
      if (isPendingFrameLoad(preloadedFrame.current, index, loadedUrl, version) && loadedUrl) {
        loadedFrameUrls.current[index] = loadedUrl;
        preloadedFrame.current = null;
      }
      return;
    }
    if (!loadedUrl) return;
    loadedFrameUrls.current[index] = loadedUrl;
    activateFrame(index);
  };

  if (docsets.length === 0 && !loading) {
    return (
      <main ref={attachWheel} className="flex min-w-0 flex-1 flex-col">
        {dirMissing ? (
          <FolderPrompt
            dirMissing={dirMissing}
            savedDir={savedDir}
            choose={choose}
            error={docsetsError}
          />
        ) : (
          <Welcome docCount={0} />
        )}
      </main>
    );
  }

  // Pestaña de catálogo: renderiza el catálogo directamente (sin iframe)
  // No usamos attachWheel porque el catálogo usa scroll nativo del navegador
  if (isCatalogTab) {
    return (
      <main className="flex min-h-0 min-w-0 flex-1 flex-col" role="tabpanel" id="viewer-panel" aria-label={t("catalog.title")}>
        <CatalogView />
      </main>
    );
  }

  return (
    <main ref={attachWheel} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" role="tabpanel" id="viewer-panel" aria-label={t("viewer.viewer")}>
      {!activeEntry || docsetState !== "ok" ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          {!activeEntry ? (
            <Welcome docCount={docsets.length} />
          ) : docsetState === "pending" ? (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                {t("viewer.pendingTarix")}
              </p>
              <button
                onClick={() => {
                  if (active) void extract(active.docsetId);
                }}
                disabled={active !== undefined && extractingIds.includes(active.docsetId)}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-200 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                {active !== undefined && extractingIds.includes(active.docsetId)
                  ? t("settings.extracting")
                  : t("common.install")}
              </button>
            </div>
          ) : (
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              {t("viewer.docsetMissing")}
            </p>
          )}
          <ErrorDetails error={tabError} />
        </div>
      ) : (
        <>
          {frontFrame === null && (
            <p className="p-4 text-sm text-gray-500">{t("viewer.loading", { title: activeTitle })}</p>
          )}
          {[0, 1].map((index) => (
            <iframe
              key={`${index}:${frameVersions[index]}`}
              ref={(frame) => { frames.current[index] = frame; }}
              src={frameUrls[index] ?? undefined}
              title={t("viewer.iframeTitle", { title: activeTitle })}
              sandbox="allow-scripts"
              scrolling="yes"
              aria-hidden={frontFrame !== index}
              className={`h-full min-h-0 w-full flex-1 border-0 bg-white transition-opacity duration-100 motion-reduce:transition-none ${frontFrame === index ? `opacity-100 ${transitioning ? "pointer-events-none" : ""}` : "absolute inset-0 pointer-events-none opacity-0"}`}
              onLoad={() => onIframeLoad(index, frameUrls[index], frameVersions[index])}
            />
          ))}
          <ErrorDetails error={tabError} />
        </>
      )}
    </main>
  );
}

function FolderPrompt({
  dirMissing,
  savedDir,
  choose,
  error,
}: {
  dirMissing: boolean;
  savedDir: string | null;
  choose: () => Promise<void>;
  error: unknown;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      {dirMissing ? (
        <>
          <p className="text-sm text-gray-500">
            {t("viewer.folderGone")}
            {savedDir ? `: ${savedDir}` : ""} {t("settings.diskHint")}
          </p>
          <button
            onClick={() => void choose()}
            className="mt-3 rounded bg-accent-solid px-4 py-2 text-sm text-on-accent hover:brightness-110"
          >
            {t("viewer.chooseAnother")}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            {t("viewer.pickFolder")}
          </p>
          <button
            onClick={() => void choose()}
            className="mt-3 rounded bg-accent-solid px-4 py-2 text-sm text-on-accent hover:brightness-110"
          >
            {t("viewer.chooseFolder")}
          </button>
        </>
      )}
      <ErrorDetails error={error} />
    </div>
  );
}
