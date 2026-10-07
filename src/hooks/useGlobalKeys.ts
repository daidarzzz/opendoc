// Atajo global Ctrl/Cmd+K para la paleta.
import { useEffect } from "react";
import { usePalette } from "../store/palette";

export function useGlobalKeys() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        usePalette.getState().toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
