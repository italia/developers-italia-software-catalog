// Forme delle risorse dell'API v2, usate dai client (crawler, indexer, dashboard).

export interface CodeHostingDto {
  url: string;
  group: boolean;
}

export interface PublisherDto {
  id: string;
  description: string;
  email: string | null;
  alternativeId: string | null;
  active: boolean;
  codeHosting: CodeHostingDto[];
  /** Numero di software con questo publisher */
  softwareCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Riepilogo del publisher dentro un software. */
export interface PublisherRefDto {
  id: string;
  description: string;
  alternativeId: string | null;
}

export interface SoftwareDto {
  id: string;
  /** Publisher nel cui code hosting il crawler ha trovato il repository (novità v2) */
  publisherId: string | null;
  publisher: PublisherRefDto | null;
  /** URL canonico del repository */
  url: string;
  aliases: string[];
  /** Nome letto dal publiccode.yml (`name`), se presente */
  name: string | null;
  publiccodeYml: string;
  active: boolean;
  vitality: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LogDto {
  id: string;
  message: string;
  entity: string | null;
  createdAt: string;
}

export interface Page<T> {
  data: T[];
  meta: { total?: number; pageSize: number; pageNumber?: number };
  links: { next: string | null; prev: string | null };
}

// --- Dashboard: utenti, richieste, IndicePA ---------------------------------

export type DashboardRole = "ADMIN" | "VIEWER";

export interface DashboardUserDto {
  id: string;
  email: string;
  role: DashboardRole;
}

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Ente dell'anagrafica IndicePA (open data, sincronizzati in `ipa_entities`). */
export interface IpaEntityDto {
  ipa: string;
  description: string;
  category: string | null;
  fiscalCode: string | null;
  website: string | null;
  pec: string[];
  /** Publisher del catalogo con questo codice IPA, se esiste */
  publisherId: string | null;
}

export interface OnboardingRequestDto {
  id: string;
  ipa: string;
  administration: string;
  contactName: string;
  contactPhone: string | null;
  pec: string | null;
  codeHostingUrl: string;
  flow: "STANDARD" | "FAST" | null;
  status: RequestStatus;
  publisherId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThirdPartyDeclarations {
  /** Il software è rilevante per la Pubblica Amministrazione */
  relevantForPa: boolean;
  /** Il software NON è di titolarità di una Pubblica Amministrazione */
  notPaOwned: boolean;
  /** Il repository contiene un publiccode.yml valido */
  validPubliccode: boolean;
}

/** Esito del controllo del publiccode.yml di un repository. */
export interface PubliccodeCheck {
  /** URL da cui è stato letto il file, null se non trovato */
  fileUrl: string | null;
  found: boolean;
  valid: boolean;
  name: string | null;
  errors: { key: string; description: string }[];
  warnings: { key: string; description: string }[];
  /** Codice IPA dichiarato (organisation.uri o IT.riuso.codiceIPA): un software di terze parti non dovrebbe averlo */
  declaredIpa: string | null;
}

export interface ThirdPartyRequestDto {
  id: string;
  source: "FORM" | "GITHUB_ISSUE";
  repositoryUrl: string;
  requesterEmail: string | null;
  requesterName: string | null;
  requesterGithub: string | null;
  githubIssueUrl: string | null;
  notes: string | null;
  declarations: ThirdPartyDeclarations;
  validation: PubliccodeCheck | null;
  status: RequestStatus;
  reviewerNote: string | null;
  softwareId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Cruscotto: esecuzioni dei job, stato degli strumenti, statistiche
// ---------------------------------------------------------------------------

export const JOB_NAMES = ["crawler", "crawler-software", "indexer", "ipa-sync"] as const;
export type JobName = (typeof JOB_NAMES)[number];
export type JobStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

export interface JobRunDto {
  id: string;
  job: JobName;
  status: JobStatus;
  trigger: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  /** Contatori del giro (repository elaborati, documenti indicizzati…) */
  stats: Record<string, number | string> | null;
  error: string | null;
}

export type HealthLevel = "ok" | "warn" | "error" | "unknown";

export interface HealthCheckDto {
  id: string;
  name: string;
  level: HealthLevel;
  /** Una riga che spiega lo stato */
  summary: string;
  details: { label: string; value: string }[];
  latencyMs: number | null;
  /** Per i job: l'ultima esecuzione */
  lastRun: JobRunDto | null;
}

export interface HealthDto {
  /** Il peggiore tra i controlli (unknown conta come warn) */
  level: HealthLevel;
  checkedAt: string;
  checks: HealthCheckDto[];
}

/** Matrice per i grafici: prima riga le intestazioni, poi una riga per categoria o periodo. */
export type StatsMatrix = (string | number)[][];
export type StatsInterval = "week" | "month" | "year";

export interface QualityItemDto {
  id: string;
  label: string;
  description: string;
  count: number;
  examples: { id: string; name: string; href: string }[];
}

export interface StatsDto {
  generatedAt: string;
  totals: {
    software: { total: number; active: number };
    publishers: { total: number; active: number };
    /** Enti con tipologia "Pubbliche Amministrazioni" in IndicePA */
    paInIpa: number;
    /** Publisher attivi il cui codice IPA è in IndicePA */
    publishersInIpa: number;
    codeHostings: { groups: number; repositories: number };
    pendingRequests: { onboarding: number; thirdParty: number };
    /** Ultimi 30 giorni e i 30 precedenti, per la variazione */
    newSoftware: { current: number; previous: number };
    newPublishers: { current: number; previous: number };
    updatedSoftware30d: number;
  };
  trends: {
    interval: StatsInterval;
    /** [periodo, software, amministrazioni] creati nel periodo */
    created: StatsMatrix;
    /** [periodo, software, amministrazioni] totali alla fine del periodo */
    cumulative: StatsMatrix;
    /** [periodo, onboarding, terze parti] richieste ricevute */
    requests: StatsMatrix;
  };
  composition: {
    developmentStatus: StatsMatrix;
    softwareType: StatsMatrix;
    license: StatsMatrix;
    maintenance: StatsMatrix;
    platforms: StatsMatrix;
    categories: StatsMatrix;
    scope: StatsMatrix;
    publiccodeVersion: StatsMatrix;
    topPublishers: StatsMatrix;
  };
  quality: QualityItemDto[];
}

// ---------------------------------------------------------------------------
// Liste editoriali (D13): misure e beneficiari PNRR
// ---------------------------------------------------------------------------

export interface VocabularyTermDto {
  id: string;
  /** Valore stabile usato da chi legge la lista */
  key: string;
  /** Senza etichetta si mostra la chiave */
  labelIt: string | null;
  labelEn: string | null;
  position: number;
  active: boolean;
  updatedAt: string;
}

export interface VocabularyDto {
  id: string;
  name: string;
  description: string | null;
  termCount: number;
  activeTermCount: number;
  updatedAt: string;
}

export interface VocabularyDetailDto extends VocabularyDto {
  /** In ordine; le voci disattivate solo con ?all=true (utenti della dashboard) */
  terms: VocabularyTermDto[];
}

// ---------------------------------------------------------------------------
// Validazione del publiccode.yml per versione (dashboard, scheda del software)
// ---------------------------------------------------------------------------

export interface PubliccodeIssueDto {
  key: string;
  description: string;
}

export interface PubliccodeDeprecationDto {
  id: string;
  key: string;
  /** Versione dello standard che l'ha deprecato */
  since: string;
  /** Messaggio in italiano */
  message: string;
  /** upgrade() lo corregge; lossy: perdendo informazioni */
  fixable: boolean;
  lossy: boolean;
}

export interface PubliccodeVersionOptionDto {
  version: string;
  /** Il parser (e quindi il crawler) accetta file con questa versione */
  supportedByParser: boolean;
}

export interface PubliccodeValidationDto {
  /** Il YAML non è leggibile: errors spiega perché, il resto è vuoto */
  readable: boolean;
  declaredVersion: string | null;
  checkedVersion: string;
  /** "v0": regole del parser, uguali per ogni 0.x; altrimenti lo schema della versione */
  schema: string;
  strict: boolean;
  valid: boolean;
  errors: PubliccodeIssueDto[];
  warnings: PubliccodeIssueDto[];
  deprecations: PubliccodeDeprecationDto[];
  /** Versioni selezionabili, dalla più recente */
  versions: PubliccodeVersionOptionDto[];
  /** Ultima versione dello standard che la libreria valida e a cui aggiorna (0.8.0) */
  latestSupported: string;
  /** Ultima versione accettata dal parser Go e dall'editor (0.7.0) */
  parserLatest: string;
}

export interface PubliccodeUpgradeDto {
  from: string | null;
  to: string;
  /** Il publiccode.yml aggiornato */
  yaml: string;
  /** Deprecazioni corrette */
  applied: PubliccodeDeprecationDto[];
  /** Rimaste: senza correzione automatica, o con perdita di informazioni */
  remaining: PubliccodeDeprecationDto[];
  /** Validazione strict del file aggiornato contro `to` */
  validation: Pick<PubliccodeValidationDto, "valid" | "errors" | "warnings">;
}

// ---------------------------------------------------------------------------
// Ricerca nel catalogo (GET /v2/search): la usano il server MCP e altri client
// ---------------------------------------------------------------------------

export interface SearchHitDto {
  /** Id del software nell'API v2 (anche lo slug del catalogo) */
  id: string;
  name: string;
  shortDescription: string | null;
  /** Lingua della descrizione restituita (it, se c'è) */
  descriptionLanguage: string | null;
  /** Amministrazione nel cui code hosting il software è pubblicato */
  publisher: { name: string; ipa: string | null } | null;
  /** Software di titolarità di una PA (organisation.uri urn:x-italian-pa:… o IT.riuso.codiceIPA) */
  reuse: boolean;
  /** Codice IPA dichiarato nel publiccode.yml */
  declaredIpa: string | null;
  scopes: string[];
  categories: string[];
  developmentStatus: string | null;
  softwareType: string | null;
  maintenanceType: string | null;
  license: string | null;
  platforms: string[];
  releaseDate: string | null;
  /** Repository */
  url: string | null;
  landingURL: string | null;
  /** Scheda nel catalogo pubblico, se CATALOG_PUBLIC_URL è impostato */
  catalogUrl: string | null;
  /** Punteggio di pertinenza di OpenSearch (solo con una ricerca testuale) */
  score: number | null;
}

export interface SearchFacetDto {
  value: string;
  count: number;
}

export interface SearchResultDto {
  data: SearchHitDto[];
  meta: { total: number; page: number; size: number };
  facets: {
    scopes: SearchFacetDto[];
    categories: SearchFacetDto[];
    developmentStatuses: SearchFacetDto[];
  };
}
