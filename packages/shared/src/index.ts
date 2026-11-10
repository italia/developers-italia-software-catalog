// Costanti e tipi condivisi tra api, crawler, indexer, catalog-website e dashboard.

export * from "./url.ts";
export * from "./api-types.ts";
export * from "./job-runs.ts";

/** Alias OpenSearch letto dal catalogo. Stesso nome dell'indice attuale, per compatibilità. */
export const OPENSEARCH_INDEX_ALIAS = "developers_italia_it";

/** Valori del campo `type` dei documenti nell'indice. */
export const SEARCH_DOC_TYPES = ["software", "administration"] as const;
export type SearchDocType = (typeof SEARCH_DOC_TYPES)[number];

/** Driver supportati per code hosting e sorgenti di catalogo. */
export const VCS_DRIVERS = ["github", "gitlab", "bitbucket", "gitea"] as const;
export type VcsDriver = (typeof VCS_DRIVERS)[number];
export type CatalogSourceDriver = VcsDriver | "json";
