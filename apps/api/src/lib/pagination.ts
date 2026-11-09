import { z } from "zod";

// Due modalità, scelte dai parametri:
// - `page[number]` (1, 2, …): offset + totale, per le tabelle della dashboard;
// - `page[after]` (cursore opaco): scorrimento completo e stabile, per crawler e indexer
//   (stessa forma della v1, ordinato per created_at, id).
export const pageQuery = z.object({
  "page[size]": z.coerce.number().int().min(1).max(100).default(25),
  "page[number]": z.coerce.number().int().min(1).optional(),
  "page[after]": z.string().min(1).optional(),
});

export type PageQuery = z.infer<typeof pageQuery>;

interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor({ createdAt, id }: Cursor): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(raw: string): Cursor | undefined {
  const [iso, id] = Buffer.from(raw, "base64url").toString().split("|");
  const createdAt = iso ? new Date(iso) : undefined;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) return undefined;
  return { createdAt, id };
}

/** Condizione Prisma per "dopo il cursore" con ordinamento (created_at, id). */
export function afterCursor(cursor: Cursor) {
  return {
    OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }],
  };
}

/** Copia l'URL della richiesta cambiando i parametri di paginazione. */
export function pageLink(requestUrl: string, params: Record<string, string | undefined>): string {
  const url = new URL(requestUrl);
  for (const key of ["page[number]", "page[after]"]) url.searchParams.delete(key);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

// Un campo con direzione, oppure un ordinamento annidato di Prisma (es. { software: { _count: "desc" } }).
type OrderBy = Record<string, unknown>;

interface PagedOptions<Row extends Cursor> {
  page: PageQuery;
  requestUrl: string;
  /** Ordinamento per la modalità a pagine; la modalità a cursore usa sempre (createdAt, id). */
  orderBy: OrderBy;
  count: () => Promise<number>;
  find: (args: { skip?: number; take: number; after?: object; orderBy: OrderBy[] }) => Promise<Row[]>;
}

/** Esegue una lista paginata nelle due modalità e restituisce righe, meta e link. */
export async function runPaged<Row extends Cursor>(opts: PagedOptions<Row>) {
  const size = opts.page["page[size]"];

  if (opts.page["page[after]"] === undefined && opts.page["page[number]"] !== undefined) {
    const number = opts.page["page[number]"];
    const [total, rows] = await Promise.all([
      opts.count(),
      opts.find({ skip: (number - 1) * size, take: size, orderBy: [opts.orderBy, { id: "asc" }] }),
    ]);
    return {
      rows,
      meta: { total, pageSize: size, pageNumber: number },
      links: {
        next: number * size < total ? pageLink(opts.requestUrl, { "page[number]": String(number + 1) }) : null,
        prev: number > 1 ? pageLink(opts.requestUrl, { "page[number]": String(number - 1) }) : null,
      },
    };
  }

  const raw = opts.page["page[after]"];
  const cursor = raw ? decodeCursor(raw) : undefined;
  const rows = await opts.find({
    take: size + 1,
    after: cursor ? afterCursor(cursor) : undefined,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const hasMore = rows.length > size;
  const pageRows = rows.slice(0, size);
  const last = pageRows.at(-1);

  return {
    rows: pageRows,
    meta: { pageSize: size },
    links: {
      next: hasMore && last ? pageLink(opts.requestUrl, { "page[after]": encodeCursor(last) }) : null,
      prev: null,
    },
  };
}

/** Ordinamento `sort=campo` / `sort=-campo` tra i campi ammessi. */
export function parseSort<F extends string>(sort: string | undefined, allowed: readonly F[], fallback: `${"" | "-"}${F}`) {
  const value = sort && allowed.includes(sort.replace(/^-/, "") as F) ? sort : fallback;
  const desc = value.startsWith("-");
  const field = value.replace(/^-/, "") as F;
  return { field, direction: desc ? ("desc" as const) : ("asc" as const) };
}
