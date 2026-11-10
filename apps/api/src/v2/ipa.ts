import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../lib/db.ts";
import { problem } from "../lib/problem.ts";
import { rateLimit } from "../lib/rate-limit.ts";
import { validate } from "../lib/validate.ts";
import { findIpa, searchIpa } from "../services/ipa.ts";

// Ricerca nell'anagrafica IndicePA, pubblica (serve al form di onboarding). I dati sono
// open data; le PEC sono quelle pubblicate da IndicePA.
export const ipa = new Hono();

ipa.get(
  "/",
  rateLimit("ipa-search", 120, 60_000),
  validate("query", z.object({ q: z.string().trim().min(2).max(100), limit: z.coerce.number().int().min(1).max(25).optional() })),
  async (c) => {
    const { q, limit } = c.req.valid("query");
    return c.json({ data: await searchIpa(getDb(), q, limit) });
  },
);

ipa.get("/:ipa", async (c) => {
  const entity = await findIpa(getDb(), c.req.param("ipa"));
  if (!entity) return problem(c, 404, "Not Found", "Ente non trovato in IndicePA");
  return c.json(entity);
});
