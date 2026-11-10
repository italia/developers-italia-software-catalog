import type { JobRun, PrismaClient } from "@sw-catalog/db";
import type { JobName, JobRunDto } from "@sw-catalog/shared";

// Esecuzioni dei job (crawler, indexer, sync IndicePA): da qui il cruscotto ricava lo
// stato degli strumenti. Crawler e indexer scrivono tramite /v2/job-runs, il sync
// IndicePA con recordJob().

type Db = Pick<PrismaClient, "jobRun">;
type Stats = Record<string, number | string>;

export function toJobRunDto(run: JobRun): JobRunDto {
  return {
    id: run.id,
    job: run.job as JobName,
    status: run.status,
    trigger: run.trigger,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMs: run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
    stats: (run.stats as Stats | null) ?? null,
    error: run.error,
  };
}

export const startJob = (db: Db, job: JobName, trigger = "manual") => db.jobRun.create({ data: { job, trigger } });

/** Chiude un'esecuzione ancora RUNNING; restituisce null se era già chiusa o non esiste. */
export async function finishJob(
  db: Db,
  id: string,
  result: { status: "SUCCEEDED" | "FAILED"; stats?: Stats; error?: string },
): Promise<JobRun | null> {
  const { count } = await db.jobRun.updateMany({
    where: { id, status: "RUNNING" },
    data: { status: result.status, stats: result.stats, error: result.error ?? null, finishedAt: new Date() },
  });
  return count ? db.jobRun.findUnique({ where: { id } }) : null;
}

/** Esegue fn registrando l'esecuzione; l'errore viene registrato e rilanciato. */
export async function recordJob<T>(db: Db, job: JobName, fn: () => Promise<T>, toStats?: (r: T) => Stats, trigger?: string) {
  const run = await startJob(db, job, trigger);
  try {
    const result = await fn();
    await finishJob(db, run.id, { status: "SUCCEEDED", stats: toStats?.(result) });
    return result;
  } catch (e) {
    await finishJob(db, run.id, { status: "FAILED", error: (e instanceof Error ? e.message : String(e)).slice(0, 2000) });
    throw e;
  }
}

/** L'ultima esecuzione di ciascun job. */
export async function lastRuns(db: Db, jobs: readonly JobName[]) {
  const runs = await Promise.all(jobs.map((job) => db.jobRun.findFirst({ where: { job }, orderBy: { startedAt: "desc" } })));
  return new Map(jobs.map((job, i) => [job, runs[i] ?? null]));
}

/** L'ultima esecuzione riuscita di ciascun job. */
export async function lastSuccessfulRuns(db: Db, jobs: readonly JobName[]) {
  const runs = await Promise.all(
    jobs.map((job) => db.jobRun.findFirst({ where: { job, status: "SUCCEEDED" }, orderBy: { startedAt: "desc" } })),
  );
  return new Map(jobs.map((job, i) => [job, runs[i] ?? null]));
}
