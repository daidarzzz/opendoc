// Visor de documentación (T8 + pestañas V2-3): el HTML del docset aislado
// en un <iframe> (sandbox="allow-scripts", origen opaco). Solo la pestaña
// activa monta su iframe; las demás guardan URL y scroll.
// El hijo reporta navegaciones/anclas/scroll/teclas por postMessage
// (inyectado por el protocolo); aquí se valida todo: fuente = el iframe
// montado, forma exacta, URLs opendoc de docsets cargados, título ≤200 sin
// controles, scrollY finito en rango y teclas a ≤10/s.
import { useEffect, useRef, useState } from "react";
import { TabsBar } from "./TabsBar";
import { Welcome } from "./Welcome";
import { useDocsets } from "../store/docsets";
import { usePalette } from "../store/palette";
import { useTabs } from "../store/tabs";
import {
  validateKeyMessage,
  validateNavMessage,
  validateOpenTabMessage,
  validateScrollMessage,
} from "../lib/iframeMessages";
import { toViewerUrl } from "../lib/opendocUrl";

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
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const active = tabs.find((t) => t.id === activeId);
  const backendUrl = active?.current?.url ?? null;
  const docsetLoaded =
    !active?.current || docsets.some((d) => d.id === active.docsetId);

  // Carga programática (apertura, cambio de pestaña, atrás/adelante):
  // solo aquí se toca `src`; los reportes del hijo no la cambian.
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    if (!backendUrl) {
      setSrc(null);
      return;
    }
    void toViewerUrl(backendUrl).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [activeId, backendUrl]);

  // Mensajes del hijo, con validación estricta.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const frame = iframeRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const data: unknown = e.data;
      if (typeof data !== "object" || data === null) return;
      const type = (data as Record<string, unknown>)["type"];
      const ids = useDocsets.getState().docsets.map((d) => d.id);
      if (type === "opendoc-nav") {
        const nav = validateNavMessage(data, true, ids);
        if (nav) childNav(nav.url, nav.title);
      } else if (type === "opendoc-scroll") {
        const sc = validateScrollMessage(data, true);
        const tab = useTabs.getState().active();
        if (sc && tab?.current) childScroll(tab.current.url, sc.y);
      } else if (type === "opendoc-key") {
        const kp = validateKeyMessage(data, true);
        if (!kp) return;
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
  }, [childNav, childScroll, childKey, openTabUrl, newTab]);

  // Tras cada carga: tema claro (oscuro desactivado) + scroll guardado.
  const onIframeLoad = (): void => {
    setLoaded(true);
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: "opendoc-theme", value: "light" }, "*");
    const tab = useTabs.getState().active();
    const url = tab?.current?.url;
    if (url) {
      const y = tab?.scrolls[url];
      if (y !== undefined) win.postMessage({ type: "opendoc-scroll-to", y }, "*");
    }
  };

  if (docsets.length === 0 && !loading) {
    return (
      <main className="flex min-w-0 flex-1 flex-col">
        <FolderPrompt
          dirMissing={dirMissing}
          savedDir={savedDir}
          choose={choose}
          error={tabError}
        />
      </main>
    );
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col" role="tabpanel" id="viewer-panel" aria-label="Visor">
      <TabsBar />
      {!active?.current || !docsetLoaded ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          {!active?.current ? (
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
          {!loaded && (
            <p className="p-4 text-sm text-gray-500">Cargando {active.current.title}…</p>
          )}
          <iframe
            ref={iframeRef}
            key={`${active.id}:${src ?? ""}`}
            src={src ?? undefined}
            title={`Documentación de ${active.current.title}`}
            sandbox="allow-scripts"
            className="h-full w-full flex-1 border-0 bg-white"
            onLoad={onIframeLoad}
          />
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
