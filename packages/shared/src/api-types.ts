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
