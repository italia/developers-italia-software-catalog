import { createHash, timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { problem } from "./problem.ts";

// Autenticazione provvisoria delle scritture v2: token statici in API_TOKENS (separati da
// virgola), passati come `Authorization: Bearer <token>`. Senza token configurati l'API è
// in sola lettura. Verrà sostituita da PASETO (client macchina) e dalle sessioni della
// dashboard (Fase 3 e Fase 6 di new-plan.md).
const digest = (value: string) => createHash("sha256").update(value).digest();

function configuredTokens(): Buffer[] {
  return (process.env.API_TOKENS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map(digest);
}

export const requireToken = createMiddleware(async (c, next) => {
  const tokens = configuredTokens();
  if (tokens.length === 0) {
    return problem(c, 401, "Unauthorized", "API in sola lettura: nessun token configurato (API_TOKENS)");
  }

  const header = c.req.header("Authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return problem(c, 401, "Unauthorized", "Serve un header Authorization: Bearer <token>");
  }

  // Confronto a tempo costante su digest di lunghezza fissa.
  const given = digest(token);
  if (!tokens.some((t) => timingSafeEqual(t, given))) {
    return problem(c, 401, "Unauthorized", "Token non valido");
  }

  await next();
});
