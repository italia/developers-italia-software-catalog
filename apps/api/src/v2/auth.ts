import { Hono } from "hono";
import { z } from "zod";
import { audit } from "../lib/audit.ts";
import { getDb } from "../lib/db.ts";
import { canLogin, env, roleFor } from "../lib/env.ts";
import { mailer, mailHtml } from "../lib/mailer.ts";
import { problem } from "../lib/problem.ts";
import { clientIp, hit, rateLimit } from "../lib/rate-limit.ts";
import {
  type AuthVars,
  clearSessionCookie,
  hashToken,
  newToken,
  requireUser,
  setSessionCookie,
} from "../lib/session.ts";
import { validate } from "../lib/validate.ts";

// Accesso alla dashboard con magic link (D5, Fase 6 di new-plan.md).
//
// 1. POST /v2/auth/magic-link {email}: se l'indirizzo è ammesso, invia un link monouso.
//    La risposta è sempre la stessa, così non si scopre chi è ammesso.
// 2. Il link apre la pagina /accesso/verifica della dashboard, che chiede un clic e fa
//    POST /v2/auth/verify {token}: un GET che consuma il token verrebbe bruciato dai
//    sistemi che aprono in anticipo i link delle email.
// 3. verify crea o aggiorna l'utente (ruolo da DASHBOARD_ADMIN_EMAILS), apre la sessione
//    e imposta il cookie HttpOnly.

const SENT = "Se l'indirizzo è autorizzato, riceverai un'email con il link di accesso.";

export const auth = new Hono<{ Variables: AuthVars }>();

auth.post(
  "/magic-link",
  rateLimit("magic-link-ip", 20, 15 * 60_000),
  validate("json", z.strictObject({ email: z.email().max(254) })),
  async (c) => {
    const email = c.req.valid("json").email.trim().toLowerCase();
    // Al massimo 5 link per indirizzo ogni 15 minuti; oltre si risponde uguale ma senza inviare.
    if (hit(`magic-link-email:${email}`, 5, 15 * 60_000) || !canLogin(email)) {
      return c.json({ message: SENT }, 202);
    }

    const db = getDb();
    const user = await db.dashboardUser.findUnique({ where: { email } });
    if (user && !user.active) return c.json({ message: SENT }, 202);

    const token = newToken();
    const ttl = env.magicLinkTtlMinutes();
    await db.magicLinkToken.create({
      data: {
        email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttl * 60_000),
        requestedIp: clientIp(c),
      },
    });

    const url = `${env.dashboardUrl()}/accesso/verifica?token=${encodeURIComponent(token)}`;
    await mailer.send({
      to: email,
      subject: "Accesso alla dashboard del catalogo",
      text: `Per accedere alla dashboard del catalogo del software apri questo link entro ${ttl} minuti:\n\n${url}\n\nSe non hai chiesto tu l'accesso, ignora questa email.`,
      html: mailHtml(
        "Accedi alla dashboard",
        [
          `Hai chiesto di accedere alla dashboard del catalogo del software. Il link vale ${ttl} minuti e si può usare una volta sola.`,
          "Se non hai chiesto tu l'accesso, ignora questa email.",
        ],
        [{ label: "Accedi alla dashboard", url }],
      ),
    });

    return c.json({ message: SENT }, 202);
  },
);

auth.post("/verify", rateLimit("verify-ip", 30, 15 * 60_000), validate("json", z.strictObject({ token: z.string().min(20).max(200) })), async (c) => {
  const db = getDb();
  const now = new Date();
  const link = await db.magicLinkToken.findUnique({ where: { tokenHash: hashToken(c.req.valid("json").token) } });
  if (!link || link.usedAt || link.expiresAt <= now) {
    return problem(c, 400, "Bad Request", "Il link non è valido o è scaduto: chiedine uno nuovo");
  }
  // Uso singolo anche con due richieste in parallelo: aggiorna solo se ancora inutilizzato.
  const { count } = await db.magicLinkToken.updateMany({ where: { id: link.id, usedAt: null }, data: { usedAt: now } });
  if (count === 0) return problem(c, 400, "Bad Request", "Il link è già stato usato: chiedine uno nuovo");

  // Le regole possono essere cambiate dopo l'invio del link: si ricontrolla.
  if (!canLogin(link.email)) return problem(c, 403, "Forbidden", "Indirizzo non più autorizzato");

  const role = roleFor(link.email);
  const user = await db.dashboardUser.upsert({
    where: { email: link.email },
    create: { email: link.email, role, lastLoginAt: now },
    update: { role, lastLoginAt: now },
  });
  if (!user.active) return problem(c, 403, "Forbidden", "Utente disattivato");

  const token = newToken();
  const expiresAt = new Date(now.getTime() + env.sessionTtlHours() * 3_600_000);
  await db.dashboardSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: c.req.header("User-Agent")?.slice(0, 500) ?? null,
      ip: clientIp(c),
    },
  });
  await audit(db, {
    entityType: "dashboard_users",
    entityId: user.id,
    action: "login",
    actorType: "DASHBOARD_USER",
    actorId: user.email,
    data: { role },
  });

  setSessionCookie(c, token, expiresAt);
  return c.json({ user: { id: user.id, email: user.email, role: user.role } });
});

auth.get("/me", (c) => c.json({ user: c.get("user") }));

auth.post("/logout", requireUser, async (c) => {
  const sessionId = c.get("sessionId");
  if (sessionId) {
    await getDb().dashboardSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }
  clearSessionCookie(c);
  return c.body(null, 204);
});
