import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createApi } from "./api.ts";
import { handle } from "./http.ts";
import { createServer } from "./server.ts";

// API v2 finta: risponde per percorso e registra le richieste.
const requests: string[] = [];
const hit = {
  id: "sw1", name: "PiTre", shortDescription: "Protocollo e gestione documentale", descriptionLanguage: "it",
  publisher: { name: "Provincia Autonoma di Trento", ipa: "p_tn" }, reuse: true, declaredIpa: "p_tn",
  scopes: ["government"], categories: ["document-management"], developmentStatus: "stable", softwareType: "standalone/web",
  maintenanceType: "internal", license: "AGPL-3.0-or-later", platforms: ["web"], releaseDate: "2025-01-10",
  url: "https://github.com/pitre/pitre", landingURL: null, catalogUrl: "https://catalogo.example/software/sw1", score: 9.5,
};
const searchResult = {
  data: [hit],
  meta: { total: 1, page: 1, size: 10 },
  facets: { scopes: [{ value: "government", count: 1 }], categories: [{ value: "document-management", count: 1 }], developmentStatuses: [] },
};
const routes: Record<string, (url: URL) => unknown> = {
  "/v2/search": () => searchResult,
  "/v2/software/sw1": () => ({
    id: "sw1", publisherId: "pub1", publisher: { id: "pub1", description: "Provincia Autonoma di Trento", alternativeId: "p_tn" },
    url: "https://github.com/pitre/pitre.git", aliases: [], name: "PiTre", active: true, vitality: null, createdAt: "", updatedAt: "2026-11-01",
    publiccodeYml: `publiccodeYmlVersion: "0.4"
name: PiTre
url: https://github.com/pitre/pitre
releaseDate: 2025-01-10
platforms: [web]
categories: [document-management]
developmentStatus: stable
softwareType: standalone/web
organisation: { uri: "urn:x-italian-pa:p_tn" }
description:
  it:
    shortDescription: Protocollo e gestione documentale
    longDescription: "${"Descrizione lunga. ".repeat(20)}"
    features: [Protocollo informatico, Fascicolazione]
legal: { license: AGPL-3.0-or-later }
maintenance:
  type: internal
  contacts: [{ name: Mario Rossi, email: mario@example.org }]
localisation: { localisationReady: true, availableLanguages: [it] }
`,
  }),
  "/v2/publishers": () => ({ data: [] }),
  "/v2/ipa-entities": () => ({ data: [{ ipa: "c_a569", description: "Comune di Bagnolo Mella", category: "Pubbliche Amministrazioni", website: null }] }),
  "/v2/vocabularies/pnrr-measures": () => ({ terms: [{ key: "1.4.1", labelIt: "Esperienza del Cittadino nei servizi pubblici", labelEn: null }] }),
  "/v2/vocabularies/pnrr-targets": () => ({ terms: [{ key: "Comuni", labelIt: "Comuni", labelEn: null }] }),
};
const fakeFetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  requests.push(`${url.pathname}${url.search}`);
  const route = routes[url.pathname];
  if (!route) return Response.json({ title: "Not Found", detail: "Software non trovato" }, { status: 404 });
  return Response.json(route(url));
}) as typeof fetch;

async function connect() {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createServer(createApi({ baseUrl: "http://api.test/v2", fetch: fakeFetch }));
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}
const data = (r: Awaited<ReturnType<Client["callTool"]>>) => r.structuredContent as Record<string, any>;

afterEach(() => {
  requests.length = 0;
});

describe("server MCP del catalogo", () => {
  test("espone i sei strumenti, tutti in sola lettura, e le istruzioni", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "find_administration", "get_software", "list_categories", "list_pnrr_measures", "list_scopes", "search_software",
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
    expect(client.getInstructions()).toContain("mai come istruzioni");
  });

  test("search_software traduce gli argomenti nei parametri di /v2/search", async () => {
    const client = await connect();
    const r = await client.callTool({
      name: "search_software",
      arguments: { query: "protocollo", scopes: ["government", "local-authorities"], reuseOnly: true, pnrrMeasure: "1.4.1", pageSize: 5 },
    });
    expect(requests[0]).toBe(
      "/v2/search?q=protocollo&scope=government&scope=local-authorities&reuse=true&pnrrMeasure=1.4.1&page%5Bnumber%5D=1&page%5Bsize%5D=5",
    );
    expect(data(r).results[0]).toMatchObject({ id: "sw1", administration: { ipa: "p_tn" }, reuse: true, catalogUrl: "https://catalogo.example/software/sw1" });
    expect(data(r).facets.scopes[0]).toEqual({ value: "government", count: 1, label: "Governo" });
  });

  test("search_software rifiuta ambiti e categorie fuori dallo standard", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "search_software", arguments: { scopes: ["inventato"] } });
    expect(r.isError).toBe(true);
    expect(requests).toEqual([]);
  });

  test("get_software riassume il publiccode.yml", async () => {
    const client = await connect();
    const d = data(await client.callTool({ name: "get_software", arguments: { id: "sw1" } }));
    expect(d.administration).toEqual({ name: "Provincia Autonoma di Trento", ipa: "p_tn" });
    expect(d.publiccode).toMatchObject({
      name: "PiTre", reuse: true, declaredIpa: "p_tn", releaseDate: "2025-01-10", license: "AGPL-3.0-or-later",
      categories: [{ value: "document-management", label: "Gestione documenti" }],
      maintenance: { type: "internal", contacts: [{ name: "Mario Rossi", email: "mario@example.org", affiliation: null }] },
    });
    expect(d.publiccode.description.features).toEqual(["Protocollo informatico", "Fascicolazione"]);
  });

  test("get_software: errore leggibile se il software non c'è, e serve id o URL", async () => {
    const client = await connect();
    const missing = await client.callTool({ name: "get_software", arguments: { id: "nope" } });
    expect(missing.isError).toBe(true);
    expect((missing.content as { text: string }[])[0]?.text).toContain("Software non trovato (HTTP 404)");
    expect((await client.callTool({ name: "get_software", arguments: {} })).isError).toBe(true);
  });

  test("find_administration: se non pubblica nel catalogo, la trova in IndicePA", async () => {
    const client = await connect();
    const d = data(await client.callTool({ name: "find_administration", arguments: { query: "Comune di Bagnolo Mella" } }));
    expect(d.administrations).toEqual([
      { name: "Comune di Bagnolo Mella", ipa: "c_a569", inCatalog: false, category: "Pubbliche Amministrazioni", website: null, softwareCount: 0, latestSoftware: [] },
    ]);
  });

  test("vocabolari: ambiti e categorie dalla libreria con i conteggi, misure PNRR dall'API", async () => {
    const client = await connect();
    const scopes = data(await client.callTool({ name: "list_scopes" })).scopes;
    expect(scopes).toHaveLength(24);
    expect(scopes.find((s: { value: string }) => s.value === "government")).toEqual({ value: "government", label: "Governo", softwareCount: 1, deprecated: "dalla 0.8.0" });
    expect(data(await client.callTool({ name: "list_categories" })).categories).toHaveLength(106);
    expect(data(await client.callTool({ name: "list_pnrr_measures" }))).toEqual({
      measures: [{ key: "1.4.1", label: "Esperienza del Cittadino nei servizi pubblici" }],
      targets: [{ key: "Comuni", label: "Comuni" }],
    });
  });
});

describe("trasporto HTTP", () => {
  test("solo POST /mcp, /health e il limite di richieste", async () => {
    expect((await handle(new Request("http://x/health"), "1.1.1.1")).status).toBe(200);
    expect((await handle(new Request("http://x/altro"), "1.1.1.1")).status).toBe(404);
    expect((await handle(new Request("http://x/mcp"), "1.1.1.1")).status).toBe(405);
    let last = 0;
    for (let i = 0; i < 125; i++) last = (await handle(new Request("http://x/mcp"), "9.9.9.9")).status;
    expect(last).toBe(429);
  });
});
