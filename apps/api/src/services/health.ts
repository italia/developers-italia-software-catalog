import { readFileSync } from "node:fs";
import type { JobRun, PrismaClient } from "@sw-catalog/db";
import { type HealthCheckDto, type HealthDto, type HealthLevel, type JobName, OPENSEARCH_INDEX_ALIAS } from "@sw-catalog/shared";
import { mailer } from "../lib/mailer.ts";
import { lastRuns, lastSuccessfulRuns, toJobRunDto } from "./job-runs.ts";

// Stato degli strumenti per il cruscotto: API, database, OpenSearch, crawler, indexer,
// sync IndicePA, SMTP, limite delle API di GitHub. Ogni controllo ha un timeout e un
// errore diventa uno stato "error", mai un 500. Il risultato resta in cache 30 secondi.

const CACHE_MS = 30_000;
const TIMEOUT_MS = 5_000;
const HOUR = 3_600_000;

let cache: { at: number; value: HealthDto } | null = null;
export const resetHealthCache = () => {
  cache = null;
};

const dateFmt = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" });
export const formatDate = (d: Date) => dateFmt.format(d);

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} giorni`;
}

const ago = (d: Date) => `${formatDuration(Date.now() - d.getTime())} fa`;

type Check = Omit<HealthCheckDto, "id" | "name" | "latencyMs" | "lastRun"> & Partial<Pick<HealthCheckDto, "lastRun">>;

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`nessuna risposta in ${ms / 1000} s`)), ms)),
  ]);
}

async function run(id: string, name: string, fn: () => Promise<Check>): Promise<HealthCheckDto> {
  const t0 = performance.now();
  try {
    const r = await withTimeout(fn());
    return { id, name, lastRun: null, ...r, latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return { id, name, level: "error", summary: (e as Error).message, details: [], latencyMs: null, lastRun: null };
  }
}

const RANK: Record<HealthLevel, number> = { ok: 0, unknown: 1, warn: 1, error: 2 };
export const worst = (levels: HealthLevel[]): HealthLevel =>
  levels.reduce<HealthLevel>((w, l) => (RANK[l] > RANK[w] ? (l === "unknown" ? "warn" : l) : w), "ok");

export async function getHealth(db: PrismaClient, refresh = false): Promise<HealthDto> {
  if (!refresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const jobs = ["crawler", "indexer", "ipa-sync"] as const;
  const [last, lastOk] = await Promise.all([lastRuns(db, jobs), lastSuccessfulRuns(db, jobs)]).catch(
    () => [new Map(), new Map()] as const,
  );
  const checks = await Promise.all([
    run("api", "API", async () => apiCheck()),
    run("database", "Database", () => databaseCheck(db)),
    run("opensearch", "OpenSearch", () => opensearchCheck(db)),
    run("crawler", "Crawler", async () => jobCheck(JOBS.crawler, last.get("crawler") ?? null, lastOk.get("crawler") ?? null)),
    run("indexer", "Indexer", async () => jobCheck(JOBS.indexer, last.get("indexer") ?? null, lastOk.get("indexer") ?? null)),
    run("ipa-sync", "Sync IndicePA", () => ipaCheck(db, last.get("ipa-sync") ?? null, lastOk.get("ipa-sync") ?? null)),
    run("smtp", "Email (SMTP)", smtpCheck),
    run("github", "API di GitHub", githubCheck),
  ]);
  const value: HealthDto = { level: worst(checks.map((c) => c.level)), checkedAt: new Date().toISOString(), checks };
  cache = { at: Date.now(), value };
  return value;
}

// ---------------------------------------------------------------------------

function apiCheck(): Check {
  const details = [
    { label: "Versione", value: "2" },
    { label: "Attiva da", value: formatDuration(process.uptime() * 1000) },
    { label: "Runtime", value: `Bun ${Bun.version}` },
  ];
  if (process.env.GIT_COMMIT) details.push({ label: "Commit", value: process.env.GIT_COMMIT.slice(0, 12) });
  return { level: "ok", summary: "In esecuzione", details };
}

async function databaseCheck(db: PrismaClient): Promise<Check> {
  const t0 = performance.now();
  await db.$queryRaw`SELECT 1`;
  const latency = Math.round(performance.now() - t0);
  const migrations = await db.$queryRaw<{ name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`
    SELECT migration_name AS name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC`;
  const applied = migrations.filter((m) => m.finished_at && !m.rolled_back_at);
  const broken = migrations.filter((m) => !m.finished_at && !m.rolled_back_at);
  const details = [
    { label: "Latenza", value: `${latency} ms` },
    { label: "Migration applicate", value: String(applied.length) },
  ];
  if (applied[0]) details.push({ label: "Ultima migration", value: applied[0].name });
  if (broken.length) {
    return { level: "error", summary: `Migration non completata: ${broken[0]!.name}`, details };
  }
  return { level: "ok", summary: `Risponde in ${latency} ms`, details };
}

// --- OpenSearch -------------------------------------------------------------

function opensearchFetch(path: string, auth: boolean): Promise<Response> {
  const base = (process.env.OPENSEARCH_URL ?? "http://localhost:9200").replace(/\/$/, "");
  const headers: Record<string, string> = {};
  const user = process.env.OPENSEARCH_USER;
  if (auth && user) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${process.env.OPENSEARCH_PASS ?? ""}`).toString("base64")}`;
  }
  const ca = process.env.OPENSEARCH_CA_FILE;
  return fetch(`${base}${path}`, { headers, ...(ca && { tls: { ca: readFileSync(ca, "utf8") } }) });
}

/** `<prefisso>-20261109163210` → data dell'indice. */
export function indexTimestamp(index: string): Date | null {
  const m = index.match(/-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)) : null;
}

async function opensearchCheck(db: PrismaClient): Promise<Check> {
  const alias = process.env.OPENSEARCH_INDEX_ALIAS ?? OPENSEARCH_INDEX_ALIAS;
  const details: Check["details"] = [];
  const levels: HealthLevel[] = [];
  const notes: string[] = [];

  // Salute del cluster: serve un utente con cluster_monitor (l'utente dell'indexer ce l'ha).
  const health = await opensearchFetch("/_cluster/health", true);
  if (health.ok) {
    const h = (await health.json()) as { status: "green" | "yellow" | "red"; number_of_nodes: number };
    details.push({ label: "Cluster", value: `${h.status}, ${h.number_of_nodes} nodi` });
    levels.push(h.status === "green" ? "ok" : h.status === "yellow" ? "warn" : "error");
    if (h.status !== "green") notes.push(`cluster ${h.status}`);
  } else {
    details.push({ label: "Cluster", value: `non leggibile (HTTP ${health.status})` });
    levels.push("unknown");
  }

  // Documenti nell'alias letto dal catalogo (ricerca anonima, come il catalogo).
  const count = await opensearchFetch(`/${alias}/_count?q=type:software`, false);
  if (!count.ok) throw new Error(`l'alias ${alias} non risponde (HTTP ${count.status})`);
  const indexed = ((await count.json()) as { count: number }).count;
  const active = await db.software.count({ where: { active: true } });
  const diff = active - indexed;
  details.push({ label: "Software indicizzati", value: `${indexed} (attivi nel database: ${active})` });
  if (Math.abs(diff) > Math.max(5, active * 0.02)) {
    levels.push("warn");
    notes.push(diff > 0 ? `${diff} software attivi non indicizzati` : `${-diff} documenti in più rispetto al database`);
  } else levels.push("ok");

  // Indice puntato dall'alias e sua età.
  const aliases = await opensearchFetch(`/${alias}*/_alias/${alias}`, true);
  if (aliases.ok) {
    const index = Object.keys((await aliases.json()) as object)[0];
    const at = index ? indexTimestamp(index) : null;
    if (index) details.push({ label: "Indice", value: index });
    if (at) {
      details.push({ label: "Creato", value: `${formatDate(at)} (${ago(at)})` });
      if (Date.now() - at.getTime() > JOBS.indexer.maxAgeHours * HOUR) {
        levels.push("warn");
        notes.push(`indice di ${ago(at)}`);
      }
    }
  }

  const level = worst(levels);
  return { level, summary: notes.length ? notes.join("; ") : `${indexed} software nel catalogo`, details };
}

// --- Job ---------------------------------------------------------------------

interface JobConfig {
  job: JobName;
  /** Oltre questo intervallo dall'ultima esecuzione riuscita lo stato diventa "warn" */
  maxAgeHours: number;
  /** Un'esecuzione RUNNING più vecchia di così è considerata interrotta */
  maxRunHours: number;
  /** Contatori che, se maggiori di zero, rendono lo stato "warn" */
  warnOn?: Record<string, string>;
  labels: Record<string, string>;
}

export const JOBS = {
  crawler: {
    job: "crawler",
    maxAgeHours: 26,
    maxRunHours: 12,
    warnOn: { fetchFailed: "file non scaricabili (rate limit o rete)", upsertFailures: "errori di scrittura nell'API" },
    labels: {
      processed: "Repository elaborati",
      good: "publiccode.yml validi",
      bad: "publiccode.yml non validi",
      notFound: "Senza publiccode.yml",
      created: "Software nuovi",
      updated: "Software già noti",
      skipped: "Saltati (disattivati)",
      fetchFailed: "File non scaricabili",
      upsertFailures: "Errori di scrittura",
    },
  },
  indexer: {
    job: "indexer",
    maxAgeHours: 26,
    maxRunHours: 2,
    warnOn: { failed: "documenti rifiutati da OpenSearch" },
    labels: {
      software: "Software indicizzati",
      administrations: "Amministrazioni indicizzate",
      unreadable: "YAML illeggibili (esclusi)",
      failed: "Documenti rifiutati",
      index: "Indice",
    },
  },
  "ipa-sync": {
    job: "ipa-sync",
    maxAgeHours: 24 * 8,
    maxRunHours: 1,
    labels: { upserted: "Enti aggiornati", removed: "Enti rimossi" },
  },
} satisfies Record<string, JobConfig>;

export function jobCheck(cfg: JobConfig, last: JobRun | null, lastOk: JobRun | null, now = Date.now()): Check {
  if (!last) return { level: "unknown", summary: "Nessuna esecuzione registrata", details: [] };
  const dto = toJobRunDto(last);
  const details: Check["details"] = [{ label: "Ultima esecuzione", value: `${formatDate(last.startedAt)} (${dto.trigger ?? "—"})` }];
  if (dto.durationMs !== null) details.push({ label: "Durata", value: formatDuration(dto.durationMs) });
  // Nell'ordine delle etichette (jsonb riordina le chiavi), poi eventuali contatori nuovi.
  const stats = dto.stats ?? {};
  const keys = [...Object.keys(cfg.labels).filter((k) => k in stats), ...Object.keys(stats).filter((k) => !(k in cfg.labels))];
  for (const k of keys) details.push({ label: cfg.labels[k] ?? k, value: String(stats[k]) });
  if (lastOk && lastOk.id !== last.id) details.push({ label: "Ultima riuscita", value: formatDate(lastOk.startedAt) });
  const base = { details, lastRun: dto };

  if (last.status === "RUNNING") {
    const running = now - last.startedAt.getTime();
    return running > cfg.maxRunHours * HOUR
      ? { ...base, level: "error", summary: `Avviata ${ago(last.startedAt)} e mai chiusa: probabilmente interrotta` }
      : { ...base, level: "ok", summary: `In corso da ${formatDuration(running)}` };
  }
  if (last.status === "FAILED") return { ...base, level: "error", summary: `Fallita: ${last.error ?? "errore sconosciuto"}` };

  const finished = last.finishedAt ?? last.startedAt;
  if (now - finished.getTime() > cfg.maxAgeHours * HOUR) {
    return { ...base, level: "warn", summary: `Ultima esecuzione ${ago(finished)}: in ritardo` };
  }
  const warnings = Object.entries(cfg.warnOn ?? {})
    .filter(([k]) => Number(dto.stats?.[k] ?? 0) > 0)
    .map(([k, label]) => `${dto.stats![k]} ${label}`);
  if (warnings.length) return { ...base, level: "warn", summary: `Riuscita con avvisi: ${warnings.join(", ")}` };
  return { ...base, level: "ok", summary: `Riuscita ${ago(finished)}` };
}

async function ipaCheck(db: PrismaClient, last: JobRun | null, lastOk: JobRun | null): Promise<Check> {
  const [count, synced] = await Promise.all([
    db.ipaEntity.count(),
    db.ipaEntity.aggregate({ _max: { syncedAt: true } }),
  ]);
  const entities = { label: "Enti in anagrafica", value: String(count) };
  if (last) {
    const r = jobCheck(JOBS["ipa-sync"], last, lastOk);
    return { ...r, details: [...r.details, entities] };
  }
  // Sync fatti prima che venissero registrati in job_runs.
  const at = synced._max.syncedAt;
  if (!at) return { level: "warn", summary: "Anagrafica vuota: esegui bun run ipa:sync", details: [entities] };
  const old = Date.now() - at.getTime() > JOBS["ipa-sync"].maxAgeHours * HOUR;
  return {
    level: old ? "warn" : "ok",
    summary: `Ultimo sync ${ago(at)}${old ? ": in ritardo" : ""}`,
    details: [{ label: "Ultimo sync", value: formatDate(at) }, entities],
  };
}

// --- Servizi esterni ---------------------------------------------------------

async function smtpCheck(): Promise<Check> {
  const server = await mailer.verify();
  const details = [{ label: "Server", value: server }];
  if (process.env.EMAIL_OVERRIDE_RECIPIENT) {
    return { level: "warn", summary: "Tutte le email vanno a EMAIL_OVERRIDE_RECIPIENT", details };
  }
  return { level: "ok", summary: "Il server risponde", details };
}

async function githubCheck(): Promise<Check> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { level: "unknown", summary: "GITHUB_TOKEN non impostato nell'API", details: [] };
  const res = await fetch("https://api.github.com/rate_limit", {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "developers-italia-software-catalog", Accept: "application/vnd.github+json" },
  });
  if (res.status === 401) return { level: "error", summary: "GITHUB_TOKEN non valido o scaduto", details: [] };
  if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
  const core = ((await res.json()) as { resources: { core: { limit: number; remaining: number; reset: number } } }).resources.core;
  const reset = new Date(core.reset * 1000);
  const details = [
    { label: "Richieste rimaste", value: `${core.remaining} su ${core.limit}` },
    { label: "Si azzera", value: formatDate(reset) },
  ];
  const low = core.remaining < core.limit * 0.1;
  return { level: low ? "warn" : "ok", summary: low ? "Limite quasi esaurito" : `${core.remaining} richieste rimaste`, details };
}
