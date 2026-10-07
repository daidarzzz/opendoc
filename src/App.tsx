// Layout T7: sidebar + área central + Command Palette.
import { useEffect } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { Sidebar } from "./components/Sidebar";
import { Viewer } from "./components/Viewer";
import { useGlobalKeys } from "./hooks/useGlobalKeys";
import { DEFAULT_DIR, useDocsets } from "./store/docsets";

export default function App() {
  const load = useDocsets((s) => s.load);
  useGlobalKeys();

  // Autocarga TEMP de fixtures (desaparece con ajustes en T9).
  useEffect(() => {
    void load(DEFAULT_DIR);
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
