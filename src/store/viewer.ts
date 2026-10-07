// Slice del documento actual (destino de navegación).
// El <iframe> con el visor llega en T8; aquí solo se resuelve la URL.
import { create } from "zustand";
import { getDocsetHome } from "../lib/commands";
import { toViewerUrl } from "../lib/opendocUrl";
import { useDocsets } from "./docsets";

export interface CurrentDoc {
  docsetId: string;
  name: string;
  homeUrl: string;
  viewerUrl: string;
}

interface ViewerState {
  current: CurrentDoc | null;
  error: string;
  openDoc: (docsetId: string) => Promise<void>;
}

export const useViewer = create<ViewerState>()((set) => ({
  current: null,
  error: "",
  openDoc: async (docsetId: string) => {
    const doc = useDocsets
      .getState()
      .docsets.find((d) => d.id === docsetId);
    if (!doc) {
      set({ error: `docset desconocido: ${docsetId}` });
      return;
    }
    try {
      const homeUrl = await getDocsetHome(docsetId);
      set({
        current: {
          docsetId,
          name: doc.name,
          homeUrl,
          viewerUrl: toViewerUrl(homeUrl),
        },
        error: "",
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : JSON.stringify(e),
      });
    }
  },
}));
