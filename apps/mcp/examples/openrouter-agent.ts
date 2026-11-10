#!/usr/bin/env bun
// Esempio: un assistente su OpenRouter (https://openrouter.ai) che usa il server MCP del
// catalogo per trovare software a riuso. Avvia il server MCP come un client qualsiasi
// (stdio, oppure un server remoto con --http), passa i suoi strumenti al modello nel
// formato OpenAI che OpenRouter accetta, ed esegue le chiamate agli strumenti che il
// modello chiede finché non arriva la risposta.
//
//   OPENROUTER_API_KEY=… bun examples/openrouter-agent.ts "Un comune cerca un software per il protocollo informatico"
//
// Opzioni:
//   --model <id>        modello OpenRouter (default OPENROUTER_MODEL o openai/gpt-4o-mini)
//   --prompt            usa il prompt del server find_reusable_software invece della domanda così com'è
//   --http <url>        server MCP remoto (es. http://localhost:3002/mcp) invece di avviarlo su stdio
//   --max-steps <n>     giri di chiamate agli strumenti al massimo (default 8)
//   --verbose           stampa anche i risultati degli strumenti
//
// Variabili: OPENROUTER_API_KEY (obbligatoria), OPENROUTER_MODEL, OPENROUTER_BASE_URL
// (default https://openrouter.ai/api/v1), API_BASEURL (l'API del catalogo per il server stdio).
// Ogni esecuzione è una chiamata a pagamento a OpenRouter.
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const DEFAULT_MODEL = "openai/gpt-4o-mini";
const MAX_TOOL_OUTPUT = 20_000;

// --- formato chat/completions (OpenAI, come lo accetta OpenRouter) --------------

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
interface ChatResponse {
  choices: { message: { content: string | null; tool_calls?: ToolCall[] }; finish_reason: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
}
export type Chat = (body: { messages: Message[]; tools: unknown[] }) => Promise<ChatResponse>;

export function openRouterChat(opts: { apiKey: string; model: string; baseUrl?: string }): Chat {
  const base = (opts.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  return async ({ messages, tools }) => {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        // Attribuzione facoltativa dell'app su OpenRouter
        "HTTP-Referer": "https://github.com/italia/developers-italia-software-catalog",
        "X-OpenRouter-Title": "Catalogo del software a riuso - esempio MCP",
      },
      body: JSON.stringify({ model: opts.model, messages, tools, tool_choice: "auto", max_tokens: 4096 }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
    return (await res.json()) as ChatResponse;
  };
}

// --- dagli strumenti MCP alle funzioni del modello -------------------------------

export async function toolsFor(client: Client) {
  const { tools } = await client.listTools();
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema },
  }));
}

/** Il risultato di uno strumento MCP come testo per il modello: il JSON e i collegamenti alle schede. */
async function callTool(client: Client, call: ToolCall): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
  } catch {
    return `Errore: argomenti non in JSON valido (${call.function.arguments.slice(0, 200)})`;
  }
  try {
    const r = await client.callTool({ name: call.function.name, arguments: args });
    const parts = (r.content as { type: string; text?: string; uri?: string; name?: string }[]).map((c) =>
      c.type === "text" ? c.text : c.type === "resource_link" ? `Scheda: ${c.name} → ${c.uri}` : "",
    );
    const text = `${r.isError ? "Errore dello strumento: " : ""}${parts.filter(Boolean).join("\n")}`;
    return text.length > MAX_TOOL_OUTPUT ? `${text.slice(0, MAX_TOOL_OUTPUT)}\n…(troncato)` : text;
  } catch (e) {
    return `Errore: ${(e as Error).message}`;
  }
}

export interface RunResult {
  answer: string;
  toolCalls: { name: string; arguments: string }[];
  usage: { promptTokens: number; completionTokens: number; cost: number | null };
  stoppedEarly: boolean;
}

/** Il ciclo dell'assistente: modello → strumenti MCP → modello, finché non risponde. */
export async function runAgent(opts: {
  client: Client;
  chat: Chat;
  firstMessage: string;
  maxSteps?: number;
  onToolCall?: (name: string, args: string, result: string) => void;
}): Promise<RunResult> {
  const tools = await toolsFor(opts.client);
  const messages: Message[] = [
    {
      role: "system",
      content: `${opts.client.getInstructions() ?? ""}\n\nRispondi in italiano. Usa gli strumenti del catalogo invece di affidarti alla memoria, e cita i link che restituiscono.`,
    },
    { role: "user", content: opts.firstMessage },
  ];
  const result: RunResult = { answer: "", toolCalls: [], usage: { promptTokens: 0, completionTokens: 0, cost: null }, stoppedEarly: false };

  for (let step = 0; step <= (opts.maxSteps ?? 8); step++) {
    const res = await opts.chat({ messages, tools });
    result.usage.promptTokens += res.usage?.prompt_tokens ?? 0;
    result.usage.completionTokens += res.usage?.completion_tokens ?? 0;
    if (res.usage?.cost !== undefined) result.usage.cost = (result.usage.cost ?? 0) + res.usage.cost;

    const choice = res.choices[0];
    if (!choice) throw new Error("risposta senza choices");
    const calls = choice.message.tool_calls ?? [];
    if (calls.length === 0) {
      result.answer = choice.message.content ?? "";
      if (choice.finish_reason === "length") result.answer += "\n\n(risposta tagliata: limite di token raggiunto)";
      return result;
    }

    messages.push({ role: "assistant", content: choice.message.content, tool_calls: calls });
    // Le chiamate di uno stesso giro sono indipendenti: in parallelo, risultati nell'ordine delle chiamate
    const outputs = await Promise.all(calls.map((c) => callTool(opts.client, c)));
    calls.forEach((c, i) => {
      result.toolCalls.push({ name: c.function.name, arguments: c.function.arguments });
      opts.onToolCall?.(c.function.name, c.function.arguments, outputs[i]!);
      messages.push({ role: "tool", tool_call_id: c.id, content: outputs[i]! });
    });
  }
  result.stoppedEarly = true;
  result.answer = "(nessuna risposta: raggiunto il numero massimo di giri di strumenti; aumenta --max-steps)";
  return result;
}

// --- riga di comando -------------------------------------------------------------

if (import.meta.main) {
  const { values: opts, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      model: { type: "string" },
      prompt: { type: "boolean", default: false },
      http: { type: "string" },
      "max-steps": { type: "string", default: "8" },
      verbose: { type: "boolean", default: false },
    },
  });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY non impostata: crea una chiave su https://openrouter.ai/keys e mettila nel .env");
    process.exit(1);
  }
  const question = positionals.join(" ").trim() || "Un comune cerca un software a riuso per il protocollo informatico: cosa c'è nel catalogo?";
  const model = opts.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  const client = new Client({ name: "openrouter-example", version: "0.1.0" });
  const root = join(import.meta.dir, "..");
  await client.connect(
    opts.http
      ? new StreamableHTTPClientTransport(new URL(opts.http))
      : new StdioClientTransport({
          command: process.execPath, // bun
          args: [join(root, "src", "stdio.ts")],
          env: { ...process.env, API_BASEURL: process.env.API_BASEURL ?? "http://localhost:3001/v2" } as Record<string, string>,
          stderr: "ignore",
        }),
  );

  try {
    // Con --prompt la prima domanda è il prompt guidato del server
    const firstMessage = opts.prompt
      ? ((await client.getPrompt({ name: "find_reusable_software", arguments: { need: question } })).messages[0]?.content as { text: string })
          .text
      : question;

    console.error(`modello ${model} · server MCP ${opts.http ?? "stdio"}\n`);
    const r = await runAgent({
      client,
      chat: openRouterChat({ apiKey, model, baseUrl: process.env.OPENROUTER_BASE_URL }),
      firstMessage,
      maxSteps: Number(opts["max-steps"]),
      onToolCall: (name, args, out) => {
        console.error(`→ ${name} ${args}`);
        if (opts.verbose) console.error(`${out.slice(0, 2000)}\n`);
      },
    });
    console.log(`\n${r.answer}\n`);
    const cost = r.usage.cost !== null ? `, costo ${r.usage.cost.toFixed(4)} $` : "";
    console.error(`${r.toolCalls.length} chiamate agli strumenti, token ${r.usage.promptTokens} in / ${r.usage.completionTokens} out${cost}`);
  } finally {
    await client.close();
  }
}
