// Lógica pura del campo de la paleta con filtros (testeada con Vitest).
// Claves candidatas: familia, nombre e id (cargados y pendientes).

/** Claves candidatas a filtro (únicas, minúsculas salvo slugs). */
export function filterKeys(
  docsets: { id: string; name: string; platform: string | null }[],
  pending: { id: string; name: string }[],
): string[] {
  const keys: string[] = [];
  for (const d of [...docsets, ...pending]) {
    keys.push(d.name.toLowerCase(), d.id);
  }
  for (const d of docsets) {
    if (d.platform) keys.push(d.platform.toLowerCase());
  }
  return [...new Set(keys)];
}

/**
 * Finalización fantasma: una única coincidencia, sin ":" ya escrito y con
 * texto en el campo. Devuelve el resto a mostrar (más ":").
 */
export function ghostFor(raw: string, keys: string[]): string | null {
  if (raw === "" || raw.includes(":")) return null;
  const lower = raw.toLowerCase();
  const hits = [...new Set(keys.filter((k) => k.startsWith(lower) && k !== lower))];
  return hits.length === 1 ? hits[0].slice(raw.length) + ":" : null;
}

/** La cola tras el primer ":" (null si no hay sintaxis de filtro). */
export function tailAfterColon(raw: string): string | null {
  const colon = raw.indexOf(":");
  if (colon <= 0 || raw.slice(colon + 1).startsWith(":")) return null;
  return raw.slice(colon + 1);
}

/**
 * Quita tokens de la cabecera `a,b:cola` (null si no hay sintaxis).
 * `drop` elige los que se conservan.
 */
export function dropTokens(
  query: string,
  drop: (parts: string[]) => string[],
): string | null {
  const colon = query.indexOf(":");
  if (colon <= 0) return null;
  const head = query.slice(0, colon);
  const tail = query.slice(colon + 1);
  if (tail.startsWith(":")) return null;
  const parts = head
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  if (parts.length === 0) return null;
  const kept = drop(parts);
  return kept.length > 0 ? `${kept.join(",")}:${tail}` : tail;
}
