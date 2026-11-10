import { Hono } from "hono";
import { z } from "zod";
import { rateLimit } from "../lib/rate-limit.ts";
import { problem } from "../lib/problem.ts";
import { searchSoftware } from "../services/search.ts";

// GET /v2/search: ricerca pubblica nel catalogo, con i filtri del catalogo e i conteggi
// per ambito, categoria e stato. I parametri ripetibili accettano anche valori separati
// da virgola (?scope=government,local-authorities).
export const search = new Hono();

const list = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) =>
    (Array.isArray(v) ? v : v ? [v] : [])
      .flatMap((s) => s.split(","))
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50),
  );
const text = (max: number) => z.string().trim().min(1).max(max).optional();

export const searchQuery = z.object({
  q: text(200),
  scope: list,
  category: list,
  developmentStatus: list,
  platform: list,
  reuse: z.enum(["true", "false"]).optional(),
  pnrrMeasure: text(20),
  pnrrTarget: text(100),
  publisher: text(50),
  license: text(100),
  "page[number]": z.coerce.number().int().min(1).max(1000).default(1),
  "page[size]": z.coerce.number().int().min(1).max(50).default(10),
});

search.get("/", rateLimit("search", 120, 60_000), async (c) => {
  // I parametri ripetuti (scope=a&scope=b) arrivano come lista solo con queries()
  const raw: Record<string, string | string[]> = { ...c.req.query() };
  for (const k of ["scope", "category", "developmentStatus", "platform"]) {
    const all = c.req.queries(k);
    if (all && all.length > 1) raw[k] = all;
  }
  const parsed = searchQuery.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return problem(c, 422, "Unprocessable Entity", "Parametri di ricerca non validi", { issues });
  }
  const q = parsed.data;
  c.header("Cache-Control", "public, max-age=60");
  return c.json(
    await searchSoftware({
      q: q.q,
      scopes: q.scope,
      categories: q.category,
      developmentStatuses: q.developmentStatus,
      platforms: q.platform,
      reuse: q.reuse === undefined ? undefined : q.reuse === "true",
      pnrrMeasure: q.pnrrMeasure,
      pnrrTarget: q.pnrrTarget,
      publisher: q.publisher,
      license: q.license,
      page: q["page[number]"],
      size: q["page[size]"],
    }),
  );
});
