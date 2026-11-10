import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { problem } from "./problem.ts";

// Rate limit in memoria a finestra fissa, per le rotte pubbliche (magic link, form).
// Basta per un'istanza sola; con più repliche servirà un contatore condiviso (Postgres o Redis).
const buckets = new Map<string, { count: number; resetAt: number }>();

/** true se la chiave ha superato `max` richieste nella finestra. */
export function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return false;
  }
  b.count++;
  return b.count > max;
}

export const resetRateLimits = () => buckets.clear();

/** IP del client: X-Forwarded-For solo se l'API è dietro un proxy fidato (TRUST_PROXY=true). */
export function clientIp(c: Context): string {
  if (process.env.TRUST_PROXY === "true") {
    const xff = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
    if (xff) return xff;
  }
  const info = (c.env as { requestIP?: (r: Request) => { address: string } | null } | undefined)?.requestIP?.(c.req.raw);
  return info?.address ?? "unknown";
}

export const rateLimit = (name: string, max: number, windowMs: number) =>
  createMiddleware(async (c, next) => {
    if (hit(`${name}:${clientIp(c)}`, max, windowMs)) {
      return problem(c, 429, "Too Many Requests", "Troppe richieste, riprova più tardi");
    }
    await next();
  });
