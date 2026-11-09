// Porting di crawler/crawler.go: trova i repository, valida i publiccode.yml e aggiorna l'API.
import { validateForCatalog } from "@sw-catalog/publiccode-validator";
import type { SoftwareDto } from "@sw-catalog/shared";
import { api } from "./api.ts";
import { config } from "./config.ts";
import { detectDriver } from "./drivers.ts";
import { fetchWithRetry } from "./http.ts";
import { scanners } from "./scanners/index.ts";
import { PubliccodeNotFoundError, type Publisher, type Repository, type Source } from "./types.ts";

export interface Stats {
  processed: number;
  good: number;
  bad: number;
  notFound: number;
  fetchFailed: number;
  created: number;
  updated: number;
  skipped: number;
  upsertFailures: number;
}

export class Crawler {
  readonly stats: Stats = {
    processed: 0, good: 0, bad: 0, notFound: 0, fetchFailed: 0,
    created: 0, updated: 0, skipped: 0, upsertFailures: 0,
  };
  private readonly seen = new Set<string>();
  private readonly queue: Repository[] = [];
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly dryRun = false) {}

  /** Scandisce le sorgenti di un publisher e mette in coda i repository trovati. */
  async scanPublisher(publisher: Publisher) {
    console.log(`publisher: ${publisher.name}`);
    for (const source of publisher.sources) {
      try {
        await this.scanSource(source, publisher);
      } catch (e) {
        const level = e instanceof PubliccodeNotFoundError ? "warn" : "error";
        console[level](`[${source.url}] ${(e as Error).message}`);
      }
    }
  }

  private async scanSource(source: Source, publisher: Publisher) {
    const driver = source.driver || (await detectDriver(source.url));
    if (!driver) throw new Error(`${publisher.name}: code hosting non riconosciuto per ${source.url}`);
    const scanner = scanners[driver];
    const emit = (repo: Repository) => this.enqueue(repo);
    await (source.group ? scanner.list(source.url, publisher, emit) : scanner.scan(source.url, publisher, emit));
  }

  /** Coda con al più `config.concurrency` repository elaborati insieme. */
  private async enqueue(repo: Repository) {
    const key = repo.canonicalUrl.toLowerCase();
    if (this.seen.has(key)) return; // lo stesso repository da due sorgenti
    this.seen.add(key);

    while (this.running.size >= config.concurrency) await Promise.race(this.running);
    const task = this.processRepo(repo).finally(() => this.running.delete(task));
    this.running.add(task);
  }

  async drain() {
    await Promise.all(this.running);
  }

  /** Porting di ProcessRepo. */
  async processRepo(repo: Repository) {
    const log: string[] = [];
    let software: SoftwareDto | null = null;
    this.stats.processed++;

    try {
      // Prima con l'URL trovato (come il Go), poi con quello canonico: un software salvato
      // con l'URL di clone (".git") e senza alias altrimenti non verrebbe trovato, e il
      // tentativo di crearlo fallirebbe con un conflitto.
      software = (await api.softwareByUrl(repo.url)) ?? (repo.canonicalUrl !== repo.url ? await api.softwareByUrl(repo.canonicalUrl) : null);

      // Non riattivare un software disattivato a mano: si riconosce da created_at ≠ updated_at
      // (quelli creati inattivi dal crawler hanno le due date uguali).
      if (software && !software.active && software.createdAt !== software.updatedAt) {
        log.push(`[${repo.name}] software ${software.id} disattivato manualmente: non lo aggiorno`);
        this.stats.skipped++;
        return;
      }

      let res: Response;
      try {
        res = await fetchWithRetry(repo.fileRawUrl, { headers: repo.headers });
      } catch (e) {
        this.stats.fetchFailed++;
        log.push(`[${repo.name}] impossibile scaricare publiccode.yml: ${(e as Error).message}`);
        return;
      }
      if (res.status === 404) {
        this.stats.notFound++;
        log.push(`[${repo.name}] publiccode.yml non trovato (404)`);
        return;
      }
      if (!res.ok) {
        this.stats.fetchFailed++;
        log.push(`[${repo.name}] impossibile scaricare publiccode.yml (HTTP ${res.status})`);
        return;
      }
      const yaml = await res.text();
      log.push(`[${repo.canonicalUrl}] publiccode.yml trovato in ${repo.fileRawUrl}`);

      const isMainPublisher = Boolean(config.mainPublisherId) && repo.publisher.id === config.mainPublisherId;
      const result = validateForCatalog(yaml, {
        fileRawUrl: repo.fileRawUrl,
        publisherAlternativeId: repo.publisher.alternativeId,
        publishersNamespace: repo.publishersNamespace ?? config.publishersNamespace,
        isMainPublisher,
      });

      if (result.valid) {
        this.stats.good++;
        log.push(`[${repo.name}] publiccode.yml VALIDO`);
      } else {
        this.stats.bad++;
        const errors = result.problems.filter((p) => p.level === "error");
        log.push(`[${repo.name}] publiccode.yml NON VALIDO:\n${errors.map((e) => `  - ${e.key}: ${e.message}`).join("\n")}`);
      }
      for (const w of result.problems.filter((p) => p.level === "warning")) log.push(`[${repo.name}] warning ${w.key}: ${w.message}`);

      // Un file che non è nemmeno YAML leggibile non sostituisce quello già salvato: si
      // perderebbe l'ultima versione buona e il software sparirebbe dall'indice.
      if (software && result.data === null) {
        log.push(`[${repo.name}] YAML illeggibile: tengo il publiccode.yml già salvato`);
        return;
      }

      // Se l'URL trovato è diverso da quello canonico, il repository è stato rinominato:
      // il vecchio URL resta come alias.
      const aliases = repo.url !== repo.canonicalUrl ? [repo.url] : [];
      const publisherId = repo.publisher.kind === "publisher" ? repo.publisher.id : undefined;
      software = await this.upsert(software, repo.canonicalUrl, aliases, yaml, result.valid, log, publisherId);
    } catch (e) {
      this.stats.upsertFailures++;
      log.push(`[${repo.name}] errore: ${(e as Error).message}`);
    } finally {
      await this.flushLog(log, software);
    }
  }

  /** Porting di upsertSoftware. Restituisce il software aggiornato o creato. */
  private async upsert(
    software: SoftwareDto | null,
    url: string,
    aliases: string[],
    publiccodeYml: string,
    valid: boolean,
    log: string[],
    publisherId?: string,
  ): Promise<SoftwareDto | null> {
    if (!software) {
      if (this.dryRun) {
        this.stats.created++;
        return null;
      }
      // Si crea anche se il file non è valido, ma inattivo: così si sa che esiste e
      // publiccode-issueopener può avvisare i maintainer.
      const created = await api.createSoftware({ url, aliases, publiccodeYml, active: valid, publisherId });
      this.stats.created++;
      log.push(`creato il software ${created.id}${valid ? "" : " (inattivo)"}`);
      return created;
    }
    const merged = [...new Set([...aliases, ...software.aliases])];

    // Un software creato inattivo si riconosce solo da created_at = updated_at: aggiornarlo
    // con il file ancora non valido cambierebbe updated_at e lo farebbe sembrare disattivato
    // a mano, bloccandolo per sempre.
    if (!valid && !software.active) return software;

    // Riattiva i software creati inattivi quando il file torna valido; non disattiva mai un
    // software attivo per un file non valido.
    const active = valid || software.active;

    // publisher_id: si imposta se manca; se è già un altro publisher non si sovrascrive (lo
    // stesso repository può comparire nei code hosting di più publisher e l'associazione non
    // deve cambiare a ogni giro). Si corregge dalla dashboard.
    let setPublisher: string | undefined;
    if (publisherId && !software.publisherId) setPublisher = publisherId;
    else if (publisherId && software.publisherId !== publisherId) {
      log.push(`publisher diverso: trovato in ${publisherId}, resta ${software.publisherId}`);
    }

    if (this.dryRun) {
      this.stats.updated++;
      return software;
    }
    const updated = await api.updateSoftware(software.id, {
      url,
      aliases: merged,
      publiccodeYml,
      active,
      ...(setPublisher && { publisherId: setPublisher }),
    });
    this.stats.updated++;
    return updated;
  }

  private async flushLog(entries: string[], software: SoftwareDto | null) {
    if (entries.length === 0) return;
    for (const e of entries) console.log(e);
    if (this.dryRun) return;
    const message = entries.join("\n");
    try {
      await (software ? api.softwareLog(software.id, message) : api.log(message));
    } catch (e) {
      console.error(`impossibile salvare il log: ${(e as Error).message}`);
    }
  }

  summary(): string {
    const s = this.stats;
    return [
      `Repository elaborati: ${s.processed}. publiccode.yml validi: ${s.good}, non validi: ${s.bad}, non trovati: ${s.notFound}.`,
      `Nuovi: ${s.created}, già noti: ${s.updated}, saltati (disattivati a mano): ${s.skipped}, errori: ${s.upsertFailures}.`,
      s.fetchFailed ? `ATTENZIONE: ${s.fetchFailed} file non scaricabili (rate limit o rete).` : "",
      this.dryRun ? "(--dry-run: nessuna modifica all'API)" : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
}

/** Publisher dell'API → formato del crawler. */
export function toPublisher(p: {
  id: string;
  alternativeId: string | null;
  description: string;
  codeHosting: { url: string; group: boolean }[];
}): Publisher {
  return {
    id: p.id,
    kind: "publisher",
    alternativeId: p.alternativeId,
    name: p.description,
    sources: p.codeHosting.map((ch) => ({ url: ch.url, driver: "", group: ch.group })),
  };
}
