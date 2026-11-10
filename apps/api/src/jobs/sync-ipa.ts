#!/usr/bin/env bun
// Sincronizza l'anagrafica IndicePA in ipa_entities (Fase 1, "Sync IndicePA").
//   bun run ipa:sync
import { getDb } from "../lib/db.ts";
import { syncIpa } from "../services/ipa.ts";

await syncIpa(getDb());
process.exit(0);
