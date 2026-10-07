// Visor de documentación (T8): el HTML del docset aislado en un <iframe>.
// sandbox="allow-scripts" y nada más: el JS propio del docset (navegación
// colapsable, resaltado, searchtools vía <script>) funciona con origen
// opaco; sin same-origin no hay localStorage/XHR (el docset offline no los
// necesita; la búsqueda global la da la paleta); sin forms/popups/top-nav
// el contenido queda confinado. Si un docset se rompe, la escalada
// documentada es allow-same-origin (sigue sin acceso al padre: orígenes
// distintos en dev y en prod).
import { useEffect, useState } from "react";
import { useDocsets } from "../store/docsets";
import { usePalette } from "../store/palette";
import { useViewer } from "../store/viewer";

export function Viewer() {
  const { current, error } = useViewer();
  const { docsets, loading, dirMissing, savedDir, choose } = useDocsets();
  const setOpen = usePalette((s) => s.setOpen);
  const [loaded, setLoaded] = useState(false);
  const viewerUrl = current?.viewerUrl;

  useEffect(() => {
    setLoaded(false);
  }, [viewerUrl]);

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
