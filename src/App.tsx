// Pantalla de prueba TEMPORAL de T6 (se reemplaza en T7).
// Prueba el backend desde la ventana: cargar carpeta, buscar, ver home.
import { useEffect, useRef, useState } from "react";
import {
  getDocsetHome,
  listDocsets,
  searchDocs,
  setDocsetsDir,
} from "./lib/commands";
import { toViewerUrl } from "./lib/opendocUrl";
import type { Docset, ScanIssue, SearchResult } from "./lib/types";

// TEMP T6: carpeta por defecto para probar sin pegar la ruta.
// Desaparece en T7 (UI real) / T9 (persistencia de ajustes).
const DEFAULT_DIR =
  "C:\\Users\\david\\Documents\\Projects\\opendoc\\src-tauri\\tests\\fixtures";

function errText(e: unknown): string {
  return e instanceof Error ? e.message : JSON.stringify(e);
}

export default function App() {
  const [dir, setDir] = useState(DEFAULT_DIR);
  const [docsets, setDocsets] = useState<Docset[]>([]);
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [home, setHome] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("iniciando…");
  const seq = useRef(0);

  async function loadDir(raw: string) {
    setError("");
    // Normaliza: sin espacios ni comillas de "Copiar como ruta".
    const clean = raw.trim().replace(/^["']+|["']+$/g, "");
    if (clean === "") {
      setError("pega primero la ruta de la carpeta de docsets");
      return;
    }
    setStatus(`cargando ${clean}…`);
    try {
      const report = await setDocsetsDir(clean);
      setDocsets(report.docsets);
      setIssues(report.issues);
      setResults([]);
      setStatus(
        `cargados ${report.docsets.length} docsets, ${report.issues.length} issues`,
      );
    } catch (e) {
      setStatus("error al cargar");
      setError(errText(e));
    }
  }

  async function load() {
    await loadDir(dir);
  }

  async function refresh() {
    setError("");
    try {
      const list = await listDocsets();
      setDocsets(list);
      setStatus(`listos ${list.length} docsets (0 = sin cargar)`);
    } catch (e) {
      setStatus("error al listar");
      setError(errText(e));
    }
  }

  // Al arrancar: autocarga la carpeta por defecto (TEMP) y prueba el
  // puente invoke sin necesidad de pulsar nada.
  useEffect(() => {
    void loadDir(DEFAULT_DIR);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onQuery(q: string) {
    setQuery(q);
    const mySeq = ++seq.current;
    try {
      const res = await searchDocs(q, { limit: 20 });
      if (mySeq !== seq.current) return; // Respuesta obsoleta: se descarta.
      setResults(res.results);
    } catch (e) {
      if (mySeq !== seq.current) return;
      setError(errText(e));
    }
  }

  async function showHome(docsetId: string) {
    setError("");
    try {
      const backend = await getDocsetHome(docsetId);
      setHome(`${backend}  ->  ${toViewerUrl(backend)}`);
    } catch (e) {
      setError(errText(e));
    }
  }

  return (
    <main style={{ padding: 16, fontFamily: "sans-serif" }}>
      <h1>OpenDoc (prueba T6)</h1>

      <section>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setStatus("submit!");
            void load();
          }}
        >
          <input
            value={dir}
            onChange={(e) => setDir(e.currentTarget.value)}
            placeholder="Ruta de la carpeta de docsets"
            style={{ width: 420 }}
          />
          <button
            type="submit"
            onClick={() => setStatus("clic Cargar!")}
          >
            Cargar
          </button>
        </form>
        <button
          onClick={() => {
            setStatus("clic Refrescar!");
            void refresh();
          }}
        >
          Refrescar
        </button>
      </section>

      {error !== "" && <p style={{ color: "red" }}>{error}</p>}
      <p>estado: {status}</p>

      <section>
        <h2>Docsets ({docsets.length})</h2>
        <ul>
          {docsets.map((d) => (
            <li key={d.id}>
              {d.name} [{d.id}]
              <button onClick={() => showHome(d.id)}>home</button>
            </li>
          ))}
        </ul>
        {issues.length > 0 && (
          <>
            <h2>Issues ({issues.length})</h2>
            <ul>
              {issues.map((i, n) => (
                <li key={n}>
                  {i.kind}: {i.path}
                </li>
              ))}
            </ul>
          </>
        )}
        {home !== "" && <p>home: {home}</p>}
      </section>

      <section>
        <h2>Buscar</h2>
        <input
          value={query}
          onChange={(e) => onQuery(e.currentTarget.value)}
          placeholder="grid, radius, format..."
          style={{ width: 420 }}
        />
        <ul>
          {results.map((r, n) => (
            <li key={`${r.docset_id}:${r.name}:${n}`}>
              {r.name} — {r.kind} [{r.docset_id}]
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
