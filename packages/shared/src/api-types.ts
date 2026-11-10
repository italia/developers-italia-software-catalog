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
