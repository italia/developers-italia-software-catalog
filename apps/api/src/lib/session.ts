import { createHash, randomBytes } from "node:crypto";
import type { DashboardUserDto } from "@sw-catalog/shared";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { bearerError } from "./auth.ts";
import { getDb } from "./db.ts";
import { env } from "./env.ts";
import { problem } from "./problem.ts";

// Sessioni della dashboard (magic link, Fase 6): il cookie contiene un token casuale,
// il DB solo il suo hash. Ogni richiesta verifica la sessione nel DB, così logout e
// disattivazione dell'utente valgono subito.

export const SESSION_COOKIE = "sw_session";

export type AuthVars = { user: DashboardUserDto | null; sessionId: string | null };

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const secureCookie = () => env.dashboardUrl().startsWith("https://");

export function setSessionCookie(c: Context, token: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export const clearSessionCookie = (c: Context) => deleteCookie(c, SESSION_COOKIE, { path: "/", secure: secureCookie() });

/** Legge la sessione, se c'è, e mette l'utente in c.var.user. Non blocca mai. */
export const loadSession = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  c.set("user", null);
  c.set("sessionId", null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = getDb();
    const session = await db.dashboardSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    const now = new Date();
    if (session && !session.revokedAt && session.expiresAt > now && session.user.active) {
      c.set("user", { id: session.user.id, email: session.user.email, role: session.user.role });
      c.set("sessionId", session.id);
      // lastSeenAt al massimo ogni 5 minuti, per non scrivere a ogni richiesta.
      if (!session.lastSeenAt || now.getTime() - session.lastSeenAt.getTime() > 5 * 60_000) {
        await db.dashboardSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
      }
    }
  }
  await next();
});

export const requireUser = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  if (!c.get("user")) return problem(c, 401, "Unauthorized", "Serve l'accesso alla dashboard");
  await next();
});

export const requireAdmin = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  const user = c.get("user");
  if (!user) return problem(c, 401, "Unauthorized", "Serve l'accesso alla dashboard");
  if (user.role !== "ADMIN") return problem(c, 403, "Forbidden", "Operazione riservata agli amministratori");
  await next();
});

/**
 * Scritture dell'API: un client macchina con `Authorization: Bearer` (crawler, script)
 * oppure un utente ADMIN della dashboard con la sessione.
 */
export const requireWriter = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  if (c.req.header("Authorization")) {
    const err = bearerError(c.req.header("Authorization"));
    if (err) return problem(c, 401, "Unauthorized", err);
    return next();
  }
  return requireAdmin(c, next);
});
