import { JOB_NAMES } from "@sw-catalog/shared";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db.ts";
import { problem } from "../lib/problem.ts";
import { type AuthVars, requireUser, requireWriter } from "../lib/session.ts";
import { validate } from "../lib/validate.ts";
import { finishJob, startJob, toJobRunDto } from "../services/job-runs.ts";

// Esecuzioni dei job. Crawler e indexer aprono un'esecuzione all'avvio e la chiudono alla
// fine con l'esito e i contatori; la dashboard le legge per lo stato degli strumenti.
export const jobRuns = new Hono<{ Variables: AuthVars }>();

const stats = z.record(z.string().max(64), z.union([z.number(), z.string().max(500)])).optional();

jobRuns.get(
  "/",
  requireUser,
  validate(
    "query",
    z.object({ job: z.enum(JOB_NAMES).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }),
  ),
  async (c) => {
    const { job, limit } = c.req.valid("query");
    const runs = await getDb().jobRun.findMany({
      where: job ? { job } : {},
      orderBy: { startedAt: "desc" },
      take: limit ?? 20,
    });
    return c.json({ data: runs.map(toJobRunDto) });
  },
);

jobRuns.post(
  "/",
  requireWriter,
  validate("json", z.strictObject({ job: z.enum(JOB_NAMES), trigger: z.string().trim().min(1).max(50).optional() })),
  async (c) => {
    const { job, trigger } = c.req.valid("json");
    return c.json(toJobRunDto(await startJob(getDb(), job, trigger)), 201);
  },
);

jobRuns.patch(
  "/:id",
  requireWriter,
  validate(
    "json",
    z.strictObject({ status: z.enum(["SUCCEEDED", "FAILED"]), stats, error: z.string().max(2000).optional() }),
  ),
  async (c) => {
    const run = await finishJob(getDb(), c.req.param("id"), c.req.valid("json"));
    if (!run) return problem(c, 409, "Conflict", "Esecuzione inesistente o già chiusa");
    return c.json(toJobRunDto(run));
  },
);
