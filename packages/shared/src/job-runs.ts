import type { JobName, JobRunDto } from "./api-types.ts";

// Registra un'esecuzione di un job nell'API (/v2/job-runs), per lo stato degli strumenti
// nel cruscotto della dashboard. Usato da crawler e indexer.
//
// Senza token (o con --dry-run) non registra nulla. Un errore dell'API non fa fallire il
// job: l'esecuzione conta più della sua registrazione.

export interface JobRunReporter {
  /** Chiude l'esecuzione come riuscita, con i contatori del giro */
  succeeded(stats?: Record<string, number | string>): Promise<void>;
  /** Chiude l'esecuzione come fallita */
  failed(error: unknown, stats?: Record<string, number | string>): Promise<void>;
}

const noop: JobRunReporter = { succeeded: async () => {}, failed: async () => {} };

export async function startJobRun(opts: {
  apiBaseUrl: string;
  token: string | undefined;
  job: JobName;
  trigger?: string;
  log?: (m: string) => void;
}): Promise<JobRunReporter> {
  const log = opts.log ?? console.warn;
  if (!opts.token) return noop;
  const base = opts.apiBaseUrl.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` };

  let id: string;
  try {
    const res = await fetch(`${base}/job-runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ job: opts.job, trigger: opts.trigger ?? "manual" }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    id = ((await res.json()) as JobRunDto).id;
  } catch (e) {
    log(`esecuzione non registrata nell'API: ${(e as Error).message}`);
    return noop;
  }

  const finish = async (body: object) => {
    try {
      const res = await fetch(`${base}/job-runs/${id}`, { method: "PATCH", headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      log(`esito dell'esecuzione non registrato nell'API: ${(e as Error).message}`);
    }
  };
  return {
    succeeded: (stats) => finish({ status: "SUCCEEDED", stats }),
    failed: (error, stats) =>
      finish({ status: "FAILED", stats, error: (error instanceof Error ? error.message : String(error)).slice(0, 2000) }),
  };
}
