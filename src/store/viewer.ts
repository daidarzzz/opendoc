// Slice del documento actual (destino de navegación).
// El <iframe> con el visor llega en T8; aquí solo se resuelve la URL.
import { create } from "zustand";
import { getDocsetHome } from "../lib/commands";
import { docsetEntryUrl, toViewerUrl } from "../lib/opendocUrl";
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
  openDoc: (docsetId: string, entry?: { name: string; path: string }) => Promise<void>;
}

export const useViewer = create<ViewerState>()((set) => ({
  current: null,
  error: "",
  openDoc: async (docsetId: string, entry?: { name: string; path: string }) => {
    const doc = useDocsets
      .getState()
      .docsets.find((d) => d.id === docsetId);
    if (!doc) {
      set({ error: `docset desconocido: ${docsetId}` });
      return;
    }
    try {
      // Con entrada se navega directo a ella; si no, a la home.
      const homeUrl = entry
        ? docsetEntryUrl(docsetId, entry.path)
        : await getDocsetHome(docsetId);
      const viewerUrl = await toViewerUrl(homeUrl);
      set({
        current: {
          docsetId,
          name: entry?.name ?? doc.name,
          homeUrl,
          viewerUrl,
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
