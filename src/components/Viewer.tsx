// Visor de documentación (T8): el HTML del docset aislado en un <iframe>.
// sandbox="allow-scripts" y nada más: el JS propio del docset (navegación
// colapsable, resaltado, searchtools vía <script>) funciona con origen
// opaco; sin same-origin no hay localStorage/XHR (el docset offline no los
// necesita; la búsqueda global la da la paleta); sin forms/popups/top-nav
// el contenido queda confinado. Si un docset se rompe, la escalada
// documentada es allow-same-origin (sigue sin acceso al padre: orígenes
// distintos en dev y en prod).
//
// Tema oscuro provisional (protocol inyecta style+script constantes):
// tras cada load del iframe y al cambiar el tema resuelto se envía
// {type:"opendoc-theme", value:"dark"|"light"}. El script del docset solo
// acepta mensajes de window.parent.
import { useEffect, useRef, useState } from "react";
import { useDocsets } from "../store/docsets";
import { usePalette } from "../store/palette";
import { useTheme } from "../store/theme";
import { useViewer } from "../store/viewer";

export function Viewer() {
  const { current, error } = useViewer();
  const { docsets, loading, dirMissing, savedDir, choose } = useDocsets();
  const setOpen = usePalette((s) => s.setOpen);
  const mode = useTheme((s) => s.mode);
  const [loaded, setLoaded] = useState(false);
  const viewerUrl = current?.viewerUrl;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Sistema en vivo para el tema resuelto que va al iframe.
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    setLoaded(false);
  }, [viewerUrl]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  // En cada carga del iframe (incluye navegaciones internas) y cada
  // cambio de tema: mensaje de formato exacto al docset.
  useEffect(() => {
    if (!loaded || !viewerUrl) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "opendoc-theme", value: resolved },
      "*",
    );
  }, [loaded, viewerUrl, resolved]);

  if (docsets.length === 0 && !loading) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-8">
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
      </main>
    );
  }
  if (!current) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <p className="text-sm text-gray-500">
          Pulsa Ctrl+K (Cmd+K en macOS) para buscar…
        </p>
        <button
          onClick={() => setOpen(true)}
          className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Buscar
        </button>
        {error !== "" && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </main>
    );
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      {!loaded && (
        <p className="p-4 text-sm text-gray-500">Cargando {current.name}…</p>
      )}
      <iframe
        ref={iframeRef}
        key={current.viewerUrl}
        src={current.viewerUrl}
        title={`Documentación de ${current.name}`}
        sandbox="allow-scripts"
        className="h-full w-full flex-1 border-0 bg-white"
        onLoad={() => setLoaded(true)}
      />
      {error !== "" && <p className="p-2 text-sm text-red-500">{error}</p>}
    </main>
  );
}
