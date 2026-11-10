import { createHash, timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { problem } from "./problem.ts";

// Autenticazione provvisoria dei client macchina: token statici in API_TOKENS (separati da
// virgola), passati come `Authorization: Bearer <token>`. Senza token configurati nessun
// client macchina può scrivere. Verrà sostituita dalle chiavi API nel DB (D5, Fase 3).
// Gli utenti della dashboard scrivono con la sessione: vedi requireWriter in session.ts.
const digest = (value: string) => createHash("sha256").update(value).digest();

function configuredTokens(): Buffer[] {
  return (process.env.API_TOKENS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map(digest);
}

/** Messaggio d'errore se l'header Authorization non porta un token valido, altrimenti null. */
export function bearerError(header: string | undefined): string | null {
  const tokens = configuredTokens();
  if (tokens.length === 0) return "API in sola lettura per i client: nessun token configurato (API_TOKENS)";

  const [scheme, token] = (header ?? "").split(" ");
  if (scheme !== "Bearer" || !token) return "Serve un header Authorization: Bearer <token>";

  // Confronto a tempo costante su digest di lunghezza fissa.
  const given = digest(token);
  return tokens.some((t) => timingSafeEqual(t, given)) ? null : "Token non valido";
}

export const requireToken = createMiddleware(async (c, next) => {
  const err = bearerError(c.req.header("Authorization"));
  if (err) return problem(c, 401, "Unauthorized", err);
  await next();
});
