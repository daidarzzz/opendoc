// Visor de documentación (T8 + pestañas V2-3): el HTML del docset aislado
// en iframes (sandbox="allow-scripts", origen opaco). Solo la pestaña
// activa monta su par de iframes; uno puede preparar la siguiente página en
// segundo plano mientras el otro conserva la página visible.
// El hijo reporta navegaciones/anclas/scroll/teclas por postMessage
// (inyectado por el protocolo); aquí se valida todo: fuente = el iframe
// visible, forma exacta, URLs opendoc de docsets cargados, título ≤200 sin
// controles, scrollY finito en rango y teclas a ≤10/s.
import { useCallback, useEffect, useRef, useState } from "react";
import { Welcome } from "./Welcome";
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
import { toViewerUrl } from "../lib/opendocUrl";
import { currentEntry } from "../lib/tabHistory";
import { findLoadedFrame, isPendingFrameLoad } from "../lib/viewerFrames";

export function Viewer() {
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);
  const tabError = useTabs((s) => s.error);
  const childNav = useTabs((s) => s.childNav);
  const childScroll = useTabs((s) => s.childScroll);
  const childKey = useTabs((s) => s.childKey);
  const openTabUrl = useTabs((s) => s.openTabUrl);
  const newTab = useTabs((s) => s.newTab);
  const { docsets, loading, dirMissing, savedDir, choose } = useDocsets();
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

  const active = tabs.find((t) => t.id === activeId);
  const activeEntry = active ? currentEntry(active) : null;
  const activeTitle = activeEntry?.title ?? "";
  const backendUrl = activeEntry?.url ?? null;
  const docsetLoaded =
    !activeEntry || docsets.some((d) => d.id === active?.docsetId);

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
      if (!frame || e.source !== frame.contentWindow || transitioning) return;
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
      } else if (type === "opendoc-scroll") {
        const sc = validateScrollMessage(data, true);
        const tab = useTabs.getState().active();
        const entry = tab ? currentEntry(tab) : null;
        if (sc && entry) childScroll(entry.url, sc.y);
      } else if (type === "opendoc-key") {
        const kp = validateKeyMessage(data, true);
        if (!kp) return;
        if (kp.key === "k" && !kp.shift) {
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
      <main className="flex min-w-0 flex-1 flex-col">
        {dirMissing ? (
          <FolderPrompt
            dirMissing={dirMissing}
            savedDir={savedDir}
            choose={choose}
            error={tabError}
          />
        ) : (
          <Welcome docCount={0} />
        )}
      </main>
    );
  }

  return (
    <main className="relative flex min-w-0 flex-1 flex-col" role="tabpanel" id="viewer-panel" aria-label="Visor">
      {!activeEntry || !docsetLoaded ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          {!activeEntry ? (
            <Welcome docCount={docsets.length} />
          ) : (
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              El docset de esta pestaña ya no está cargado. Elige la carpeta
              de docsets para recuperarlo.
            </p>
          )}
          {tabError !== "" && <p className="mt-2 text-sm text-red-500">{tabError}</p>}
        </div>
      ) : (
        <>
          {frontFrame === null && (
            <p className="p-4 text-sm text-gray-500">Cargando {activeTitle}…</p>
          )}
          {[0, 1].map((index) => (
            <iframe
              key={`${index}:${frameVersions[index]}`}
              ref={(frame) => { frames.current[index] = frame; }}
              src={frameUrls[index] ?? undefined}
              title={`Documentación de ${activeTitle}`}
              sandbox="allow-scripts"
              aria-hidden={frontFrame !== index}
              className={`h-full w-full flex-1 border-0 bg-white transition-opacity duration-100 motion-reduce:transition-none ${frontFrame === index ? `opacity-100 ${transitioning ? "pointer-events-none" : ""}` : "absolute inset-0 pointer-events-none opacity-0"}`}
              onLoad={() => onIframeLoad(index, frameUrls[index], frameVersions[index])}
            />
          ))}
          {tabError !== "" && <p className="p-2 text-sm text-red-500">{tabError}</p>}
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
  error: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      {dirMissing ? (
        <>
          <p className="text-sm text-gray-500">
            La carpeta guardada no está disponible
            {savedDir ? `: ${savedDir}` : ""} (¿disco desconectado?).
          </p>
          <button
            onClick={() => void choose()}
            className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Elegir otra carpeta
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Elige tu carpeta de docsets para empezar.
          </p>
          <button
            onClick={() => void choose()}
            className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Elegir carpeta
          </button>
        </>
      )}
      {error !== "" && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
