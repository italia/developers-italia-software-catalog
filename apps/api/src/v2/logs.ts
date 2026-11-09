import { randomUUID } from "node:crypto";
import type { Log } from "@sw-catalog/db";
import type { LogDto } from "@sw-catalog/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireToken } from "../lib/auth.ts";
import { getDb } from "../lib/db.ts";
import { pageQuery, runPaged } from "../lib/pagination.ts";
import { validate } from "../lib/validate.ts";

export function toLogDto(log: Log): LogDto {
  return {
    id: log.id,
    message: log.message,
    // In Postgres (GORM) è una colonna generata; qui è calcolata.
    entity: log.entityType && log.entityId ? `/${log.entityType}/${log.entityId}` : null,
    createdAt: log.createdAt.toISOString(),
  };
}

const listQuery = pageQuery.extend({ q: z.string().trim().min(1).optional() });

export const logs = new Hono();

logs.get("/", validate("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const db = getDb();
  const where = { deletedAt: null, ...(q.q && { message: { contains: q.q, mode: "insensitive" as const } }) };
  const page = await runPaged({
    page: q,
    requestUrl: c.req.url,
    orderBy: { createdAt: "desc" },
    count: () => db.log.count({ where }),
    find: ({ after, ...args }) => db.log.findMany({ ...args, where: after ? { AND: [where, after] } : where }),
  });
  return c.json({ data: page.rows.map(toLogDto), meta: page.meta, links: page.links });
});

logs.post("/", requireToken, validate("json", z.strictObject({ message: z.string().min(1) })), async (c) => {
  const log = await getDb().log.create({ data: { id: randomUUID(), message: c.req.valid("json").message } });
  return c.json(toLogDto(log), 201);
});
