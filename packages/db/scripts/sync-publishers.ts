#!/usr/bin/env bun
// Sincronizza software.publisher_id con i publisher e i loro code hosting.
// Si può lanciare quando si vuole (idempotente), per esempio dopo un import o dopo aver
// aggiunto o spostato dei code hosting.
//
//   bun run db:sync-publishers [--dry-run] [--force] [--verbose]
//
// Per ogni software calcola il publisher atteso (regole in src/publisher-match.ts) e:
//   - lo assegna ai software che non ne hanno uno;
//   - SEGNALA, senza cambiarli, quelli il cui publisher attuale è diverso da quello atteso
//     (con --force li allinea);
//   - lascia com'è un publisher già impostato quando non c'è più nessun riscontro (può essere
//     un'assegnazione manuale, o un code hosting tolto).
// In più riporta i software il cui codice IPA nel publiccode.yml è diverso da quello del
// publisher: riusi, fork o errori nel file.
//
// Scrive direttamente nel database con SQL e senza toccare updated_at, che serve al crawler
// per riconoscere i software disattivati a mano.
import { parseArgs } from "node:util";
import { getDb } from "../src/index.ts";
import { buildPublisherMatcher, declaredIpa } from "../src/publisher-match.ts";

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    verbose: { type: "boolean", short: "v", default: false },
  },
});
const db = getDb();
const LIST_LIMIT = args.verbose ? Infinity : 15;

const publishers = await db.publisher.findMany({ include: { codeHosting: true } });
const names = new Map(publishers.map((p) => [p.id, p]));
const match = buildPublisherMatcher(publishers);

const software = await db.software.findMany({
  select: {
    id: true,
    publiccodeYml: true,
    publisherId: true,
    url: { select: { url: true } },
    urls: { select: { url: true } },
  },
});

const count = { assigned: 0, aligned: 0, different: 0, forced: 0, keptWithoutMatch: 0, ambiguous: 0, unresolved: 0 };
const writes: { id: string; publisherId: string }[] = [];
const different: string[] = [];
const ambiguous: string[] = [];
const label = (id: string | null | undefined) => (id ? (names.get(id)?.description ?? id) : "—");

for (const s of software) {
  const result = match({ urls: s.urls.map((u) => u.url), publiccodeYml: s.publiccodeYml });

  if (result.kind === "ambiguous") {
    count.ambiguous++;
    ambiguous.push(`${s.url.url}: ${result.publisherIds.map(label).join(" | ")}`);
    continue;
  }
  if (result.kind === "none") {
    if (s.publisherId) count.keptWithoutMatch++;
    else count.unresolved++;
    continue;
  }

  const expected = result.publisherId;
  if (s.publisherId === expected) {
    count.aligned++;
  } else if (!s.publisherId) {
    count.assigned++;
    writes.push({ id: s.id, publisherId: expected });
  } else {
    count.different++;
    different.push(`${s.url.url}: ora "${label(s.publisherId)}", dai code hosting "${label(expected)}"`);
    if (args.force) {
      count.forced++;
      writes.push({ id: s.id, publisherId: expected });
    }
  }
}

if (!args["dry-run"] && writes.length > 0) {
  await db.$transaction(
    writes.map((w) => db.$executeRaw`UPDATE "software" SET "publisher_id" = ${w.publisherId} WHERE "id" = ${w.id}`),
  );
}

// Codice IPA del publiccode.yml diverso da quello del publisher (stato dopo la sincronizzazione).
const finalPublisher = new Map(software.map((s) => [s.id, s.publisherId]));
for (const w of writes) if (!args["dry-run"]) finalPublisher.set(w.id, w.publisherId);
const ipaMismatch: string[] = [];
for (const s of software) {
  const publisher = names.get(finalPublisher.get(s.id) ?? "");
  const ipa = declaredIpa(s.publiccodeYml);
  if (publisher?.alternativeId && ipa && ipa !== publisher.alternativeId.toLowerCase()) {
    ipaMismatch.push(`${s.url.url}: pubblicato da "${publisher.description}" (${publisher.alternativeId}), titolare dichiarato ${ipa}`);
  }
}

const list = (title: string, items: string[]) => {
  if (items.length === 0) return;
  console.log(`\n${title} (${items.length}):`);
  for (const line of items.slice(0, LIST_LIMIT)) console.log(`  - ${line}`);
  if (items.length > LIST_LIMIT) console.log(`  … altri ${items.length - LIST_LIMIT} (--verbose per vederli tutti)`);
};

list(args.force ? "Publisher diversi dai code hosting, allineati (--force)" : "Publisher diversi dai code hosting, NON cambiati (--force per allinearli)", different);
list("Ambigui: più publisher hanno lo stesso code hosting", ambiguous);
list("Codice IPA nel publiccode.yml diverso da quello del publisher (riusi, fork o errori)", ipaMismatch);

console.log(
  `\nSoftware: ${software.length}. Già allineati: ${count.aligned}, assegnati ora: ${count.assigned}, ` +
    `diversi: ${count.different}${args.force ? ` (allineati: ${count.forced})` : ""}, ` +
    `senza riscontro ma con un publisher (lasciati): ${count.keptWithoutMatch}, ambigui: ${count.ambiguous}, ` +
    `senza publisher: ${count.unresolved}.` +
    (args["dry-run"] ? ` --dry-run: ${writes.length} modifiche NON scritte.` : ` Modifiche scritte: ${writes.length}.`),
);
await db.$disconnect();
