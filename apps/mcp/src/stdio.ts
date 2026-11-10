#!/usr/bin/env bun
// Server MCP in locale, su stdin/stdout (Claude Desktop, Claude Code, MCP Inspector…).
//   API_BASEURL=https://… bun src/stdio.ts
// stdout è il canale del protocollo: i log vanno su stderr.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApi } from "./api.ts";
import { createServer } from "./server.ts";

const baseUrl = process.env.API_BASEURL ?? "http://localhost:3001/v2";
const server = createServer(createApi({ baseUrl }));
await server.connect(new StdioServerTransport());
console.error(`MCP del catalogo su stdio, API ${baseUrl}`);
