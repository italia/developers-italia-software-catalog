import { readFileSync } from "node:fs";

// Client minimo per l'API REST di OpenSearch.
export class OpenSearch {
  /** CA per HTTPS con certificati non pubblici (es. i certificati demo di compose.yaml) */
  private readonly tls?: { ca: string };

  constructor(
    private readonly url: string,
    private readonly user?: string,
    private readonly pass?: string,
    caFile?: string,
  ) {
    if (caFile) this.tls = { ca: readFileSync(caFile, "utf8") };
  }

  async request<T = unknown>(method: string, path: string, body?: unknown, ndjson = false): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": ndjson ? "application/x-ndjson" : "application/json" };
    if (this.user) headers.Authorization = `Basic ${btoa(`${this.user}:${this.pass ?? ""}`)}`;

    const res = await fetch(`${this.url.replace(/\/$/, "")}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : ndjson ? (body as string) : JSON.stringify(body),
      ...(this.tls && { tls: this.tls }), // opzione di fetch di Bun
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 500)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  /**
   * Indici a cui punta l'alias (vuoto se l'alias non esiste). La richiesta è limitata agli
   * indici `<alias>*`: senza indice OpenSearch la valuterebbe su tutti gli indici e con la
   * sicurezza attiva l'utente dell'indexer non ha (giustamente) quel permesso.
   */
  async aliasTargets(alias: string): Promise<string[]> {
    try {
      return Object.keys(await this.request<Record<string, unknown>>("GET", `/${alias}*/_alias/${alias}`));
    } catch (e) {
      if ((e as Error).message.includes("HTTP 404")) return [];
      throw e;
    }
  }

  /** Esiste un indice (non un alias) con questo nome? */
  async isConcreteIndex(name: string): Promise<boolean> {
    try {
      const res = await this.request<Record<string, unknown>>("GET", `/${name}`);
      return Object.keys(res).includes(name);
    } catch (e) {
      if ((e as Error).message.includes("HTTP 404")) return false;
      throw e;
    }
  }

  async indicesMatching(pattern: string): Promise<string[]> {
    const rows = await this.request<{ index: string }[]>("GET", `/_cat/indices/${pattern}?format=json`).catch(() => []);
    return rows.map((r) => r.index).sort();
  }
}
