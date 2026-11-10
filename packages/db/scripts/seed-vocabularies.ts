#!/usr/bin/env bun
// Carica le liste editoriali (D13) dai file di seed/vocabularies/.
//
//   bun run db:seed:vocabularies [--force] [--dry-run]
//
// Idempotente: crea le liste che mancano e aggiunge in fondo le voci con una chiave nuova,
// senza toccare quelle già presenti, che si modificano dalla dashboard.
// --force riporta etichette, testi e ordine delle voci a quelli dei file (le voci aggiunte
// dalla dashboard restano, in fondo).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { getDb } from "../src/index.ts";
import { SEED_VOCABULARIES } from "../src/vocabulary-seed.ts";

const { values: args } = parseArgs({
  options: { force: { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false } },
});
const dir = join(import.meta.dir, "..", "seed", "vocabularies");
const db = getDb();

for (const v of SEED_VOCABULARIES) {
  const terms = v.terms(readFileSync(join(dir, v.file), "utf8"));
  const existing = await db.vocabularyTerm.findMany({ where: { vocabularyId: v.id }, select: { key: true, position: true } });
  const known = new Set(existing.map((t) => t.key));
  const fresh = terms.filter((t) => !known.has(t.key));
  console.log(
    `${v.id}: ${terms.length} voci nel file, ${existing.length} nel database, ${fresh.length} da aggiungere${args.force ? `, ${terms.length - fresh.length} da riallineare` : ""}`,
  );
  if (args["dry-run"]) continue;

  await db.$transaction(async (tx) => {
    await tx.vocabulary.upsert({
      where: { id: v.id },
      create: { id: v.id, name: v.name, description: v.description },
      update: args.force ? { name: v.name, description: v.description } : {},
    });
    if (args.force || existing.length === 0) {
      // L'ordine dei file; le voci aggiunte dalla dashboard (non nei file) vanno in fondo.
      for (const [position, t] of terms.entries()) {
        await tx.vocabularyTerm.upsert({
          where: { vocabularyId_key: { vocabularyId: v.id, key: t.key } },
          create: { ...t, vocabularyId: v.id, position },
          update: { ...t, position },
        });
      }
      const fileKeys = new Set(terms.map((t) => t.key));
      const extras = existing.filter((t) => !fileKeys.has(t.key)).sort((a, b) => a.position - b.position);
      for (const [i, t] of extras.entries()) {
        await tx.vocabularyTerm.update({
          where: { vocabularyId_key: { vocabularyId: v.id, key: t.key } },
          data: { position: terms.length + i },
        });
      }
    } else {
      let next = Math.max(...existing.map((t) => t.position)) + 1;
      await tx.vocabularyTerm.createMany({ data: fresh.map((t) => ({ ...t, vocabularyId: v.id, position: next++ })) });
    }
  });
}
process.exit(0);
