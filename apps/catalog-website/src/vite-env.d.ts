/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ELASTICSEARCH_URL: string;
  readonly VITE_USE_MOCK: string;
  /** API v2 del catalogo, es. http://localhost:3001/v2 (liste editoriali, anagrafica IndicePA) */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
