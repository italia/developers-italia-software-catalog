import { randomUUID } from "node:crypto";
import type { Prisma } from "@sw-catalog/db";
import { normalizeUrl } from "@sw-catalog/shared";
import { Hono } from "hono";
import { z } from "zod";
import { actorOf, audit } from "../lib/audit.ts";
import { getDb } from "../lib/db.ts";
import { pageQuery, parseSort, runPaged } from "../lib/pagination.ts";
import { problem } from "../lib/problem.ts";
import { type AuthVars, requireAdmin, requireWriter } from "../lib/session.ts";
import { validate } from "../lib/validate.ts";
import { createSoftware, deleteSoftware, softwareInclude, toSoftwareDto, updateSoftware } from "../services/software.ts";
import { addThirdPartySoftware } from "../services/third-party.ts";
import { toLogDto } from "./logs.ts";

const boolParam = z.enum(["true", "false"]).transform((v) => v === "true");

const listQuery = pageQuery.extend({
  /** Corrispondenza esatta (normalizzata) sull'URL canonico o su un alias */
  url: z.string().optional(),
  /** Ricerca libera su URL e contenuto del publiccode.yml */
  q: z.string().trim().min(1).optional(),
  active: boolParam.optional(),
  /** Software di un publisher, per id o alternativeId (codice IPA); `none` = senza publisher */
  publisher: z.string().min(1).optional(),
  sort: z.string().optional(),
});

const softwareBody = z.strictObject({
  url: z.url(),
  aliases: z.array(z.url()).optional(),
  publiccodeYml: z.string().min(1),
  active: z.boolean().optional(),
  vitality: z.string().nullable().optional(),
  publisherId: z.string().min(1).nullable().optional(),
});

const logBody = z.strictObject({ message: z.string().min(1) });

export const software = new Hono<{ Variables: AuthVars }>();

software.get("/", validate("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const db = getDb();

  const where: Prisma.SoftwareWhereInput = {
    ...(q.url && { urls: { some: { url: normalizeUrl(q.url) } } }),
    ...(q.active !== undefined && { active: q.active }),
    ...(q.publisher &&
      (q.publisher === "none"
        ? { publisherId: null }
        : { publisher: { OR: [{ id: q.publisher }, { alternativeId: q.publisher }] } })),
    ...(q.q && {
      OR: [
        { urls: { some: { url: { contains: q.q, mode: "insensitive" } } } },
        { publiccodeYml: { contains: q.q, mode: "insensitive" } },
      ],
    }),
  };
  const { field, direction } = parseSort(q.sort, ["createdAt", "updatedAt"] as const, "-updatedAt");

  const page = await runPaged({
    page: q,
    requestUrl: c.req.url,
    orderBy: { [field]: direction },
    count: () => db.software.count({ where }),
    find: ({ after, ...args }) =>
      db.software.findMany({ ...args, where: after ? { AND: [where, after] } : where, include: softwareInclude }),
  });

  return c.json({ data: page.rows.map(toSoftwareDto), meta: page.meta, links: page.links });
});

software.get("/:id", async (c) => {
  const row = await getDb().software.findUnique({ where: { id: c.req.param("id") }, include: softwareInclude });
  if (!row) return problem(c, 404, "Not Found", "Software non trovato");
  return c.json(toSoftwareDto(row));
});

software.post("/", requireWriter, validate("json", softwareBody), async (c) => {
  const db = getDb();
  const created = await createSoftware(db, c.req.valid("json"));
  await audit(db, { entityType: "software", entityId: created.id, action: "created", ...actorOf(c), data: { url: created.url } });
  return c.json(created, 201);
});

/**
 * Software di terze parti dalla dashboard: il repository diventa un code hosting
 * group=false di un publisher non PA (esistente o nuovo) e, se il publiccode.yml è
 * valido, il software viene creato subito.
 */
const thirdPartyBody = z.union([
  z.strictObject({ url: z.url(), publisherId: z.string().min(1), force: z.boolean().optional() }),
  z.strictObject({
    url: z.url(),
    newPublisher: z.strictObject({ description: z.string().trim().min(2).max(300), email: z.email().nullable().optional() }),
    force: z.boolean().optional(),
  }),
]);

software.post("/third-party", requireAdmin, validate("json", thirdPartyBody), async (c) => {
  return c.json(await addThirdPartySoftware(getDb(), c.req.valid("json"), actorOf(c)), 201);
});

software.patch("/:id", requireWriter, validate("json", softwareBody.partial()), async (c) => {
  const db = getDb();
  const body = c.req.valid("json");
  const updated = await updateSoftware(db, c.req.param("id"), body);
  // Il crawler aggiorna ogni notte: si registrano solo le modifiche fatte dalla dashboard.
  if (c.get("user")) {
    await audit(db, { entityType: "software", entityId: updated.id, action: "updated", ...actorOf(c), data: { fields: Object.keys(body) } });
  }
  return c.json(updated);
});

software.delete("/:id", requireWriter, async (c) => {
  const db = getDb();
  const deleted = await deleteSoftware(db, c.req.param("id"));
  await audit(db, { entityType: "software", entityId: deleted.id, action: "deleted", ...actorOf(c), data: { url: deleted.url, name: deleted.name } });
  return c.body(null, 204);
});

software.get("/:id/logs", validate("query", pageQuery), async (c) => {
  const db = getDb();
  const where = { entityType: "software", entityId: c.req.param("id"), deletedAt: null };
  const page = await runPaged({
    page: { ...c.req.valid("query"), "page[number]": c.req.valid("query")["page[number]"] ?? 1 },
    requestUrl: c.req.url,
    orderBy: { createdAt: "desc" },
    count: () => db.log.count({ where }),
    find: ({ after, ...args }) => db.log.findMany({ ...args, where: after ? { AND: [where, after] } : where }),
  });
  return c.json({ data: page.rows.map(toLogDto), meta: page.meta, links: page.links });
});

software.post("/:id/logs", requireWriter, validate("json", logBody), async (c) => {
  const db = getDb();
  const id = c.req.param("id");
  if (!(await db.software.findUnique({ where: { id }, select: { id: true } }))) {
    return problem(c, 404, "Not Found", "Software non trovato");
  }
  const log = await db.log.create({
    data: { id: randomUUID(), message: c.req.valid("json").message, entityType: "software", entityId: id },
  });
  return c.json(toLogDto(log), 201);
});
