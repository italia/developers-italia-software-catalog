export type Driver = "github" | "gitlab" | "bitbucket" | "gitea";

/** Un punto di code hosting: un'org/gruppo (group) o un singolo repository. */
export interface Source {
  url: string;
  driver: Driver | "";
  group: boolean;
}

export interface Publisher {
  id: string;
  /**
   * "publisher": un publisher dell'API, il suo id finisce in software.publisher_id.
   * "catalog": un catalogo trattato come publisher (come ScanCatalog del Go): nessun publisher_id.
   */
  kind: "publisher" | "catalog";
  alternativeId: string | null;
  name: string;
  sources: Source[];
}

/** Un repository con un (possibile) publiccode.yml da elaborare. */
export interface Repository {
  /** owner/repo (o path con namespace su GitLab) */
  name: string;
  /** URL con cui il repository è stato trovato */
  url: string;
  /** URL canonico restituito dal code hosting (di solito l'URL di clone) */
  canonicalUrl: string;
  fileRawUrl: string;
  branch: string;
  publisher: Publisher;
  catalogId?: string;
  publishersNamespace?: string;
  headers?: Record<string, string>;
}

/** Riceve i repository trovati dagli scanner. */
export type Emit = (repo: Repository) => void | Promise<void>;

export interface Scanner {
  /** Tutti i repository di un'org/gruppo */
  list(url: string, publisher: Publisher, emit: Emit): Promise<void>;
  /** Un singolo repository */
  scan(url: string, publisher: Publisher, emit: Emit): Promise<void>;
}

export class PubliccodeNotFoundError extends Error {
  constructor(where: string) {
    super(`publiccode.yml not found in ${where}`);
  }
}
