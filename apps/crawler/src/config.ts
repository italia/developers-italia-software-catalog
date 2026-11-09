// Configurazione da variabili d'ambiente, compatibile con il crawler Go dove possibile.
export const config = {
  apiBaseUrl: (process.env.API_BASEURL ?? "http://localhost:3001/v2").replace(/\/$/, ""),
  apiToken: process.env.API_BEARER_TOKEN ?? "",
  githubToken: process.env.GITHUB_TOKEN ?? "",
  gitlabToken: process.env.GITLAB_TOKEN ?? "",
  giteaToken: process.env.GITEA_TOKEN ?? "",
  mainPublisherId: process.env.MAIN_PUBLISHER_ID ?? "",
  /**
   * Prefisso di organisation.uri per i publisher che non arrivano da un catalogo.
   * La versione Go in produzione usa "urn:x-italian-pa:" fisso; i cataloghi hanno il loro.
   */
  publishersNamespace: process.env.PUBLISHERS_NAMESPACE ?? "urn:x-italian-pa:",
  /** Repository elaborati in parallelo (il lavoro è quasi tutto attesa di rete) */
  concurrency: Number(process.env.CRAWLER_CONCURRENCY ?? 8),
  userAgent: "developers-italia-software-catalog-crawler",
};
