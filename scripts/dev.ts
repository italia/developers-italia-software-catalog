#!/usr/bin/env bun
// Avvia tutto l'ambiente di sviluppo in un terminale: container (Postgres, OpenSearch,
// Mailpit), poi API, dashboard, catalogo pubblico e server MCP via HTTP, con i log
// prefissati per servizio. Ctrl+C ferma i processi; i container restano accesi
// (bun run infra:down per fermarli).
//
//   bun run dev                         tutto
//   bun run dev --only api,dashboard    solo alcuni servizi
//   bun run dev --skip mcp              tutti tranne alcuni
//   bun run dev --no-infra              senza toccare i container
//
// Un servizio la cui porta è già occupata (es. già avviato in un altro terminale) viene
// saltato. Il catalogo parte con VITE_USE_MOCK=false su OpenSearch e API locali.
import { type ChildProcess, spawn } from "node:child_process";
import { connect } from "node:net";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

const { values: opts } = parseArgs({
  options: {
    only: { type: "string" },
    skip: { type: "string" },
    "no-infra": { type: "boolean", default: false },
  },
});

const env = process.env;
const port = (name: string, fallback: number) => Number(env[name] ?? fallback);
const API_PORT = port("API_PORT", 3001);
const API_URL = `http://localhost:${API_PORT}/v2`;

interface Service {
  name: string;
  color: number;
  port: number;
  cmd: string[];
  env?: Record<string, string>;
  url: string;
}

// Dashboard e catalogo sono avviati nella loro cartella e non con `bun run --filter`, che
// ridisegna le righe con codici di controllo illeggibili quando l'output è prefissato.
const SERVICES: Service[] = [
  { name: "api", color: 36, port: API_PORT, cmd: ["bun", "run", "dev:api"], url: `${API_URL}/status` },
  { name: "dashboard", color: 35, port: 5173, cmd: ["bun", "run", "--cwd", "apps/dashboard", "dev"], url: "http://localhost:5173" },
  {
    name: "catalog",
    color: 33,
    port: 3000,
    cmd: ["bun", "run", "--cwd", "apps/catalog-website", "dev"],
    env: {
      VITE_ELASTICSEARCH_URL: env.VITE_ELASTICSEARCH_URL ?? `http://localhost:${port("OPENSEARCH_PORT", 9200)}`,
      VITE_USE_MOCK: env.VITE_USE_MOCK ?? "false",
      VITE_API_URL: env.VITE_API_URL ?? API_URL,
    },
    url: "http://localhost:3000",
  },
  { name: "mcp", color: 32, port: port("MCP_PORT", 3002), cmd: ["bun", "run", "dev:mcp"], url: `http://localhost:${port("MCP_PORT", 3002)}/mcp` },
];

const list = (s?: string) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
const only = list(opts.only);
const skip = list(opts.skip);
for (const n of [...only, ...skip]) {
  if (!SERVICES.some((s) => s.name === n)) {
    console.error(`servizio sconosciuto: ${n} (disponibili: ${SERVICES.map((s) => s.name).join(", ")})`);
    process.exit(1);
  }
}
const selected = SERVICES.filter((s) => (only.length ? only.includes(s.name) : true) && !skip.includes(s.name));

const tag = (name: string, color: number) => `\x1b[${color}m${name.padEnd(9)}\x1b[0m│`;
const say = (msg: string) => console.log(`${tag("dev", 90)} ${msg}`);

const isOpen = (p: number) =>
  new Promise<boolean>((resolve) => {
    const s = connect(p, "127.0.0.1");
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });

async function waitFor(what: string, check: () => Promise<boolean>, seconds: number) {
  for (let i = 0; i < seconds; i++) {
    if (await check()) return;
    await Bun.sleep(1000);
  }
  throw new Error(`${what} non risponde dopo ${seconds} s`);
}

const run = (cmd: string[]) => Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" }).exitCode === 0;
const dockerUp = () => Bun.spawnSync(["docker", "info"], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;

// --- container ------------------------------------------------------------------

async function infra() {
  if (!dockerUp()) {
    if (process.platform !== "darwin") throw new Error("Docker non è in esecuzione: avvialo e riprova");
    say("Docker non è in esecuzione: lo avvio");
    Bun.spawnSync(["open", "-a", "Docker"]);
    await waitFor("Docker", async () => dockerUp(), 120);
  }
  say("container: postgres, opensearch, mailpit");
  if (!run(["docker", "compose", "up", "-d"])) throw new Error("docker compose up non è riuscito");
  if (!run(["docker", "compose", "--profile", "mail", "up", "-d", "--wait", "mailpit"])) throw new Error("mailpit non è partito");
  const pgPort = port("POSTGRES_PORT", 5433);
  const osUrl = env.OPENSEARCH_URL ?? `http://localhost:${port("OPENSEARCH_PORT", 9200)}`;
  await waitFor("Postgres", () => isOpen(pgPort), 60);
  // OpenSearch risponde (anche 401) quando il nodo è su; serve qualche decina di secondi
  await waitFor("OpenSearch", () => fetch(osUrl, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false), 120);
  say("container pronti");
}

// --- processi -------------------------------------------------------------------

// Ogni servizio in un proprio gruppo di processi (detached): `bun run` avvia a sua volta
// vite, e fermare solo il primo processo lascerebbe vite orfano sulla porta. Alla fine si
// ferma l'intero gruppo (kill con il pid negativo).
const children: { svc: Service; proc: ChildProcess; done: Promise<number | null> }[] = [];
let stopping = false;

function pipe(stream: NodeJS.ReadableStream | null, prefix: string) {
  if (!stream) return;
  createInterface({ input: stream }).on("line", (line) => {
    if (line.trim()) console.log(`${prefix} ${line}`);
  });
}

async function start(svc: Service) {
  if (await isOpen(svc.port)) {
    say(`${svc.name}: porta ${svc.port} già occupata, lo considero già avviato (${svc.url})`);
    return false;
  }
  const [cmd, ...args] = svc.cmd;
  const proc = spawn(cmd!, args, {
    env: { ...env, ...svc.env, FORCE_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const done = new Promise<number | null>((resolve) => proc.on("exit", (code) => resolve(code)));
  children.push({ svc, proc, done });
  const prefix = tag(svc.name, svc.color);
  pipe(proc.stdout, prefix);
  pipe(proc.stderr, prefix);
  void done.then((code) => {
    if (!stopping) say(`\x1b[31m${svc.name} si è fermato (codice ${code})\x1b[0m; gli altri servizi restano attivi`);
  });
  return true;
}

const killGroup = (proc: ChildProcess, signal: NodeJS.Signals) => {
  try {
    if (proc.pid) process.kill(-proc.pid, signal);
  } catch {
    // gruppo già terminato
  }
};

async function stop() {
  if (stopping) return;
  stopping = true;
  say("fermo i servizi (i container restano accesi: bun run infra:down)");
  for (const { proc } of children) killGroup(proc, "SIGTERM");
  await Promise.race([Promise.all(children.map((c) => c.done)), Bun.sleep(5000)]);
  for (const { proc } of children) killGroup(proc, "SIGKILL");
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

try {
  if (!opts["no-infra"]) await infra();

  // Prima l'API: dashboard, catalogo e MCP la usano
  const api = selected.find((s) => s.name === "api");
  if (api) {
    await start(api);
    await waitFor("API", () => fetch(api.url, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false), 60);
  }
  for (const svc of selected.filter((s) => s.name !== "api")) await start(svc);

  say("pronti:");
  for (const s of selected) say(`  ${s.name.padEnd(9)} ${s.url}`);
  if (!opts["no-infra"]) say(`  mailpit   http://localhost:${port("MAILPIT_UI_PORT", 8025)}`);
  say("Ctrl+C per fermare");
  if (children.length === 0) process.exit(0);
} catch (e) {
  say(`\x1b[31m${(e as Error).message}\x1b[0m`);
  await stop();
}
