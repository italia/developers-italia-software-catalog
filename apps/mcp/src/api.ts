import type { PublisherDto, SearchResultDto, SoftwareDto } from "@sw-catalog/shared";

// Client dell'API v2 del catalogo, in sola lettura. Tutto ciò che l'MCP sa del catalogo
// passa da qui (decisione D18 del piano): nessun accesso diretto a OpenSearch o al DB.

export interface ApiConfig {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface IpaEntity {
  ipa: string;
  description: string;
  category: string | null;
  website: string | null;
  publisherId?: string | null;
}

export interface VocabularyTerm {
  key: string;
  labelIt: string | null;
  labelEn: string | null;
}

export type SearchQuery = Record<string, string | number | boolean | string[] | undefined>;

export function createApi({ baseUrl, fetch: doFetch = fetch, timeoutMs = 15_000 }: ApiConfig) {
  const base = baseUrl.replace(/\/$/, "");

  async function get<T>(path: string): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      headers: { Accept: "application/json", "User-Agent": "developers-italia-software-catalog-mcp" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
      throw new ApiError(res.status, body?.detail ?? body?.title ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  const qs = (params: SearchQuery) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
      if (Array.isArray(v)) for (const x of v) s.append(k, x);
      else s.set(k, String(v));
    }
    const out = s.toString();
    return out ? `?${out}` : "";
  };

  return {
    search: (params: SearchQuery) => get<SearchResultDto>(`/search${qs(params)}`),
    software: (id: string) => get<SoftwareDto>(`/software/${encodeURIComponent(id)}`),
    async softwareByUrl(url: string): Promise<SoftwareDto | null> {
      const page = await get<{ data: SoftwareDto[] }>(`/software${qs({ url, "page[size]": 1 })}`);
      return page.data[0] ?? null;
    },
    /** Per id o codice IPA; null se non c'è */
    async publisher(idOrIpa: string): Promise<(PublisherDto & { softwareCount?: number }) | null> {
      try {
        return await get<PublisherDto & { softwareCount?: number }>(`/publishers/${encodeURIComponent(idOrIpa)}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    publishers: (q: string, size = 5) =>
      get<{ data: (PublisherDto & { softwareCount?: number })[] }>(`/publishers${qs({ q, "page[size]": size, active: "true" })}`),
    ipaEntities: (q: string, limit = 5) => get<{ data: IpaEntity[] }>(`/ipa-entities${qs({ q, limit })}`),
    async ipaEntity(ipa: string): Promise<IpaEntity | null> {
      try {
        return await get<IpaEntity>(`/ipa-entities/${encodeURIComponent(ipa)}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    vocabulary: (id: string) => get<{ terms: VocabularyTerm[] }>(`/vocabularies/${encodeURIComponent(id)}`),
  };
}

export type CatalogApi = ReturnType<typeof createApi>;
