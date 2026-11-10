#!/usr/bin/env bun
// Sincronizza l'anagrafica IndicePA in ipa_entities (Fase 1, "Sync IndicePA").
//   bun run ipa:sync
// L'esecuzione viene registrata in job_runs (stato degli strumenti nel cruscotto).
import { getDb } from "../lib/db.ts";
import { syncIpa } from "../services/ipa.ts";
import { recordJob } from "../services/job-runs.ts";

const db = getDb();
try {
  await recordJob(db, "ipa-sync", () => syncIpa(db), (r) => ({ upserted: r.upserted, removed: r.removed }), process.env.JOB_TRIGGER);
  process.exit(0);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
