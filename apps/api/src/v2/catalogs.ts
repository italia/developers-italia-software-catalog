import { Hono } from "hono";
import { getDb } from "../lib/db.ts";

// Per ora solo lettura: il crawler legge i cataloghi e, se non ce ne sono, usa i publisher.
export const catalogs = new Hono();

catalogs.get("/", async (c) => {
  const rows = await getDb().catalog.findMany({
    where: { active: true },
    include: { sources: true },
    orderBy: { createdAt: "asc" },
  });
  return c.json({
    data: rows.map((cat) => ({
      id: cat.id,
      name: cat.name,
      alternativeId: cat.alternativeId,
      publishersNamespace: cat.publishersNamespace,
      active: cat.active,
      sources: cat.sources.map((s) => ({ url: s.url, driver: s.driver, args: s.args ? JSON.parse(s.args) : [] })),
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
    })),
    meta: { pageSize: rows.length },
    links: { next: null, prev: null },
  });
});
