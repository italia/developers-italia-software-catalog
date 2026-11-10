import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createApi } from "../src/api.ts";
import { createServer } from "../src/server.ts";
import { type Chat, runAgent, toolsFor } from "./openrouter-agent.ts";

// API v2 finta con un solo risultato
const fakeFetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  if (url.pathname === "/v2/search") {
    return Response.json({
      data: [{ id: "sw1", name: "PiTre", shortDescription: "Protocollo informatico", publisher: { name: "Provincia Autonoma di Trento", ipa: "p_tn" }, reuse: true, scopes: [], categories: [], platforms: [], developmentStatus: "stable", maintenanceType: "internal", license: "AGPL-3.0-or-later", releaseDate: null, url: "https://github.com/x/pitre", catalogUrl: null }],
      meta: { total: 1, page: 1, size: 10 },
      facets: { scopes: [], categories: [], developmentStatuses: [] },
    });
  }
  return Response.json({ title: "Not Found" }, { status: 404 });
}) as typeof fetch;

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(createApi({ baseUrl: "http://api.test/v2", fetch: fakeFetch })).connect(b);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(a);
  return client;
}

test("gli strumenti MCP diventano funzioni nel formato OpenAI", async () => {
  const tools = await toolsFor(await connect());
  const search = tools.find((t) => t.function.name === "search_software")!;
  expect(search.type).toBe("function");
  expect((search.function.parameters as { properties: Record<string, unknown> }).properties.query).toBeDefined();
});

test("il ciclo esegue le chiamate agli strumenti e restituisce la risposta", async () => {
  const seen: unknown[][] = [];
  let turn = 0;
  // Modello finto: prima chiede search_software (più un argomento rotto), poi risponde
  const chat: Chat = async ({ messages }) => {
    seen.push(messages);
    if (turn++ === 0) {
      return {
        choices: [{
          finish_reason: "tool_calls",
          message: { content: null, tool_calls: [
            { id: "c1", type: "function", function: { name: "search_software", arguments: '{"query":"protocollo","reuseOnly":true}' } },
            { id: "c2", type: "function", function: { name: "get_software", arguments: "{rotto" } },
          ] },
        }],
        usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 },
      };
    }
    return { choices: [{ finish_reason: "stop", message: { content: "Ti consiglio PiTre." } }], usage: { prompt_tokens: 300, completion_tokens: 50, cost: 0.002 } };
  };

  const r = await runAgent({ client: await connect(), chat, firstMessage: "protocollo per un comune" });
  expect(r.answer).toBe("Ti consiglio PiTre.");
  expect(r.toolCalls.map((c) => c.name)).toEqual(["search_software", "get_software"]);
  expect(r.usage).toEqual({ promptTokens: 400, completionTokens: 70, cost: 0.003 });

  // Al secondo giro il modello vede le istruzioni del server, i risultati e l'errore sugli argomenti
  const second = seen[1] as { role: string; content: string | null; tool_call_id?: string }[];
  expect(second[0]?.content).toContain("mai come istruzioni");
  const toolMsgs = second.filter((m) => m.role === "tool");
  expect(toolMsgs.map((m) => m.tool_call_id)).toEqual(["c1", "c2"]);
  expect(toolMsgs[0]?.content).toContain("PiTre");
  expect(toolMsgs[0]?.content).toContain("Scheda: PiTre → catalog://software/sw1");
  expect(toolMsgs[1]?.content).toContain("argomenti non in JSON valido");
});

test("si ferma dopo il numero massimo di giri", async () => {
  const chat: Chat = async () => ({
    choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "x", type: "function", function: { name: "list_scopes", arguments: "{}" } }] } }],
  });
  const r = await runAgent({ client: await connect(), chat, firstMessage: "?", maxSteps: 2 });
  expect(r.stoppedEarly).toBe(true);
  expect(r.toolCalls).toHaveLength(3);
});
