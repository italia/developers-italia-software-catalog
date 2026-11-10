#!/usr/bin/env bun
// Sostituisce scripts/get-software.js + scripts/get-publishers.js + il passo `_bulk` del
// Makefile di developers.italia.it (Fase 2 di new-plan.md).
//
//   bun src/index.ts [--dry-run] [--keep N]
//
// 1. legge dall'API v2 i software attivi e i publisher attivi con alternativeId (IPA)
// 2. crea un indice nuovo `<prefisso>-<timestamp>` con mappings esplicite
// 3. carica i documenti con _bulk
// 4. sposta in modo atomico l'alias (default `developers_italia_it`) sul nuovo indice
// 5. cancella i vecchi indici del prefisso, tenendo gli ultimi N per il rollback
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { OPENSEARCH_INDEX_ALIAS, type Page, type PublisherDto, type SoftwareDto, startJobRun } from "@sw-catalog/shared";
import { administrationDoc, softwareDoc } from "./documents.ts";
import { indexBody } from "./mappings.ts";
import { OpenSearch } from "./opensearch.ts";

const { values: opts } = parseArgs({
  options: {
    "dry-run": { type: "boolean", short: "n", default: false },
    keep: { type: "string", default: "1" },
    output: { type: "string", default: "elasticsearch.bulk" },
  },
});

const apiBase = (process.env.API_BASEURL ?? "http://localhost:3001/v2").replace(/\/$/, "");
const alias = process.env.OPENSEARCH_INDEX_ALIAS ?? OPENSEARCH_INDEX_ALIAS;
// Prefisso diverso da quello di Searchyll (developers_italia_it-<ts>) per non toccare i suoi indici.
const prefix = process.env.OPENSEARCH_INDEX_PREFIX ?? `${alias}_catalog`;
const os = new OpenSearch(
  process.env.OPENSEARCH_URL ?? "http://localhost:9200",
  process.env.OPENSEARCH_USER,
  process.env.OPENSEARCH_PASS,
  process.env.OPENSEARCH_CA_FILE,
);

async function fetchAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  const origin = new URL(apiBase).origin;
  let next: string | null = `${apiBase}${path}${path.includes("?") ? "&" : "?"}page[size]=100`;
  while (next) {
    const res = await fetch(next);
    if (!res.ok) throw new Error(`GET ${next}: HTTP ${res.status}`);
    const page = (await res.json()) as Page<T>;
    out.push(...page.data);
    next = page.links.next ? `${origin}${page.links.next}` : null;
  }
  return out;
}

const timestamp = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

type RunStats = Record<string, number | string>;

async function main(stats: RunStats) {
  const [software, publishers] = await Promise.all([
    fetchAll<SoftwareDto>("/software?active=true"),
    fetchAll<PublisherDto>("/publishers?active=true"),
  ]);

  const lines: string[] = [];
  let unreadable = 0;
  for (const s of software) {
    const doc = softwareDoc(s);
    if (!doc) {
      unreadable++;
      continue;
    }
    lines.push(JSON.stringify({ index: { _id: s.id } }), JSON.stringify(doc));
  }
  const administrations = publishers.filter((p) => p.alternativeId);
  for (const p of administrations) {
    lines.push(JSON.stringify({ index: { _id: p.id } }), JSON.stringify(administrationDoc(p)));
  }
  Object.assign(stats, { software: software.length - unreadable, administrations: administrations.length, unreadable });
  console.log(
    `documenti: ${software.length - unreadable} software (${unreadable} con YAML illeggibile, esclusi), ${administrations.length} amministrazioni`,
  );

  if (opts["dry-run"]) {
    await writeFile(opts.output!, `${lines.join("\n")}\n`);
    console.log(`--dry-run: bulk scritto in ${opts.output}, nessuna modifica a OpenSearch`);
    return;
  }

  if (await os.isConcreteIndex(alias)) {
    throw new Error(`"${alias}" è un indice e non un alias: va cancellato prima del primo giro (vedi Fase 2, cutover)`);
  }

  const index = `${prefix}-${timestamp()}`;
  stats.index = index;
  await os.request("PUT", `/${index}`, indexBody(Number(process.env.OPENSEARCH_REPLICAS ?? 0)));
  console.log(`creato l'indice ${index}`);

  // Bulk a blocchi di 1000 righe (500 documenti).
  let failed = 0;
  for (let i = 0; i < lines.length; i += 1000) {
    const chunk = `${lines.slice(i, i + 1000).join("\n")}\n`;
    const res = await os.request<{ errors: boolean; items: { index: { _id: string; error?: { reason: string } } }[] }>(
      "POST",
      `/${index}/_bulk`,
      chunk,
      true,
    );
    for (const item of res.items) {
      if (item.index.error) {
        failed++;
        console.error(`documento ${item.index._id}: ${item.index.error.reason}`);
      }
    }
  }
  await os.request("POST", `/${index}/_refresh`);
  const { count } = await os.request<{ count: number }>("GET", `/${index}/_count`);
  stats.failed = failed;
  console.log(`indicizzati ${count} documenti, ${failed} errori`);

  if (count === 0) throw new Error("indice vuoto: non sposto l'alias");

  // Swap atomico dell'alias.
  const previous = await os.aliasTargets(alias);
  await os.request("POST", "/_aliases", {
    actions: [...previous.map((idx) => ({ remove: { index: idx, alias } })), { add: { index, alias } }],
  });
  console.log(`alias ${alias}: ${previous.join(", ") || "(nessuno)"} → ${index}`);

  // Pulizia: tiene gli ultimi N indici del prefisso oltre al nuovo.
  const keep = Number(opts.keep);
  const old = (await os.indicesMatching(`${prefix}-*`)).filter((i) => i !== index);
  for (const idx of old.slice(0, Math.max(old.length - keep, 0))) {
    await os.request("DELETE", `/${idx}`);
    console.log(`cancellato il vecchio indice ${idx}`);
  }
}

// L'esecuzione viene registrata nell'API (/v2/job-runs) per lo stato degli strumenti nel
// cruscotto, se c'è API_BEARER_TOKEN e non è un --dry-run.
const run = await startJobRun({
  apiBaseUrl: apiBase,
  token: opts["dry-run"] ? undefined : process.env.API_BEARER_TOKEN,
  job: "indexer",
  trigger: process.env.JOB_TRIGGER,
});
const stats: RunStats = {};
try {
  await main(stats);
  await run.succeeded(stats);
} catch (e) {
  await run.failed(e, stats);
  console.error((e as Error).message);
  process.exit(1);
}
