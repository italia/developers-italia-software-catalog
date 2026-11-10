import type { Administration, SearchFilters, CatalogueItem, SoftwareDetail } from '../types';
import {
  ALL_CATALOGUE,
  SOFTWARE_OPEN,
  SOFTWARE_REUSE,
  ALPHABETICAL,
  VITALITY,
  RELEASE_DATE,
  LANG,
  ES_INDEX,
} from '../utils/constants';
import { mockIpaEntities, mockResponse } from './mockData';

const ES_URL = import.meta.env.VITE_ELASTICSEARCH_URL as string;
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
const preference = Date.now();

async function executeQuery(query: object, sort: object, from: number, size: number) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300));
    const allHits = mockResponse.hits.hits as Array<{ _id: string; _source: Record<string, unknown> }>;
    const sliced = allHits.slice(from, from + size);
    return {
      hits: sliced,
      total: allHits.length,
    };
  }

  const response = await fetch(`${ES_URL}/${ES_INDEX}/_search?preference=${preference}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, sort, from, size }),
  });

  if (!response.ok) {
    throw new Error(`Elasticsearch error: ${response.status}`);
  }

  const data = await response.json();
  return {
    hits: data.hits.hits as Array<{ _id: string; _source: Record<string, unknown> }>,
    total: data.hits.total.value as number,
  };
}

function buildFilterClauses(filters: SearchFilters) {
  const clauses: object[] = [];

  for (const audience of filters.intendedAudiences) {
    clauses.push({ term: { 'publiccode.intendedAudience.scope': audience } });
  }
  for (const cat of filters.categories) {
    clauses.push({ term: { 'publiccode.categories.keyword': cat } });
  }
  // Un software ha un solo stato di sviluppo: più stati selezionati vanno in OR (con un
  // term per stato, come nel vecchio sito, "stabile + beta" non trovava nulla).
  if (filters.developmentStatuses.length > 0) {
    clauses.push({ terms: { 'publiccode.developmentStatus': filters.developmentStatuses } });
  }

  if (filters.pnrrTargets && filters.pnrrTargets !== 'Tutti') {
    clauses.push({
      term: {
        [`publiccode.description.${LANG}.features.keyword`]: `PNRR/Beneficiari/${filters.pnrrTargets}`,
      },
    });
  }
  if (filters.pnrrMeasures && filters.pnrrMeasures !== 'Tutte') {
    clauses.push({
      term: {
        [`publiccode.description.${LANG}.features.keyword`]: `PNRR/Misura/${filters.pnrrMeasures}`,
      },
    });
  }
  if (filters.pnrr) {
    clauses.push({
      term: { [`publiccode.description.${LANG}.features`]: 'pnrr' },
    });
  }

  return clauses;
}

function buildSort(sortBy: string) {
  if (sortBy === ALPHABETICAL) {
    return {
      _script: {
        type: 'string',
        order: 'asc',
        script: {
          lang: 'painless',
          source: `
            if (
                doc['publiccode.description.${LANG}.localisedName.keyword'].size() != 0
                && !doc['publiccode.description.${LANG}.localisedName.keyword'].empty
               ) {
              return doc['publiccode.description.${LANG}.localisedName.keyword'].value
            }
            else {
              return doc['publiccode.name.keyword'].value
            }
          `,
        },
      },
    };
  }
  if (sortBy === VITALITY) {
    return [{ vitalityScore: { order: 'desc' } }];
  }
  if (sortBy === RELEASE_DATE) {
    return [{ 'publiccode.releaseDate': { order: 'desc' } }];
  }
  return [];
}

function buildSearchFields() {
  return [
    'publiccode.name^3',
    `publiccode.description.${LANG}.localizedName^3`,
    `publiccode.description.${LANG}.shortDescription^2`,
    `publiccode.description.${LANG}.longDescription`,
    `publiccode.description.${LANG}.features`,
  ];
}

export async function searchCatalogue(
  type: string,
  searchValue: string,
  filters: SearchFilters,
  sortBy: string,
  from: number,
  size: number
): Promise<{ items: CatalogueItem[]; total: number }> {
  const must: object[] = [{ term: { type: 'software' } }];
  const should: object[] = [];
  const must_not: object[] = [];

  if (searchValue) {
    must.push({
      multi_match: {
        query: searchValue,
        type: 'phrase_prefix',
        fields: buildSearchFields(),
      },
    });
  }

  if (type === SOFTWARE_REUSE) {
    should.push(
      { exists: { field: 'publiccode.organisation.uri' } },
      { exists: { field: 'publiccode.IT.riuso.codiceIPA' } },
      { exists: { field: 'publiccode.it.riuso.codiceIPA' } }
    );
  }

  if (type === SOFTWARE_OPEN) {
    must_not.push(
      { exists: { field: 'publiccode.organisation.uri' } },
      { exists: { field: 'publiccode.IT.riuso.codiceIPA' } },
      { exists: { field: 'publiccode.it.riuso.codiceIPA' } },
      { match: { 'publiccode.indendedAudience.unsupportedCountries': 'IT' } }
    );
  }

  const query = {
    bool: {
      filter: buildFilterClauses(filters),
      must: [{ bool: { should } }, ...must],
      must_not,
      should,
    },
  };

  const { hits, total } = await executeQuery(query, buildSort(sortBy), from, size);
  return { items: hits.map(mapHitToItem), total };
}

export async function fetchSoftwareBySlug(slug: string): Promise<SoftwareDetail | null> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    const hit = mockResponse.hits.hits.find(
      (h) => h._source.slug.toLowerCase() === slug.toLowerCase()
    );
    if (!hit) return null;
    return { id: hit._id, ...hit._source } as unknown as SoftwareDetail;
  }

  const query = {
    bool: {
      must: [
        { term: { type: 'software' } },
        { term: { 'slug': slug } },
      ],
    },
  };

  const { hits } = await executeQuery(query, [], 0, 1);
  if (hits.length === 0) return null;

  return { id: hits[0]._id, ...hits[0]._source } as unknown as SoftwareDetail;
}

function getDescriptionField(source: Record<string, unknown>) {
  const publiccode = source.publiccode as Record<string, unknown> | undefined;
  if (!publiccode?.description) return null;

  const descriptions = publiccode.description as Record<string, Record<string, unknown>>;
  const keys = Object.keys(descriptions);
  if (keys.length === 0) return null;

  if (descriptions[LANG]) return descriptions[LANG];

  const baseLang = LANG.split('-')[0];
  const variant = keys.find((k) => k.startsWith(baseLang + '-'));
  if (variant) return descriptions[variant];

  if (descriptions['en']) return descriptions['en'];
  if (descriptions['it']) return descriptions['it'];

  return descriptions[keys[0]];
}

function cropString(value: unknown): string {
  if (!value || typeof value !== 'string') return '';
  return value.length >= 100 ? value.substring(0, 100) + '...' : value;
}

function getSoftwareCategory(source: Record<string, unknown>): string {
  const pc = source.publiccode as Record<string, unknown> | undefined;
  const ipaCode =
    (pc?.organisation as Record<string, unknown>)?.uri ||
    (pc?.IT as Record<string, unknown>)?.riuso &&
    ((pc?.IT as Record<string, unknown>)?.riuso as Record<string, unknown>)?.codiceIPA ||
    (pc?.it as Record<string, unknown>)?.riuso &&
    ((pc?.it as Record<string, unknown>)?.riuso as Record<string, unknown>)?.codiceIPA;
  return ipaCode ? SOFTWARE_REUSE : SOFTWARE_OPEN;
}

function mapHitToItem(hit: { _id: string; _source: Record<string, unknown> }): CatalogueItem {
  const source = hit._source;
  const desc = getDescriptionField(source);
  const pc = source.publiccode as Record<string, unknown>;

  const category = getSoftwareCategory(source);
  const name = (desc?.localisedName as string) ?? (pc?.name as string) ?? '';
  const description = desc?.shortDescription ? cropString(desc.shortDescription) : '';
  const icon = category === SOFTWARE_REUSE ? 'it-software' : 'it-open-source';
  const fallback =
    category === SOFTWARE_REUSE
      ? '/assets/images/cover_softwareriuso.png'
      : '/assets/images/cover_software_opensource.png';

  let logo = (desc?.screenshots as string[])?.[0] ?? (pc?.logo as string) ?? fallback;
  if (/github/.test(logo) && /\.svg$/.test(logo)) {
    logo += '?sanitize=true';
  }

  const slug = (source.slug as string)?.toLowerCase() ?? '';
  const url = `/software/${slug}`;

  return { id: hit._id, category, description, icon, logo, fallback, name, url };
}

// ─── amministrazioni ────────────────────────────────────────────────────────
// Una pagina per amministrazione (/pa/:ipa) con i software che ha pubblicato: quelli che il
// crawler ha trovato nei suoi code hosting (campo publisher.ipa, scritto dall'indexer dalla
// relazione software → publisher dell'API v2). Gli stessi della scheda in dashboard.

async function rawSearch<T>(body: object): Promise<T> {
  const response = await fetch(`${ES_URL}/${ES_INDEX}/_search?preference=${preference}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Elasticsearch error: ${response.status}`);
  return (await response.json()) as T;
}

/** Codice IPA dichiarato nel publiccode.yml (solo per i dati finti, che non hanno publisher). */
function declaredIpa(source: Record<string, unknown>): string | null {
  const pc = source.publiccode as SoftwareDetail['publiccode'];
  const uri = pc?.organisation?.uri;
  if (uri?.startsWith('urn:x-italian-pa:')) return uri.slice('urn:x-italian-pa:'.length).toLowerCase();
  return (pc?.IT?.riuso?.codiceIPA ?? pc?.it?.riuso?.codiceIPA)?.toLowerCase() ?? null;
}

function mockPublisherIpa(source: Record<string, unknown>): string | null {
  return ((source.publisher as SoftwareDetail['publisher'])?.ipa ?? declaredIpa(source))?.toLowerCase() ?? null;
}

type AdminSource = { 'it-riuso-codiceIPA': string; 'it-riuso-codiceIPA-label': string };

/** Tutte le amministrazioni con il numero di software pubblicati, in ordine di nome. */
export async function searchAdministrations(): Promise<Administration[]> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    const counts = new Map<string, number>();
    for (const h of mockResponse.hits.hits) {
      const ipa = mockPublisherIpa(h._source as Record<string, unknown>);
      if (ipa) counts.set(ipa, (counts.get(ipa) ?? 0) + 1);
    }
    return [...counts].map(([ipa, softwareCount]) => ({ ipa, name: mockIpaEntities[ipa]?.description ?? ipa.toUpperCase(), softwareCount }));
  }

  const [admins, counts] = await Promise.all([
    rawSearch<{ hits: { hits: { _source: AdminSource }[] } }>({
      size: 2000,
      query: { term: { type: 'administration' } },
      sort: [{ 'it-riuso-codiceIPA-label.keyword': 'asc' }],
    }),
    rawSearch<{ aggregations: { byIpa: { buckets: { key: string; doc_count: number }[] } } }>({
      size: 0,
      query: { term: { type: 'software' } },
      aggs: { byIpa: { terms: { field: 'publisher.ipa', size: 2000 } } },
    }),
  ]);
  const count = new Map(counts.aggregations.byIpa.buckets.map((b) => [b.key, b.doc_count]));
  return admins.hits.hits.map(({ _source: a }) => ({
    ipa: a['it-riuso-codiceIPA'],
    name: a['it-riuso-codiceIPA-label'],
    softwareCount: count.get(a['it-riuso-codiceIPA']) ?? 0,
  }));
}

/** Nome dell'amministrazione dal suo documento nell'indice; null se non è nel catalogo. */
export async function fetchAdministration(ipa: string): Promise<{ ipa: string; name: string } | null> {
  if (USE_MOCK) {
    const found = (await searchAdministrations()).find((a) => a.ipa === ipa);
    return found ? { ipa: found.ipa, name: found.name } : null;
  }
  const res = await rawSearch<{ hits: { hits: { _source: AdminSource }[] } }>({
    size: 1,
    query: { bool: { filter: [{ term: { type: 'administration' } }, { term: { 'it-riuso-codiceIPA': ipa } }] } },
  });
  const a = res.hits.hits[0]?._source;
  return a ? { ipa: a['it-riuso-codiceIPA'], name: a['it-riuso-codiceIPA-label'] } : null;
}

/** Software pubblicati da un'amministrazione, in ordine alfabetico. */
export async function searchSoftwareByAdministration(
  ipa: string,
  from: number,
  size: number
): Promise<{ items: CatalogueItem[]; total: number }> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 200));
    const hits = mockResponse.hits.hits.filter((h) => mockPublisherIpa(h._source as Record<string, unknown>) === ipa) as Array<{
      _id: string;
      _source: Record<string, unknown>;
    }>;
    return { items: hits.slice(from, from + size).map(mapHitToItem), total: hits.length };
  }
  const query = { bool: { filter: [{ term: { type: 'software' } }, { term: { 'publisher.ipa': ipa } }] } };
  const { hits, total } = await executeQuery(query, buildSort(ALPHABETICAL), from, size);
  return { items: hits.map(mapHitToItem), total };
}
