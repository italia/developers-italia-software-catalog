import type { Prisma } from "@sw-catalog/db";
import { Hono } from "hono";
import { z } from "zod";
import { actorOf, audit } from "../lib/audit.ts";
import { getDb } from "../lib/db.ts";
import { pageQuery, parseSort, runPaged } from "../lib/pagination.ts";
import { problem } from "../lib/problem.ts";
import { type AuthVars, requireWriter } from "../lib/session.ts";
import { validate } from "../lib/validate.ts";
import {
  createPublisher,
  deletePublisher,
  findPublisher,
  publisherInclude,
  toPublisherDto,
  updatePublisher,
} from "../services/publishers.ts";

const listQuery = pageQuery.extend({
  /** Ricerca libera su nome, codice IPA, email e URL dei code hosting */
  q: z.string().trim().min(1).optional(),
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  sort: z.string().optional(),
});

const publisherBody = z.strictObject({
  description: z.string().min(1),
  email: z.email().nullable().optional(),
  alternativeId: z.string().min(1).nullable().optional(),
  active: z.boolean().optional(),
  codeHosting: z.array(z.strictObject({ url: z.url(), group: z.boolean().optional() })).min(1),
});

export const publishers = new Hono<{ Variables: AuthVars }>();

publishers.get("/", validate("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const db = getDb();

  const where: Prisma.PublisherWhereInput = {
    ...(q.active !== undefined && { active: q.active }),
    ...(q.q && {
      OR: [
        { description: { contains: q.q, mode: "insensitive" } },
        { alternativeId: { contains: q.q, mode: "insensitive" } },
        { email: { contains: q.q, mode: "insensitive" } },
        { codeHosting: { some: { url: { contains: q.q, mode: "insensitive" } } } },
      ],
    }),
  };
  const { field, direction } = parseSort(
    q.sort,
    ["description", "createdAt", "updatedAt", "softwareCount"] as const,
    "description",
  );
  const orderBy = field === "softwareCount" ? { software: { _count: direction } } : { [field]: direction };

  const page = await runPaged({
    page: q,
    requestUrl: c.req.url,
    orderBy,
    count: () => db.publisher.count({ where }),
    find: ({ after, ...args }) =>
      db.publisher.findMany({ ...args, where: after ? { AND: [where, after] } : where, include: publisherInclude }),
  });

  return c.json({ data: page.rows.map(toPublisherDto), meta: page.meta, links: page.links });
});

publishers.get("/:id", async (c) => {
  const row = await findPublisher(getDb(), c.req.param("id"));
  if (!row) return problem(c, 404, "Not Found", "Publisher non trovato");
  return c.json(toPublisherDto(row));
});

publishers.post("/", requireWriter, validate("json", publisherBody), async (c) => {
  const db = getDb();
  const created = await createPublisher(db, c.req.valid("json"));
  await audit(db, { entityType: "publishers", entityId: created.id, action: "created", ...actorOf(c) });
  return c.json(created, 201);
});

publishers.patch("/:id", requireWriter, validate("json", publisherBody.partial()), async (c) => {
  const db = getDb();
  const body = c.req.valid("json");
  const updated = await updatePublisher(db, c.req.param("id"), body);
  await audit(db, { entityType: "publishers", entityId: updated.id, action: "updated", ...actorOf(c), data: { fields: Object.keys(body) } });
  return c.json(updated);
});

/** I software del publisher restano, senza publisher (publisher_id → NULL). */
publishers.delete("/:id", requireWriter, async (c) => {
  const db = getDb();
  const deleted = await deletePublisher(db, c.req.param("id"));
  await audit(db, {
    entityType: "publishers",
    entityId: deleted.id,
    action: "deleted",
    ...actorOf(c),
    data: { description: deleted.description, alternativeId: deleted.alternativeId, softwareCount: deleted.softwareCount },
  });
  return c.body(null, 204);
});
