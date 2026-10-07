// Área central: documento actual (el <iframe> del visor llega en T8).
import { usePalette } from "../store/palette";
import { useViewer } from "../store/viewer";

export function ViewerPlaceholder() {
  const { current, error } = useViewer();
  const setOpen = usePalette((s) => s.setOpen);

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      {current ? (
        <div className="max-w-xl text-center">
          <h2 className="text-lg font-semibold">{current.name}</h2>
          <p className="mt-2 break-all text-xs text-gray-500">
            {current.homeUrl}
          </p>
          <p className="mt-1 break-all text-xs text-gray-500">
            {current.viewerUrl}
          </p>
          <p className="mt-4 text-sm text-gray-500">
            El visor con el contenido llega en T8.
          </p>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm text-gray-500">
            Pulsa Ctrl+K (Cmd+K en macOS) para buscar…
          </p>
          <button
            onClick={() => setOpen(true)}
            className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Buscar
          </button>
        </div>
      )}
      {error !== "" && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </main>
  );
}
