import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { fromPrismaError, HttpError, problem } from "./lib/problem.ts";
import { v1 } from "./v1";
import { v2 } from "./v2";

// /v2: API principale del nuovo catalogo.
// /v1: compatibilità con developers-italia-api (open-catalog-api) durante la migrazione.
export const app = new Hono();

if (process.env.NODE_ENV !== "test") app.use(logger());
// CORS_ORIGINS: origini ammesse separate da virgola (es. il catalogo pubblico); senza, tutte.
// "*" va passato come stringa: in una lista Hono lo confronterebbe con l'origine come testo.
const corsOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigins.length && !corsOrigins.includes("*") ? corsOrigins : "*" }));

app.route("/v2", v2);
app.route("/v1", v1);

app.notFound((c) => problem(c, 404, "Not Found", `${c.req.method} ${c.req.path} non esiste`));

app.onError((err, c) => {
  const known = err instanceof HttpError ? err : fromPrismaError(err);
  if (known) return problem(c, known.status, known.title, known.detail);
  console.error(err);
  return problem(c, 500, "Internal Server Error");
});

export default app;
