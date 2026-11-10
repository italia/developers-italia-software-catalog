import type { SearchFacetDto, SearchHitDto, SearchResultDto } from "@sw-catalog/shared";
import { HttpError } from "../lib/problem.ts";
import { opensearchFetch, searchAlias } from "../lib/opensearch.ts";

// Ricerca nel catalogo sopra OpenSearch (l'alias che legge il catalogo pubblico), con i
// filtri del catalogo: ambiti, categorie, stato di sviluppo, software a riuso, misure e
// beneficiari PNRR, amministrazione, piattaforme, licenza. Ricerca anonima: nessun dato
// che il catalogo pubblico non mostri già.

export interface SearchParams {
  q?: string;
  /** In OR tra loro, come i filtri del catalogo */
  scopes?: string[];
  categories?: string[];
  developmentStatuses?: string[];
  platforms?: string[];
  /** true: solo software a riuso (titolarità di una PA); false: solo gli altri */
  reuse?: boolean;
  pnrrMeasure?: string;
  pnrrTarget?: string;
  /** Codice IPA dell'amministrazione che pubblica il software */
  publisher?: string;
  license?: string;
  page: number;
  size: number;
}

type Source = {
  slug?: string;
  publisher?: { name?: string; ipa?: string | null } | null;
  publiccode?: Record<string, unknown>;
};

const LANGS = ["it", "en"];
const SEARCH_FIELDS = [
  "publiccode.name^3",
  "publiccode.description.*.localisedName^3",
  "publiccode.description.*.genericName^2",
  "publiccode.description.*.shortDescription^2",
  "publiccode.description.*.longDescription",
  "publiccode.description.*.features",
  "publisher.name",
];

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : []);

/** La descrizione in italiano, poi in inglese, poi la prima disponibile. */
export function pickDescription(pc: Record<string, unknown>): { lang: string | null; desc: Record<string, unknown> } {
  const all = obj(pc.description);
  const keys = Object.keys(all);
  const lang =
    LANGS.find((l) => l in all) ?? keys.find((k) => LANGS.some((l) => k.toLowerCase().startsWith(`${l}-`))) ?? keys[0] ?? null;
  return { lang, desc: lang ? obj(all[lang]) : {} };
}

/** Codice IPA dichiarato: organisation.uri urn:x-italian-pa:… o IT/it.riuso.codiceIPA. */
export function declaredIpa(pc: Record<string, unknown>): string | null {
  const uri = str(obj(pc.organisation).uri);
  if (uri?.startsWith("urn:x-italian-pa:")) return uri.slice("urn:x-italian-pa:".length).toLowerCase();
  const ipa = str(obj(obj(pc.IT).riuso).codiceIPA) ?? str(obj(obj(pc.it).riuso).codiceIPA);
  return ipa?.toLowerCase() ?? null;
}

export function toHit(id: string, source: Source, score: number | null, catalogBase = process.env.CATALOG_PUBLIC_URL): SearchHitDto {
  const pc = obj(source.publiccode);
  const { lang, desc } = pickDescription(pc);
  const ipa = declaredIpa(pc);
  const slug = source.slug ?? id;
  const releaseDate = pc.releaseDate instanceof Date ? pc.releaseDate.toISOString().slice(0, 10) : str(pc.releaseDate);
  return {
    id: slug,
    name: str(desc.localisedName) ?? str(pc.name) ?? slug,
    shortDescription: str(desc.shortDescription),
    descriptionLanguage: lang,
    publisher: source.publisher?.name ? { name: source.publisher.name, ipa: source.publisher.ipa ?? null } : null,
    reuse: ipa !== null,
    declaredIpa: ipa,
    scopes: strs(obj(pc.intendedAudience).scope),
    categories: strs(pc.categories),
    developmentStatus: str(pc.developmentStatus),
    softwareType: str(pc.softwareType),
    maintenanceType: str(obj(pc.maintenance).type),
    license: str(obj(pc.legal).license),
    platforms: strs(pc.platforms),
    releaseDate,
    url: str(pc.url),
    landingURL: str(pc.landingURL),
    catalogUrl: catalogBase ? `${catalogBase.replace(/\/$/, "")}/software/${encodeURIComponent(slug)}` : null,
    score,
  };
}

const REUSE_CLAUSES = [
  { prefix: { "publiccode.organisation.uri": "urn:x-italian-pa:" } },
  { exists: { field: "publiccode.IT.riuso.codiceIPA" } },
  { exists: { field: "publiccode.it.riuso.codiceIPA" } },
];

/** Tag nei features del publiccode.yml (PNRR/Misura/1.4.1), in italiano o in inglese. */
const featureTag = (tag: string) => ({
  bool: { should: LANGS.map((l) => ({ term: { [`publiccode.description.${l}.features.keyword`]: tag } })), minimum_should_match: 1 },
});

export function buildQuery(p: SearchParams) {
  const filter: object[] = [{ term: { type: "software" } }];
  const must: object[] = [];
  const mustNot: object[] = [];

  if (p.q) {
    must.push({
      multi_match: { query: p.q, fields: SEARCH_FIELDS, type: "best_fields", tie_breaker: 0.3, fuzziness: "AUTO", operator: "or", minimum_should_match: "2<-25%" },
    });
  }
  if (p.scopes?.length) filter.push({ terms: { "publiccode.intendedAudience.scope": p.scopes } });
  if (p.categories?.length) filter.push({ terms: { "publiccode.categories": p.categories } });
  if (p.developmentStatuses?.length) filter.push({ terms: { "publiccode.developmentStatus": p.developmentStatuses } });
  if (p.platforms?.length) filter.push({ terms: { "publiccode.platforms": p.platforms } });
  if (p.license) filter.push({ term: { "publiccode.legal.license.keyword": p.license } });
  if (p.publisher) filter.push({ term: { "publisher.ipa": p.publisher.toLowerCase() } });
  if (p.pnrrMeasure) filter.push(featureTag(`PNRR/Misura/${p.pnrrMeasure}`));
  if (p.pnrrTarget) filter.push(featureTag(`PNRR/Beneficiari/${p.pnrrTarget}`));
  if (p.reuse === true) filter.push({ bool: { should: REUSE_CLAUSES, minimum_should_match: 1 } });
  if (p.reuse === false) mustNot.push(...REUSE_CLAUSES);

  return {
    from: (p.page - 1) * p.size,
    size: p.size,
    track_total_hits: true,
    query: { bool: { filter, must, must_not: mustNot } },
    // Senza testo: i più recenti per primi
    sort: p.q ? ["_score"] : [{ "publiccode.releaseDate": { order: "desc", missing: "_last" } }],
    aggs: {
      scopes: { terms: { field: "publiccode.intendedAudience.scope", size: 50 } },
      categories: { terms: { field: "publiccode.categories", size: 200 } },
      developmentStatuses: { terms: { field: "publiccode.developmentStatus", size: 10 } },
    },
  };
}

interface OsResponse {
  hits: { total: { value: number }; hits: { _id: string; _score: number | null; _source: Source }[] };
  aggregations: Record<string, { buckets: { key: string; doc_count: number }[] }>;
}

const facets = (agg: OsResponse["aggregations"], name: string): SearchFacetDto[] =>
  (agg?.[name]?.buckets ?? []).map((b) => ({ value: b.key, count: b.doc_count }));

export async function searchSoftware(p: SearchParams): Promise<SearchResultDto> {
  let res: Response;
  try {
    res = await opensearchFetch(`/${searchAlias()}/_search`, false, { method: "POST", body: buildQuery(p) });
  } catch (e) {
    throw new HttpError(503, "Service Unavailable", `Ricerca non disponibile: ${(e as Error).message}`);
  }
  if (!res.ok) throw new HttpError(503, "Service Unavailable", `Ricerca non disponibile (OpenSearch HTTP ${res.status})`);
  const body = (await res.json()) as OsResponse;
  return {
    data: body.hits.hits.map((h) => toHit(h._id, h._source, p.q ? h._score : null)),
    meta: { total: body.hits.total.value, page: p.page, size: p.size },
    facets: {
      scopes: facets(body.aggregations, "scopes"),
      categories: facets(body.aggregations, "categories"),
      developmentStatuses: facets(body.aggregations, "developmentStatuses"),
    },
  };
}
