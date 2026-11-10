#!/usr/bin/env bun
// Server MCP remoto su Streamable HTTP, in sola lettura e senza stato (un server e un
// trasporto per richiesta): POST /mcp. Senza autenticazione, con un limite di richieste
// per IP; dietro un proxy, TRUST_PROXY=true per leggere X-Forwarded-For.
//   API_BASEURL=https://… MCP_PORT=3002 bun src/http.ts
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createApi } from "./api.ts";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.ts";

const baseUrl = process.env.API_BASEURL ?? "http://localhost:3001/v2";
const port = Number(process.env.MCP_PORT ?? 3002);
const api = createApi({ baseUrl });

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = Number(process.env.MCP_RATE_LIMIT ?? 120);
const buckets = new Map<string, { start: number; count: number }>();
function limited(ip: string) {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.start > WINDOW_MS) {
    buckets.set(ip, { start: now, count: 1 });
    return false;
  }
  return ++b.count > MAX_PER_WINDOW;
}

export async function handle(req: Request, ip: string): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === "/health") return Response.json({ status: "ok", name: SERVER_NAME, version: SERVER_VERSION });
  if (url.pathname !== "/mcp") return new Response("Not Found", { status: 404 });
  if (limited(ip)) return new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "60" } });
  // Senza stato: niente sessioni, niente stream lato server (GET) né chiusura (DELETE)
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });

  const server = createServer(api);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void server.close();
  }
}

if (import.meta.main) {
  Bun.serve({
    port,
    fetch(req, srv) {
      const forwarded = process.env.TRUST_PROXY === "true" ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
      return handle(req, forwarded || srv.requestIP(req)?.address || "unknown");
    },
  });
  console.error(`MCP del catalogo su http://localhost:${port}/mcp, API ${baseUrl}`);
}
