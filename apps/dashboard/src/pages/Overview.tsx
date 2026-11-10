import type { HealthCheckDto, HealthDto, HealthLevel, JobRunDto, StatsDto, StatsInterval } from "@sw-catalog/shared";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router";
import { Icon, type IconName } from "../components/Icon.tsx";
import { ErrorAlert, Loading } from "../components/States.tsx";
import { useApi } from "../lib/api.ts";
import { formatDate } from "../lib/format.ts";

// I grafici (graph-italia-components con ECharts, circa 560 kB compressi) si caricano a
// parte: stato degli strumenti e qualità dei dati compaiono senza aspettarli.
const CatalogCharts = lazy(() => import("./overview/CatalogCharts.tsx"));

// Cruscotto dell'area riservata: stato degli strumenti (/v2/health), totali, andamenti,
// composizione del catalogo e qualità dei dati (/v2/stats). Grafici di graph-italia-components.

const num = new Intl.NumberFormat("it-IT");
const HEALTH_REFRESH_MS = 60_000;

export function Overview() {
  const [interval, setInterval_] = useState<StatsInterval>("month");
  // Il pulsante "Aggiorna" chiede all'API di ricalcolare (le statistiche sono in cache 5 minuti)
  const [refresh, setRefresh] = useState(0);
  const stats = useApi<StatsDto>(`/stats?interval=${interval}${refresh ? `&refresh=true&r=${refresh}` : ""}`);
  const health = useApi<HealthDto>(`/health${refresh ? `?refresh=true&r=${refresh}` : ""}`);
  const runs = useApi<{ data: JobRunDto[] }>(`/job-runs?limit=10${refresh ? `&r=${refresh}` : ""}`);

  const reloadHealth = health.reload;
  useEffect(() => {
    const id = setInterval(reloadHealth, HEALTH_REFRESH_MS);
    return () => clearInterval(id);
  }, [reloadHealth]);

  const s = stats.data;
  return (
    <div className="space-y-12">
        <header className="flex flex-wrap items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold">Cruscotto</h1>
            <p className="text-base-content/70">
              Stato degli strumenti e numeri del catalogo
              {s && <> · dati del {formatDate(s.generatedAt)}</>}
            </p>
          </div>
          <button
            type="button"
            className="ita-btn ita-btn-outline ita-btn-primary ita-btn-xs ms-auto"
            onClick={() => setRefresh((r) => r + 1)}
            disabled={stats.loading || health.loading}
          >
            Aggiorna
          </button>
        </header>

        <HealthSection health={health} runs={runs.data?.data ?? null} />

        {stats.error && <ErrorAlert error={stats.error} />}
        {!s && stats.loading && <Loading label="Calcolo delle statistiche…" />}
        {s && (
          <>
            <Suspense fallback={<Loading label="Caricamento dei grafici…" />}>
              <CatalogCharts stats={s} interval={interval} onInterval={setInterval_} loading={stats.loading} />
            </Suspense>
            <Quality items={s.quality} />
            <p className="text-sm text-base-content/70">
              Grafici realizzati con{" "}
              <a href="https://graph.italia.it/" target="_blank" rel="noopener noreferrer" className="ita-link">
                Graph Italia
              </a>
              .
            </p>
          </>
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stato degli strumenti
// ---------------------------------------------------------------------------

const LEVEL: Record<HealthLevel, { label: string; badge: string; border: string; icon: IconName }> = {
  ok: { label: "Operativo", badge: "ita-badge-success", border: "border-success", icon: "it-check-circle" },
  warn: { label: "Attenzione", badge: "ita-badge-warning", border: "border-warning", icon: "it-warning-circle" },
  error: { label: "Errore", badge: "ita-badge-danger", border: "border-error", icon: "it-close-circle" },
  unknown: { label: "Sconosciuto", badge: "ita-badge-secondary", border: "border-base-300", icon: "it-warning-circle" },
};

const OVERALL: Record<HealthLevel, string> = {
  ok: "Tutti gli strumenti funzionano.",
  warn: "Alcuni strumenti richiedono attenzione.",
  error: "Almeno uno strumento non funziona.",
  unknown: "Stato non determinabile.",
};

function HealthSection({ health, runs }: { health: ReturnType<typeof useApi<HealthDto>>; runs: JobRunDto[] | null }) {
  const h = health.data;
  return (
    <section aria-labelledby="health-title" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="health-title" className="text-2xl font-semibold">
          Stato degli strumenti
        </h2>
        {h && (
          <span className={`ita-badge ${LEVEL[h.level].badge}`} role="status">
            {OVERALL[h.level]}
          </span>
        )}
        {h && <span className="text-sm text-base-content/70 ms-auto">Controllato il {formatDate(h.checkedAt)}</span>}
      </div>
      {health.error && <ErrorAlert error={health.error} />}
      {!h && health.loading && <Loading label="Controllo degli strumenti…" />}
      {h && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {h.checks.map((c) => (
            <HealthCard key={c.id} check={c} />
          ))}
        </ul>
      )}
      {runs && runs.length > 0 && <RecentRuns runs={runs} />}
    </section>
  );
}

function HealthCard({ check }: { check: HealthCheckDto }) {
  const l = LEVEL[check.level];
  return (
    <li className={`flex flex-col gap-2 rounded-box border border-base-300 border-l-4 ${l.border} bg-base-100 p-4`}>
      <div className="flex items-center gap-2">
        <Icon name={l.icon} className="size-5 shrink-0" />
        <h3 className="!text-lg !m-0 font-semibold">{check.name}</h3>
        <span className={`ita-badge ${l.badge} ms-auto`}>{l.label}</span>
      </div>
      <p className="text-sm break-words">{check.summary}</p>
      {check.details.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-primary">Dettagli</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {check.details.map((d) => (
              <div key={d.label} className="contents">
                <dt className="text-base-content/70">{d.label}</dt>
                <dd className="break-all">{d.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </li>
  );
}

const JOB_LABEL: Record<string, string> = {
  crawler: "Crawler",
  "crawler-software": "Crawler (singolo software)",
  indexer: "Indexer",
  "ipa-sync": "Sync IndicePA",
};
const RUN_STATUS: Record<JobRunDto["status"], { label: string; badge: string }> = {
  RUNNING: { label: "In corso", badge: "ita-badge-primary" },
  SUCCEEDED: { label: "Riuscita", badge: "ita-badge-success" },
  FAILED: { label: "Fallita", badge: "ita-badge-danger" },
};

function duration(ms: number | null) {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

function RecentRuns({ runs }: { runs: JobRunDto[] }) {
  return (
    <details className="rounded-box border border-base-300 bg-base-100 p-4">
      <summary className="cursor-pointer font-semibold">Ultime esecuzioni dei job</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th scope="col">Job</th>
              <th scope="col">Avvio</th>
              <th scope="col">Durata</th>
              <th scope="col">Esito</th>
              <th scope="col">Avviata da</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{JOB_LABEL[r.job] ?? r.job}</td>
                <td className="whitespace-nowrap">{formatDate(r.startedAt)}</td>
                <td className="whitespace-nowrap">{duration(r.durationMs)}</td>
                <td>
                  <span className={`ita-badge ${RUN_STATUS[r.status].badge}`}>{RUN_STATUS[r.status].label}</span>
                </td>
                <td>{r.trigger ?? "—"}</td>
                <td className="max-w-md truncate" title={r.error ?? undefined}>
                  {r.error ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Qualità dei dati
// ---------------------------------------------------------------------------

function Quality({ items }: { items: StatsDto["quality"] }) {
  return (
    <section aria-labelledby="quality-title" className="space-y-4">
      <h2 id="quality-title" className="text-2xl font-semibold">
        Qualità dei dati
      </h2>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((q) => (
          <li key={q.id} className="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-4">
            <div className="flex items-baseline gap-3">
              <span className={`text-3xl font-bold ${q.count ? "text-primary" : "text-success"}`}>{num.format(q.count)}</span>
              <h3 className="!text-lg !m-0 font-semibold">{q.label}</h3>
            </div>
            <p className="text-sm text-base-content/70">{q.description}</p>
            {q.examples.length > 0 && (
              <ul className="text-sm">
                {q.examples.map((e) => (
                  <li key={e.id} className="truncate">
                    <Link to={e.href} className="ita-link">
                      {e.name}
                    </Link>
                  </li>
                ))}
                {q.count > q.examples.length && (
                  <li className="text-base-content/70">e altri {num.format(q.count - q.examples.length)}</li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
