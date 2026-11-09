import type { Prisma } from "@sw-catalog/db";
import { Hono } from "hono";
import { z } from "zod";
import { requireToken } from "../lib/auth.ts";
import { getDb } from "../lib/db.ts";
import { pageQuery, parseSort, runPaged } from "../lib/pagination.ts";
import { problem } from "../lib/problem.ts";
import { validate } from "../lib/validate.ts";
import {
  createPublisher,
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

export const publishers = new Hono();

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

publishers.post("/", requireToken, validate("json", publisherBody), async (c) => {
  return c.json(await createPublisher(getDb(), c.req.valid("json")), 201);
});

publishers.patch("/:id", requireToken, validate("json", publisherBody.partial()), async (c) => {
  return c.json(await updatePublisher(getDb(), c.req.param("id"), c.req.valid("json")));
});
