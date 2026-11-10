import type { PrismaClient } from "@sw-catalog/db";
import type { QualityItemDto, StatsDto, StatsInterval, StatsMatrix } from "@sw-catalog/shared";
import { parse } from "yaml";

// Statistiche del cruscotto della dashboard. Totali e andamenti vengono dal database
// con SQL aggregato; la composizione del catalogo dai publiccode.yml dei software attivi
// (dal database e non da OpenSearch: è la fonte autorevole e non dipende dall'ultimo giro
// dell'indexer). Il risultato resta in cache qualche minuto.

const TZ = "Europe/Rome";
const DAY = 86_400_000;
const CACHE_MS = 5 * 60_000;

const cache = new Map<StatsInterval, { at: number; value: StatsDto }>();
export const resetStatsCache = () => cache.clear();

export async function getStats(db: PrismaClient, interval: StatsInterval, refresh = false): Promise<StatsDto> {
  const hit = cache.get(interval);
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const [totals, trends, catalog] = await Promise.all([totalsOf(db), trendsOf(db, interval), catalogOf(db)]);
  const value: StatsDto = {
    generatedAt: new Date().toISOString(),
    totals,
    trends,
    composition: catalog.composition,
    quality: catalog.quality,
  };
  cache.set(interval, { at: Date.now(), value });
  return value;
}

// ---------------------------------------------------------------------------
// Totali
// ---------------------------------------------------------------------------

async function totalsOf(db: PrismaClient): Promise<StatsDto["totals"]> {
  const now = Date.now();
  const d30 = new Date(now - 30 * DAY);
  const d60 = new Date(now - 60 * DAY);
  const [
    software,
    softwareActive,
    publishers,
    publishersActive,
    paInIpa,
    inIpa,
    groups,
    repositories,
    onboarding,
    thirdParty,
    newSw,
    prevSw,
    newPub,
    prevPub,
    updated,
  ] = await Promise.all([
    db.software.count(),
    db.software.count({ where: { active: true } }),
    db.publisher.count(),
    db.publisher.count({ where: { active: true } }),
    db.ipaEntity.count({ where: { category: "Pubbliche Amministrazioni" } }),
    db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM publishers p
      JOIN ipa_entities e ON lower(e.ipa) = lower(p.alternative_id)
      WHERE p.active`,
    db.codeHosting.count({ where: { group: true } }),
    db.codeHosting.count({ where: { group: false } }),
    db.onboardingRequest.count({ where: { status: "PENDING" } }),
    db.thirdPartyRequest.count({ where: { status: "PENDING" } }),
    db.software.count({ where: { createdAt: { gte: d30 } } }),
    db.software.count({ where: { createdAt: { gte: d60, lt: d30 } } }),
    db.publisher.count({ where: { createdAt: { gte: d30 } } }),
    db.publisher.count({ where: { createdAt: { gte: d60, lt: d30 } } }),
    db.software.count({ where: { active: true, updatedAt: { gte: d30 } } }),
  ]);
  return {
    software: { total: software, active: softwareActive },
    publishers: { total: publishers, active: publishersActive },
    paInIpa,
    publishersInIpa: inIpa[0]?.n ?? 0,
    codeHostings: { groups, repositories },
    pendingRequests: { onboarding, thirdParty },
    newSoftware: { current: newSw, previous: prevSw },
    newPublishers: { current: newPub, previous: prevPub },
    updatedSoftware30d: updated,
  };
}

// ---------------------------------------------------------------------------
// Andamenti
// ---------------------------------------------------------------------------

/** Periodi mostrati; per l'anno tutta la storia, dal primo software. */
const PERIODS: Record<StatsInterval, number | null> = { week: 26, month: 24, year: null };

interface TrendRow {
  p: Date;
  software: number;
  publishers: number;
  onboarding: number;
  third_party: number;
  software_before: number;
  publishers_before: number;
}

const labelFormats: Record<StatsInterval, Intl.DateTimeFormat> = {
  // I periodi sono timestamp senza fuso (già in ora italiana): si formattano in UTC.
  week: new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }),
  month: new Intl.DateTimeFormat("it-IT", { month: "short", year: "numeric", timeZone: "UTC" }),
  year: new Intl.DateTimeFormat("it-IT", { year: "numeric", timeZone: "UTC" }),
};

export const periodLabel = (p: Date, interval: StatsInterval) => labelFormats[interval].format(p);

async function trendsOf(db: PrismaClient, interval: StatsInterval): Promise<StatsDto["trends"]> {
  const periods = PERIODS[interval];
  const step = `1 ${interval}`;
  const rows = await db.$queryRaw<TrendRow[]>`
    WITH bounds AS (
      SELECT date_trunc(${interval}, now() AT TIME ZONE ${TZ}) AS last,
             CASE WHEN ${periods}::int IS NULL
               THEN date_trunc(${interval}, coalesce((SELECT min(created_at) FROM software), now()) AT TIME ZONE ${TZ})
               ELSE date_trunc(${interval}, now() AT TIME ZONE ${TZ}) - (${periods}::int - 1) * ${step}::interval
             END AS first
    ),
    series AS (SELECT generate_series(first, last, ${step}::interval) AS p FROM bounds),
    sw AS (SELECT date_trunc(${interval}, created_at AT TIME ZONE ${TZ}) AS p, count(*) AS n FROM software GROUP BY 1),
    pub AS (SELECT date_trunc(${interval}, created_at AT TIME ZONE ${TZ}) AS p, count(*) AS n FROM publishers GROUP BY 1),
    onb AS (SELECT date_trunc(${interval}, created_at AT TIME ZONE ${TZ}) AS p, count(*) AS n FROM onboarding_requests GROUP BY 1),
    tpr AS (SELECT date_trunc(${interval}, created_at AT TIME ZONE ${TZ}) AS p, count(*) AS n FROM third_party_requests GROUP BY 1)
    SELECT s.p,
           coalesce(sw.n, 0)::int AS software,
           coalesce(pub.n, 0)::int AS publishers,
           coalesce(onb.n, 0)::int AS onboarding,
           coalesce(tpr.n, 0)::int AS third_party,
           (SELECT count(*) FROM software WHERE created_at AT TIME ZONE ${TZ} < (SELECT first FROM bounds))::int AS software_before,
           (SELECT count(*) FROM publishers WHERE created_at AT TIME ZONE ${TZ} < (SELECT first FROM bounds))::int AS publishers_before
    FROM series s
    LEFT JOIN sw ON sw.p = s.p
    LEFT JOIN pub ON pub.p = s.p
    LEFT JOIN onb ON onb.p = s.p
    LEFT JOIN tpr ON tpr.p = s.p
    ORDER BY s.p`;

  const created: StatsMatrix = [["Periodo", "Software", "Amministrazioni"]];
  const cumulative: StatsMatrix = [["Periodo", "Software", "Amministrazioni"]];
  const requests: StatsMatrix = [["Periodo", "Onboarding", "Terze parti"]];
  let sw = rows[0]?.software_before ?? 0;
  let pub = rows[0]?.publishers_before ?? 0;
  for (const r of rows) {
    const label = periodLabel(r.p, interval);
    sw += r.software;
    pub += r.publishers;
    created.push([label, r.software, r.publishers]);
    cumulative.push([label, sw, pub]);
    requests.push([label, r.onboarding, r.third_party]);
  }
  return { interval, created, cumulative, requests };
}

// ---------------------------------------------------------------------------
// Composizione e qualità, dai publiccode.yml
// ---------------------------------------------------------------------------

export interface PubliccodeFacts {
  name: string | null;
  developmentStatus: string | null;
  softwareType: string | null;
  license: string | null;
  maintenance: string | null;
  platforms: string[];
  categories: string[];
  scope: string[];
  version: string | null;
  releaseDate: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** I campi usati dal cruscotto; null se il file non è un YAML leggibile. */
export function publiccodeFacts(yml: string): PubliccodeFacts | null {
  let doc: unknown;
  try {
    doc = parse(yml);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const d = doc as Record<string, unknown>;
  const rawVersion = d.publiccodeYmlVersion;
  const version = typeof rawVersion === "number" ? String(rawVersion) : str(rawVersion);
  const release = d.releaseDate instanceof Date ? d.releaseDate.toISOString().slice(0, 10) : str(d.releaseDate);
  return {
    name: str(d.name),
    developmentStatus: str(d.developmentStatus)?.toLowerCase() ?? null,
    softwareType: str(d.softwareType)?.toLowerCase() ?? null,
    license: str(obj(d.legal).license),
    maintenance: str(obj(d.maintenance).type)?.toLowerCase() ?? null,
    platforms: strs(d.platforms).map((p) => p.toLowerCase()),
    categories: strs(d.categories).map((c) => c.toLowerCase()),
    scope: strs(obj(d.intendedAudience).scope).map((s) => s.toLowerCase()),
    // 0.2 e 0.2.0 sono la stessa versione
    version: version?.match(/^\d+\.\d+/)?.[0] ?? version,
    releaseDate: release,
  };
}

const NOT_SET = "non indicato";
const OTHER = "altro";

const LABELS: Record<string, Record<string, string>> = {
  developmentStatus: { stable: "stabile", beta: "beta", development: "in sviluppo", concept: "concept", obsolete: "obsoleto" },
  maintenance: { internal: "interna", contract: "a contratto", community: "comunità", none: "nessuna" },
};

/**
 * Conteggio → matrice ordinata, con le voci oltre `top` raccolte in "altro". Per i campi
 * con più valori (piattaforme, categorie) "altro" non avrebbe senso: un software conterebbe
 * più volte, quindi `other: false`.
 */
export function toMatrix(
  counts: Map<string, number>,
  header: [string, string],
  top: number,
  labels?: Record<string, string>,
  other = true,
) {
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = sorted.slice(0, top);
  const rest = sorted.slice(top).reduce((n, [, c]) => n + c, 0);
  const m: StatsMatrix = [header, ...shown.map(([k, n]) => [labels?.[k] ?? k, n])];
  if (rest && other) m.push([OTHER, rest]);
  return m;
}

const bump = (m: Map<string, number>, k: string | null) => m.set(k ?? NOT_SET, (m.get(k ?? NOT_SET) ?? 0) + 1);

const EXAMPLES = 5;
const STALE_YEARS = 2;

async function catalogOf(db: PrismaClient) {
  const [software, inactive, topPublishers, emptyPublishers] = await Promise.all([
    db.software.findMany({
      where: { active: true },
      select: { id: true, publiccodeYml: true, publisherId: true, url: { select: { url: true } } },
    }),
    db.software.findMany({
      where: { active: false },
      select: { id: true, publiccodeYml: true, url: { select: { url: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.$queryRaw<{ name: string; n: number }[]>`
      SELECT p.description AS name, count(*)::int AS n
      FROM software s JOIN publishers p ON p.id = s.publisher_id
      WHERE s.active
      GROUP BY p.id, p.description
      ORDER BY n DESC, p.description
      LIMIT 10`,
    db.publisher.findMany({
      where: { active: true, software: { none: { active: true } } },
      select: { id: true, description: true },
      orderBy: { description: "asc" },
    }),
  ]);

  const c = {
    developmentStatus: new Map<string, number>(),
    softwareType: new Map<string, number>(),
    license: new Map<string, number>(),
    maintenance: new Map<string, number>(),
    platforms: new Map<string, number>(),
    categories: new Map<string, number>(),
    scope: new Map<string, number>(),
    version: new Map<string, number>(),
  };
  type Example = { id: string; name: string; href: string };
  const unreadable: Example[] = [];
  const noPublisher: Example[] = [];
  const obsolete: Example[] = [];
  const stale: Example[] = [];
  const staleLimit = new Date(Date.now() - STALE_YEARS * 365 * DAY).toISOString().slice(0, 10);

  for (const s of software) {
    const facts = publiccodeFacts(s.publiccodeYml);
    const example = { id: s.id, name: facts?.name ?? s.url.url, href: `/dashboard/software/${s.id}` };
    if (!s.publisherId) noPublisher.push(example);
    if (!facts) {
      unreadable.push(example);
      continue;
    }
    bump(c.developmentStatus, facts.developmentStatus);
    bump(c.softwareType, facts.softwareType);
    bump(c.license, facts.license);
    bump(c.maintenance, facts.maintenance);
    bump(c.version, facts.version);
    for (const p of new Set(facts.platforms)) bump(c.platforms, p);
    for (const k of new Set(facts.categories)) bump(c.categories, k);
    for (const k of new Set(facts.scope)) bump(c.scope, k);
    if (facts.developmentStatus === "obsolete") obsolete.push(example);
    if (!facts.releaseDate || facts.releaseDate < staleLimit) stale.push(example);
  }

  const byName = (a: Example, b: Example) => a.name.localeCompare(b.name, "it");
  const item = (id: string, label: string, description: string, all: Example[], sort = true): QualityItemDto => ({
    id,
    label,
    description,
    count: all.length,
    examples: (sort ? [...all].sort(byName) : all).slice(0, EXAMPLES),
  });

  const quality: QualityItemDto[] = [
    item("no-publisher", "Software senza amministrazione", "Software attivi non collegati a un'amministrazione: si collegano dalla scheda del software.", noPublisher),
    item(
      "empty-publishers",
      "Amministrazioni senza software",
      "Amministrazioni attive senza nessun software attivo: code hosting sbagliati o repository senza publiccode.yml.",
      emptyPublishers.map((p) => ({ id: p.id, name: p.description, href: `/dashboard/publishers/${p.id}` })),
      false,
    ),
    item(
      "stale",
      `Non aggiornati da più di ${STALE_YEARS} anni`,
      "Software attivi con releaseDate più vecchia o assente.",
      stale,
    ),
    item("obsolete", "Dichiarati obsoleti", "Software attivi con developmentStatus obsolete.", obsolete),
    item("unreadable", "publiccode.yml illeggibile", "Il file salvato non è un YAML valido: l'indexer li esclude dal catalogo.", unreadable),
    item(
      "inactive",
      "Software disattivati",
      "Esclusi dal catalogo e ignorati dal crawler; i più recenti per primi.",
      inactive.map((s) => ({ id: s.id, name: publiccodeFacts(s.publiccodeYml)?.name ?? s.url.url, href: `/dashboard/software/${s.id}` })),
      false,
    ),
  ];

  const sw = "Software";
  return {
    composition: {
      developmentStatus: toMatrix(c.developmentStatus, ["Stato di sviluppo", sw], 6, LABELS.developmentStatus),
      softwareType: toMatrix(c.softwareType, ["Tipo", sw], 7),
      license: toMatrix(c.license, ["Licenza", sw], 8),
      maintenance: toMatrix(c.maintenance, ["Manutenzione", sw], 5, LABELS.maintenance),
      platforms: toMatrix(c.platforms, ["Piattaforma", sw], 8, undefined, false),
      categories: toMatrix(c.categories, ["Categoria", sw], 12, undefined, false),
      scope: toMatrix(c.scope, ["Ambito", sw], 12, undefined, false),
      publiccodeVersion: toMatrix(c.version, ["Versione dello standard", sw], 8),
      topPublishers: [["Amministrazione", sw], ...topPublishers.map((p) => [p.name, p.n])] as StatsMatrix,
    },
    quality,
  };
}
