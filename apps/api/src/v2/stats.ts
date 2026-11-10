import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db.ts";
import { type AuthVars, requireUser } from "../lib/session.ts";
import { validate } from "../lib/validate.ts";
import { getStats } from "../services/stats.ts";

// Statistiche per il cruscotto della dashboard (utenti autenticati). In cache 5 minuti;
// refresh=true le ricalcola.
export const stats = new Hono<{ Variables: AuthVars }>();

stats.get(
  "/",
  requireUser,
  validate(
    "query",
    z.object({
      interval: z.enum(["week", "month", "year"]).default("month"),
      refresh: z.enum(["true", "false"]).optional(),
    }),
  ),
  async (c) => {
    const { interval, refresh } = c.req.valid("query");
    return c.json(await getStats(getDb(), interval, refresh === "true"));
  },
);
