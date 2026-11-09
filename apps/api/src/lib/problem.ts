import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Risposta di errore in formato RFC 9457 (`application/problem+json`), come l'API Go. */
export function problem(c: Context, status: ContentfulStatusCode, title: string, detail?: string, extra?: object) {
  return c.body(JSON.stringify({ title, detail, status, ...extra }), status, {
    "Content-Type": "application/problem+json",
  });
}

/** Errore applicativo che il gestore globale converte in problem+json. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(detail ?? title);
  }
}

/** Converte i codici d'errore noti di Prisma in HttpError. */
export function fromPrismaError(e: unknown): HttpError | undefined {
  const code = (e as { code?: string })?.code;
  if (code === "P2002") {
    const target = (e as { meta?: { target?: string[] | string } }).meta?.target;
    return new HttpError(409, "Conflict", `Esiste già una risorsa con lo stesso valore${target ? ` (${target})` : ""}`);
  }
  if (code === "P2025") return new HttpError(404, "Not Found", "Risorsa non trovata");
  if (code === "P2003") return new HttpError(422, "Unprocessable Entity", "Riferimento a una risorsa che non esiste (es. publisherId)");
  return undefined;
}
