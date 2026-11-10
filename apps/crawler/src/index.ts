#!/usr/bin/env bun
// Riscrittura di publiccode-crawler in TypeScript (Fase 4 di new-plan.md).
//
//   crawl [--publisher <id|IPA>]... [--limit N] [--dry-run]
//       crawla i cataloghi dell'API o, se non ce ne sono, i publisher attivi
//   crawl-software <id|url> <publisher id|IPA> [--dry-run]
//       crawla un singolo software
import { parseArgs } from "node:util";
import { type JobName, startJobRun } from "@sw-catalog/shared";
import { api } from "./api.ts";
import { config } from "./config.ts";
import { Crawler, toPublisher } from "./crawler.ts";
import type { Publisher } from "./types.ts";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean", short: "n", default: false },
    publisher: { type: "string", multiple: true },
    limit: { type: "string" },
  },
});
const [command, ...args] = positionals;
const dryRun = opts["dry-run"] ?? false;

if (!config.githubToken) console.warn("GITHUB_TOKEN non impostato: le API di GitHub hanno un limite di 60 richieste/ora");
if (!dryRun && !config.apiToken) {
  console.error("API_BEARER_TOKEN non impostato: serve per scrivere nell'API (oppure usa --dry-run)");
  process.exit(1);
}

async function selectPublishers(): Promise<Publisher[]> {
  if (opts.publisher?.length) {
    return Promise.all(opts.publisher.map(async (p) => toPublisher(await api.publisher(p))));
  }

  const catalogs = await api.catalogs().catch(() => []);
  if (catalogs.length > 0) {
    // Ogni catalogo come un publisher con le sue sorgenti (come ScanCatalog del Go).
    return catalogs.map((c) => ({
      id: c.id,
      kind: "catalog" as const,
      alternativeId: null,
      name: c.name,
      sources: c.sources.map((s) => ({ url: s.url, driver: (s.driver ?? "") as Publisher["sources"][number]["driver"], group: true })),
    }));
  }

  console.log("nessun catalogo: uso i publisher");
  const publishers = (await api.publishers()).map(toPublisher);
  return opts.limit ? publishers.slice(0, Number(opts.limit)) : publishers;
}

/**
 * Registra l'esecuzione nell'API (/v2/job-runs) per lo stato degli strumenti nel cruscotto;
 * non con --dry-run. JOB_TRIGGER dice chi l'ha avviata (nightly, manual…).
 */
async function tracked(job: JobName, crawler: Crawler, fn: () => Promise<void>) {
  const run = await startJobRun({
    apiBaseUrl: config.apiBaseUrl,
    token: dryRun ? undefined : config.apiToken,
    job,
    trigger: process.env.JOB_TRIGGER,
  });
  try {
    await fn();
  } catch (e) {
    await run.failed(e, { ...crawler.stats });
    throw e;
  }
  await run.succeeded({ ...crawler.stats });
}

async function crawl() {
  const crawler = new Crawler(dryRun);
  await tracked("crawler", crawler, async () => {
    const publishers = await selectPublishers();
    console.log(`publisher da scandire: ${publishers.length} (${publishers.reduce((n, p) => n + p.sources.length, 0)} sorgenti)`);

    for (const publisher of publishers) await crawler.scanPublisher(publisher);
    await crawler.drain();
    console.log(`\n${crawler.summary()}`);
  });
}

async function crawlSoftware(idOrUrl: string, publisherId: string) {
  const crawler = new Crawler(dryRun);
  await tracked("crawler-software", crawler, async () => {
    const id = idOrUrl.startsWith("http") ? new URL(idOrUrl).pathname.split("/").pop()! : idOrUrl;
    const software = await api.softwareById(id);
    const publisher = toPublisher(await api.publisher(publisherId));
    const url = software.url.replace(/\.git$/, "");

    await crawler.scanPublisher({ ...publisher, sources: [{ url, driver: "", group: false }] });
    await crawler.drain();
    console.log(`\n${crawler.summary()}`);
  });
}

switch (command) {
  case "crawl":
    await crawl();
    break;
  case "crawl-software":
    if (args.length !== 2) {
      console.error("uso: crawl-software <id|url> <publisher>");
      process.exit(1);
    }
    await crawlSoftware(args[0]!, args[1]!);
    break;
  default:
    console.log("uso: sw-crawler crawl [--publisher <id|IPA>]... [--limit N] [--dry-run]");
    console.log("     sw-crawler crawl-software <id|url> <publisher> [--dry-run]");
    process.exit(command ? 1 : 0);
}
