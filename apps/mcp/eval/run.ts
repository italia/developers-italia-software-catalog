#!/usr/bin/env bun
// Valutazione della ricerca del server MCP: per ogni caso di cases.json chiama
// search_software (attraverso il server MCP, come un client, contro l'API v2 vera) e
// controlla se i software attesi compaiono nei primi k risultati.
//
//   API_BASEURL=http://localhost:3001/v2 bun eval/run.ts [--json] [--min-pass 80]
//
// Misure: casi superati (almeno minHits attesi nei primi k), recall@k (attesi trovati su
// attesi), MRR (1/posizione del primo atteso). Valuta lo strato di ricerca, che è
// deterministico e gratuito; la scelta degli argomenti da parte di un modello è fuori.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createApi } from "../src/api.ts";
import { createServer } from "../src/server.ts";

interface Expected {
  name: string;
  ipa: string | null;
}
interface Case {
  id: string;
  variant?: string;
  request: string;
  search: Record<string, unknown>;
  expected: Expected[];
  k: number;
  minHits: number;
}
interface Hit {
  name: string;
  administration: { ipa: string | null } | null;
}

const { values: opts } = parseArgs({ options: { json: { type: "boolean", default: false }, "min-pass": { type: "string" } } });
const cases = (JSON.parse(readFileSync(join(import.meta.dir, "cases.json"), "utf8")) as { cases: Case[] }).cases;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const matches = (e: Expected, h: Hit) => norm(e.name) === norm(h.name) && (e.ipa === null || e.ipa === h.administration?.ipa);

export function score(c: Case, results: Hit[]) {
  const top = results.slice(0, c.k);
  const found = c.expected.filter((e) => top.some((h) => matches(e, h)));
  const firstRank = top.findIndex((h) => c.expected.some((e) => matches(e, h)));
  return {
    id: c.id,
    passed: found.length >= c.minHits,
    hits: found.length,
    recall: found.length / c.expected.length,
    reciprocalRank: firstRank < 0 ? 0 : 1 / (firstRank + 1),
    missing: c.expected.filter((e) => !found.includes(e)).map((e) => e.name),
    top: top.map((h) => h.name),
  };
}

if (import.meta.main) {
  const api = createApi({ baseUrl: process.env.API_BASEURL ?? "http://localhost:3001/v2" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(api).connect(serverSide);
  const client = new Client({ name: "eval", version: "0" });
  await client.connect(clientSide);

  const rows = [];
  for (const c of cases) {
    const r = await client.callTool({ name: "search_software", arguments: { ...c.search, pageSize: Math.min(c.k, 20) } });
    if (r.isError) throw new Error(`${c.id}: ${(r.content as { text: string }[])[0]?.text}`);
    rows.push(score(c, (r.structuredContent as { results: Hit[] }).results));
  }
  await client.close();

  const n = rows.length;
  const summary = {
    cases: n,
    passed: rows.filter((r) => r.passed).length,
    passRate: Math.round((rows.filter((r) => r.passed).length / n) * 100),
    meanRecall: Number((rows.reduce((s, r) => s + r.recall, 0) / n).toFixed(2)),
    mrr: Number((rows.reduce((s, r) => s + r.reciprocalRank, 0) / n).toFixed(2)),
  };
  if (opts.json) console.log(JSON.stringify({ summary, rows }, null, 2));
  else {
    for (const r of rows) {
      console.log(`${r.passed ? "ok  " : "NO  "} ${r.id.padEnd(22)} recall ${r.recall.toFixed(2)}  rr ${r.reciprocalRank.toFixed(2)}${r.missing.length ? `  mancano: ${r.missing.join(", ")}` : ""}`);
      if (!r.passed) console.log(`      primi risultati: ${r.top.join(" | ") || "(nessuno)"}`);
    }
    console.log(`\n${summary.passed}/${summary.cases} casi superati (${summary.passRate}%), recall media ${summary.meanRecall}, MRR ${summary.mrr}`);
  }
  if (opts["min-pass"] && summary.passRate < Number(opts["min-pass"])) process.exit(1);
}
