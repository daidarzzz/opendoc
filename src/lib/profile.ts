// Marcas de profiling FASE 0 (solo diagnóstico).
// El flag lo decide el backend (`OPENDOC_PROFILE=1` al arrancar,
// expuesto en `CatalogStatus.profile_enabled`): aquí no se lee el
// entorno (Vite fijaría `import.meta.env` al compilar, inconsistente
// entre dev y release). Apagado = retorno inmediato, sin ruido.
let enabled = false;

/** Activa o apaga las marcas (lo llama el store del catálogo). */
export function setProfileEnabled(value: boolean): void {
  enabled = value;
}

/** ¿Están activas las marcas? (para tests y ramas que acumulen datos). */
export function isProfileEnabled(): boolean {
  return enabled;
}

/** Marca temporal a consola (solo si está activo). */
export function pmark(label: string, data?: Record<string, unknown>): void {
  if (!enabled) return;
  if (data === undefined) {
    console.debug(`[profile] ${label}`);
  } else {
    console.debug(`[profile] ${label}`, data);
  }
}
