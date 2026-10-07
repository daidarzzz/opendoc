// Pantalla de prueba TEMPORAL de T6 (se reemplaza en T7).
// Prueba el backend desde la ventana: cargar carpeta, buscar, ver home.
import { useRef, useState } from "react";
import {
  getDocsetHome,
  listDocsets,
  searchDocs,
  setDocsetsDir,
} from "./lib/commands";
import { toViewerUrl } from "./lib/opendocUrl";
import type { Docset, ScanIssue, SearchResult } from "./lib/types";

function errText(e: unknown): string {
  return e instanceof Error ? e.message : JSON.stringify(e);
}

export default function App() {
  const [dir, setDir] = useState("");
  const [docsets, setDocsets] = useState<Docset[]>([]);
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [home, setHome] = useState<string>("");
  const [error, setError] = useState<string>("");
  const seq = useRef(0);

  async function load() {
    setError("");
    try {
      const report = await setDocsetsDir(dir);
      setDocsets(report.docsets);
      setIssues(report.issues);
      setResults([]);
    } catch (e) {
      setError(errText(e));
    }
  }

  async function refresh() {
    setError("");
    try {
      setDocsets(await listDocsets());
    } catch (e) {
      setError(errText(e));
    }
  }

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
        <input
          value={dir}
          onChange={(e) => setDir(e.currentTarget.value)}
          placeholder="Ruta de la carpeta de docsets"
          style={{ width: 420 }}
        />
        <button onClick={load}>Cargar</button>
        <button onClick={refresh}>Refrescar</button>
      </section>

      {error !== "" && <p style={{ color: "red" }}>{error}</p>}

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
