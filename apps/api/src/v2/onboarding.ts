import type { Prisma } from "@sw-catalog/db";
import { Hono } from "hono";
import { z } from "zod";
import { actorOf } from "../lib/audit.ts";
import { getDb } from "../lib/db.ts";
import { pageQuery, runPaged } from "../lib/pagination.ts";
import { problem } from "../lib/problem.ts";
import { rateLimit } from "../lib/rate-limit.ts";
import { type AuthVars, requireAdmin, requireUser } from "../lib/session.ts";
import { validate } from "../lib/validate.ts";
import {
  createOnboardingRequest,
  decideByToken,
  decideOnboarding,
  onboardingByToken,
  toOnboardingDto,
} from "../services/onboarding.ts";

const phone = /^\+?\d{6,15}$/;

const createBody = z.strictObject({
  ipa: z.string().trim().min(2).max(40),
  pec: z.email().max(254),
  contactName: z.string().trim().min(3).max(200),
  // Facoltativo (minimizzazione dei dati): onboarding-italia lo chiedeva sempre
  contactPhone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .refine((v) => v === "" || phone.test(v), "Numero di telefono non valido")
    .optional(),
  codeHostingUrl: z.url().max(500),
  /** Campo trappola per i bot: deve restare vuoto */
  website: z.string().max(0).optional(),
});

const token = z.object({ token: z.string().min(20).max(200) });

const listQuery = pageQuery.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  q: z.string().trim().min(1).optional(),
});

export const onboarding = new Hono<{ Variables: AuthVars }>();

// --- Pubblico -----------------------------------------------------------------

onboarding.post("/", rateLimit("onboarding-ip", 10, 60 * 60_000), validate("json", createBody), async (c) => {
  const { website: _, ...input } = c.req.valid("json");
  return c.json(await createOnboardingRequest(getDb(), input), 201);
});

/** Riepilogo per la pagina di conferma aperta dal link nella PEC. */
onboarding.get("/confirm", rateLimit("onboarding-confirm", 60, 15 * 60_000), validate("query", token), async (c) => {
  return c.json(await onboardingByToken(getDb(), c.req.valid("query").token));
});

onboarding.post(
  "/confirm",
  rateLimit("onboarding-confirm", 60, 15 * 60_000),
  validate("json", token.extend({ decision: z.enum(["confirm", "reject"]) })),
  async (c) => {
    const { token, decision } = c.req.valid("json");
    const r = await decideByToken(getDb(), token, decision === "confirm" ? "APPROVED" : "REJECTED");
    return c.json({ status: r.status });
  },
);

// --- Dashboard ----------------------------------------------------------------

onboarding.get("/", requireUser, validate("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const db = getDb();
  const where: Prisma.OnboardingRequestWhereInput = {
    ...(q.status && { status: q.status }),
    ...(q.q && {
      OR: [
        { administration: { contains: q.q, mode: "insensitive" } },
        { ipa: { contains: q.q, mode: "insensitive" } },
        { codeHostingUrl: { contains: q.q, mode: "insensitive" } },
        { contactName: { contains: q.q, mode: "insensitive" } },
      ],
    }),
  };
  const page = await runPaged({
    page: { ...q, "page[number]": q["page[number]"] ?? 1 },
    requestUrl: c.req.url,
    orderBy: { createdAt: "desc" },
    count: () => db.onboardingRequest.count({ where }),
    find: ({ after, ...args }) => db.onboardingRequest.findMany({ ...args, where: after ? { AND: [where, after] } : where }),
  });
  return c.json({ data: page.rows.map(toOnboardingDto), meta: page.meta, links: page.links });
});

const decisionBody = z.strictObject({ note: z.string().trim().max(2000).optional() });

for (const [path, decision] of [["approve", "APPROVED"], ["reject", "REJECTED"]] as const) {
  onboarding.post(`/:id/${path}`, requireAdmin, validate("json", decisionBody), async (c) => {
    const db = getDb();
    const request = await db.onboardingRequest.findUnique({ where: { id: c.req.param("id") } });
    if (!request) return problem(c, 404, "Not Found", "Richiesta non trovata");
    if (request.status !== "PENDING") return problem(c, 409, "Conflict", "La richiesta è già stata gestita");
    return c.json(await decideOnboarding(db, request, decision, actorOf(c), c.req.valid("json").note));
  });
}
