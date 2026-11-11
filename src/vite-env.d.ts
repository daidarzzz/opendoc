/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" en la compilación para Microsoft Store (MSIX): la Store gestiona las actualizaciones. */
  readonly VITE_OPENDOC_STORE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
