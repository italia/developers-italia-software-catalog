import { readFileSync } from "node:fs";
import { OPENSEARCH_INDEX_ALIAS } from "@sw-catalog/shared";

// Accesso a OpenSearch dall'API (ricerca e stato degli strumenti).
// auth=false: ricerca anonima sull'alias, come il catalogo pubblico;
// auth=true: utente OPENSEARCH_USER (es. salute del cluster, alias).

export const searchAlias = () => process.env.OPENSEARCH_INDEX_ALIAS ?? OPENSEARCH_INDEX_ALIAS;

export function opensearchFetch(path: string, auth: boolean, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const base = (process.env.OPENSEARCH_URL ?? "http://localhost:9200").replace(/\/$/, "");
  const headers: Record<string, string> = {};
  const user = process.env.OPENSEARCH_USER;
  if (auth && user) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${process.env.OPENSEARCH_PASS ?? ""}`).toString("base64")}`;
  }
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const ca = process.env.OPENSEARCH_CA_FILE;
  return fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
    ...(ca && { tls: { ca: readFileSync(ca, "utf8") } }),
  });
}
