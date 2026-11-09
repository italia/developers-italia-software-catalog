import type { Page, PublisherDto, SoftwareDto } from "@sw-catalog/shared";
import { config } from "./config.ts";
import { fetchWithRetry } from "./http.ts";

export interface CatalogDto {
  id: string;
  name: string;
  publishersNamespace: string | null;
  sources: { url: string; driver: string | null; args: string[] }[];
}

/**
 * `path` è relativo alla base (es. "/software") oppure un link restituito dall'API
 * (es. "/v2/software?page[after]=…"), che contiene già il percorso della base.
 */
function resolve(path: string): string {
  const base = new URL(config.apiBaseUrl);
  return path.startsWith(`${base.pathname}/`) ? `${base.origin}${path}` : `${config.apiBaseUrl}${path}`;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetchWithRetry(resolve(path), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(config.apiToken && { Authorization: `Bearer ${config.apiToken}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Scorre tutte le pagine (modalità a cursore). */
async function all<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = `${path}${path.includes("?") ? "&" : "?"}page[size]=100`;
  while (next) {
    const page: Page<T> = await call<Page<T>>("GET", next);
    out.push(...page.data);
    next = page.links.next;
  }
  return out;
}

export const api = {
  catalogs: () => all<CatalogDto>("/catalogs"),
  publishers: () => all<PublisherDto>("/publishers?active=true"),
  publisher: (idOrAlternativeId: string) => call<PublisherDto>("GET", `/publishers/${encodeURIComponent(idOrAlternativeId)}`),

  softwareById: (id: string) => call<SoftwareDto>("GET", `/software/${id}`),
  async softwareByUrl(url: string): Promise<SoftwareDto | null> {
    const page = await call<Page<SoftwareDto>>("GET", `/software?url=${encodeURIComponent(url)}&page[size]=1`);
    return page.data[0] ?? null;
  },
  createSoftware: (body: { url: string; aliases: string[]; publiccodeYml: string; active: boolean; publisherId?: string }) =>
    call<SoftwareDto>("POST", "/software", body),
  updateSoftware: (
    id: string,
    body: { url: string; aliases: string[]; publiccodeYml: string; active: boolean; publisherId?: string },
  ) =>
    call<SoftwareDto>("PATCH", `/software/${id}`, body),

  softwareLog: (id: string, message: string) => call("POST", `/software/${id}/logs`, { message }),
  log: (message: string) => call("POST", "/logs", { message }),
};
