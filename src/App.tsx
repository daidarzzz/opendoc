// Layout: sidebar + área central + Command Palette.
import { useEffect } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { Sidebar } from "./components/Sidebar";
import { Viewer } from "./components/Viewer";
import { useGlobalKeys } from "./hooks/useGlobalKeys";
import { useDocsets } from "./store/docsets";
import { useTheme } from "./store/theme";

export default function App() {
  const initDocsets = useDocsets((s) => s.init);
  const initTheme = useTheme((s) => s.init);
  useGlobalKeys();

  // Arranque: tema guardado (con anti-flash ya aplicado) + carpeta guardada.
  useEffect(() => {
    void initTheme();
    void initDocsets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <Sidebar />
      <Viewer />
      <CommandPalette />
    </div>
  );
}
