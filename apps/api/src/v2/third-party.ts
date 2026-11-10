import type { Prisma, ThirdPartyRequest } from "@sw-catalog/db";
import { normalizeUrl, type PubliccodeCheck, type ThirdPartyDeclarations, type ThirdPartyRequestDto } from "@sw-catalog/shared";
import { Hono } from "hono";
import { z } from "zod";
import { actorOf, audit } from "../lib/audit.ts";
import { getDb } from "../lib/db.ts";
import { mailer, mailHtml } from "../lib/mailer.ts";
import { pageQuery, runPaged } from "../lib/pagination.ts";
import { HttpError, problem } from "../lib/problem.ts";
import { rateLimit } from "../lib/rate-limit.ts";
import { UnsafeUrlError } from "../lib/safe-fetch.ts";
import { type AuthVars, requireAdmin, requireUser } from "../lib/session.ts";
import { validate } from "../lib/validate.ts";
import { checkRepository, isRepositoryUrl, withoutYaml } from "../services/publiccode-check.ts";
import { addThirdPartySoftware } from "../services/third-party.ts";

// Richieste di inserimento di software di terze parti (sostituiscono la issue template
// add_new_software). Form pubblico → coda nella dashboard → un ADMIN approva (il repository
// viene aggiunto a un publisher non PA e, se il publiccode.yml è valido, il software
// viene creato subito) o rifiuta. Le issue GitHub finiranno nella stessa coda (Fase 6).

export function toThirdPartyDto(r: ThirdPartyRequest): ThirdPartyRequestDto {
  return {
    id: r.id,
    source: r.source,
    repositoryUrl: r.repositoryUrl,
    requesterEmail: r.requesterEmail,
    requesterName: r.requesterName,
    requesterGithub: r.requesterGithub,
    githubIssueUrl: r.githubIssueUrl,
    notes: r.notes,
    declarations: r.declarations as unknown as ThirdPartyDeclarations,
    validation: (r.validation as unknown as PubliccodeCheck | null) ?? null,
    status: r.status,
    reviewerNote: r.reviewerNote,
    softwareId: r.softwareId,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const repoUrl = z.url().max(500).refine(isRepositoryUrl, "Serve l'URL https di un singolo repository, es. https://github.com/org/progetto");

const mustBeTrue = (msg: string) => z.literal(true, { error: msg });

const createBody = z.strictObject({
  repositoryUrl: repoUrl,
  requesterName: z.string().trim().max(200).optional(),
  requesterEmail: z.email().max(254),
  notes: z.string().trim().max(4000).optional(),
  declarations: z.strictObject({
    relevantForPa: mustBeTrue("Il software deve essere rilevante per la PA"),
    notPaOwned: mustBeTrue("Il software non deve essere di titolarità di una PA"),
    validPubliccode: mustBeTrue("Il repository deve contenere un publiccode.yml valido"),
  }),
  /** Campo trappola per i bot: deve restare vuoto */
  website: z.string().max(0).optional(),
});

const listQuery = pageQuery.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  source: z.enum(["FORM", "GITHUB_ISSUE"]).optional(),
  q: z.string().trim().min(1).optional(),
});

const target = z.union([
  z.strictObject({ publisherId: z.string().min(1), force: z.boolean().optional(), note: z.string().trim().max(2000).optional() }),
  z.strictObject({
    newPublisher: z.strictObject({ description: z.string().trim().min(2).max(300), email: z.email().nullable().optional() }),
    force: z.boolean().optional(),
    note: z.string().trim().max(2000).optional(),
  }),
]);

async function check(url: string) {
  try {
    return await checkRepository(url);
  } catch (e) {
    if (e instanceof UnsafeUrlError) throw new HttpError(422, "Unprocessable Entity", `URL non accettato: ${e.message}`);
    throw e;
  }
}

async function notifyRequester(r: ThirdPartyRequest, approved: boolean, note?: string) {
  if (!r.requesterEmail) return;
  const title = approved ? "Richiesta approvata" : "Richiesta non accolta";
  const lines = [
    `La richiesta di inserire ${r.repositoryUrl} nel catalogo del software di Developers Italia è stata ${approved ? "approvata" : "esaminata e non è stata accolta"}.`,
    ...(note ? [`Nota della redazione: ${note}`] : []),
    approved
      ? "Il software comparirà nel catalogo dopo il prossimo aggiornamento dell'indice."
      : "Per chiarimenti puoi scrivere a contatti@developers.italia.it.",
  ];
  await mailer.send({ to: r.requesterEmail, subject: `Developers Italia: ${title.toLowerCase()}`, text: lines.join("\n\n"), html: mailHtml(title, lines) });
}

export const thirdParty = new Hono<{ Variables: AuthVars }>();

// --- Pubblico -----------------------------------------------------------------

/** Controllo del publiccode.yml di un repository, per il riscontro immediato nei form. */
thirdParty.post("/check", rateLimit("tp-check", 30, 10 * 60_000), validate("json", z.strictObject({ url: repoUrl })), async (c) => {
  return c.json(withoutYaml(await check(c.req.valid("json").url)));
});

thirdParty.post("/", rateLimit("tp-create", 5, 60 * 60_000), validate("json", createBody), async (c) => {
  const body = c.req.valid("json");
  const db = getDb();
  const url = normalizeUrl(body.repositoryUrl).replace(/\/+$/, "");

  if (await db.softwareUrl.findFirst({ where: { url: { in: [url, `${url}.git`], mode: "insensitive" } } })) {
    return problem(c, 409, "Conflict", "Il software è già nel catalogo");
  }
  if (await db.thirdPartyRequest.findFirst({ where: { repositoryUrl: { equals: url, mode: "insensitive" }, status: "PENDING" } })) {
    return problem(c, 409, "Conflict", "C'è già una richiesta in attesa per questo repository");
  }

  const validation = withoutYaml(await check(url));
  const created = await db.$transaction(async (tx) => {
    const r = await tx.thirdPartyRequest.create({
      data: {
        source: "FORM",
        repositoryUrl: url,
        requesterEmail: body.requesterEmail.toLowerCase(),
        requesterName: body.requesterName || null,
        notes: body.notes || null,
        declarations: body.declarations,
        validation: validation as unknown as Prisma.InputJsonValue,
      },
    });
    await audit(tx, { entityType: "third_party_requests", entityId: r.id, action: "created", actorType: "REQUESTER", actorId: r.requesterEmail, toStatus: "PENDING" });
    return r;
  });
  return c.json(toThirdPartyDto(created), 201);
});

// --- Dashboard ----------------------------------------------------------------

thirdParty.get("/", requireUser, validate("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const db = getDb();
  const where: Prisma.ThirdPartyRequestWhereInput = {
    ...(q.status && { status: q.status }),
    ...(q.source && { source: q.source }),
    ...(q.q && {
      OR: [
        { repositoryUrl: { contains: q.q, mode: "insensitive" } },
        { requesterEmail: { contains: q.q, mode: "insensitive" } },
        { requesterName: { contains: q.q, mode: "insensitive" } },
        { requesterGithub: { contains: q.q, mode: "insensitive" } },
      ],
    }),
  };
  const page = await runPaged({
    page: { ...q, "page[number]": q["page[number]"] ?? 1 },
    requestUrl: c.req.url,
    orderBy: { createdAt: "desc" },
    count: () => db.thirdPartyRequest.count({ where }),
    find: ({ after, ...args }) => db.thirdPartyRequest.findMany({ ...args, where: after ? { AND: [where, after] } : where }),
  });
  return c.json({ data: page.rows.map(toThirdPartyDto), meta: page.meta, links: page.links });
});

async function pendingRequest(id: string) {
  const r = await getDb().thirdPartyRequest.findUnique({ where: { id } });
  if (!r) throw new HttpError(404, "Not Found", "Richiesta non trovata");
  if (r.status !== "PENDING") throw new HttpError(409, "Conflict", "La richiesta è già stata gestita");
  return r;
}

thirdParty.post("/:id/approve", requireAdmin, validate("json", target), async (c) => {
  const db = getDb();
  const r = await pendingRequest(c.req.param("id"));
  const body = c.req.valid("json");
  const actor = actorOf(c);
  const { note, ...input } = body;

  const result = await addThirdPartySoftware(db, { ...input, url: r.repositoryUrl }, actor);
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.thirdPartyRequest.update({
      where: { id: r.id },
      data: {
        status: "APPROVED",
        decidedAt: new Date(),
        reviewerNote: note || null,
        softwareId: result.software?.id ?? null,
        validation: result.check as unknown as Prisma.InputJsonValue,
      },
    });
    await audit(tx, {
      entityType: "third_party_requests",
      entityId: r.id,
      action: "approved",
      ...actor,
      fromStatus: "PENDING",
      toStatus: "APPROVED",
      data: { publisherId: result.publisherId, softwareId: result.software?.id ?? null, ...(note && { note }) },
    });
    return u;
  });
  await notifyRequester(updated, true, note);
  return c.json({ request: toThirdPartyDto(updated), ...result });
});

thirdParty.post("/:id/reject", requireAdmin, validate("json", z.strictObject({ note: z.string().trim().max(2000).optional() })), async (c) => {
  const db = getDb();
  const r = await pendingRequest(c.req.param("id"));
  const { note } = c.req.valid("json");
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.thirdPartyRequest.update({ where: { id: r.id }, data: { status: "REJECTED", decidedAt: new Date(), reviewerNote: note || null } });
    await audit(tx, { entityType: "third_party_requests", entityId: r.id, action: "rejected", ...actorOf(c), fromStatus: "PENDING", toStatus: "REJECTED", data: note ? { note } : undefined });
    return u;
  });
  await notifyRequester(updated, false, note);
  return c.json(toThirdPartyDto(updated));
});
