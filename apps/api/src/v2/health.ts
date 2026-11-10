import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db.ts";
import { type AuthVars, requireUser } from "../lib/session.ts";
import { validate } from "../lib/validate.ts";
import { getHealth } from "../services/health.ts";

// Stato degli strumenti (utenti autenticati: i dettagli, come versioni e nomi degli
// indici, non sono pubblici). /v2/status resta il controllo pubblico per i load balancer.
export const health = new Hono<{ Variables: AuthVars }>();

health.get("/", requireUser, validate("query", z.object({ refresh: z.enum(["true", "false"]).optional() })), async (c) => {
  return c.json(await getHealth(getDb(), c.req.valid("query").refresh === "true"));
});
