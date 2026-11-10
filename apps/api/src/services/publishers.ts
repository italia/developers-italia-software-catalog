import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@sw-catalog/db";
import { normalizeUrl, type PublisherDto } from "@sw-catalog/shared";
import { HttpError } from "../lib/problem.ts";

export const publisherInclude = {
  codeHosting: { orderBy: { createdAt: "asc" } },
  _count: { select: { software: true } },
} satisfies Prisma.PublisherInclude;
type PublisherWithHosting = Prisma.PublisherGetPayload<{ include: typeof publisherInclude }>;

export function toPublisherDto(p: PublisherWithHosting): PublisherDto {
  return {
    id: p.id,
    description: p.description,
    email: p.email,
    alternativeId: p.alternativeId,
    active: p.active,
    codeHosting: p.codeHosting.map((ch) => ({ url: ch.url, group: ch.group })),
    softwareCount: p._count.software,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export interface PublisherInput {
  description: string;
  email?: string | null;
  alternativeId?: string | null;
  active?: boolean;
  codeHosting: { url: string; group?: boolean }[];
}

/** Cerca per id o, in alternativa, per alternativeId (es. codice IPA), come la v1. */
export async function findPublisher(db: PrismaClient, idOrAlternativeId: string) {
  return db.publisher.findFirst({
    where: { OR: [{ id: idOrAlternativeId }, { alternativeId: idOrAlternativeId }] },
    include: publisherInclude,
  });
}

const hostingRows = (publisherId: string, hosting: PublisherInput["codeHosting"]) =>
  hosting.map((ch) => ({ id: randomUUID(), url: normalizeUrl(ch.url), group: ch.group ?? true, publisherId }));

/** Ogni URL di code hosting appartiene a un solo publisher: altrimenti 409 con il nome. */
async function assertHostingFree(tx: Prisma.TransactionClient, hosting: PublisherInput["codeHosting"], publisherId?: string) {
  const urls = hosting.map((h) => normalizeUrl(h.url));
  const taken = await tx.codeHosting.findFirst({
    where: { url: { in: urls, mode: "insensitive" }, ...(publisherId && { publisherId: { not: publisherId } }) },
    include: { publisher: { select: { description: true } } },
  });
  if (taken) throw new HttpError(409, "Conflict", `${taken.url} è già un code hosting di ${taken.publisher.description}`);
}

export async function createPublisher(db: PrismaClient, input: PublisherInput): Promise<PublisherDto> {
  const id = randomUUID();
  const created = await db.$transaction(async (tx) => {
    await assertHostingFree(tx, input.codeHosting);
    await tx.publisher.create({
      data: {
        id,
        description: input.description,
        email: input.email ?? null,
        alternativeId: input.alternativeId ?? null,
        active: input.active ?? true,
      },
    });
    await tx.codeHosting.createMany({ data: hostingRows(id, input.codeHosting) });
    return tx.publisher.findUniqueOrThrow({ where: { id }, include: publisherInclude });
  });
  return toPublisherDto(created);
}

/** Modifica parziale; se `codeHosting` è passato sostituisce l'elenco. */
export async function updatePublisher(
  db: PrismaClient,
  idOrAlternativeId: string,
  patch: Partial<PublisherInput>,
): Promise<PublisherDto> {
  const current = await findPublisher(db, idOrAlternativeId);
  if (!current) throw new HttpError(404, "Not Found", "Publisher non trovato");

  const updated = await db.$transaction(async (tx) => {
    await tx.publisher.update({
      where: { id: current.id },
      data: {
        ...(patch.description !== undefined && { description: patch.description }),
        ...(patch.email !== undefined && { email: patch.email }),
        ...(patch.alternativeId !== undefined && { alternativeId: patch.alternativeId }),
        ...(patch.active !== undefined && { active: patch.active }),
      },
    });
    if (patch.codeHosting) {
      await assertHostingFree(tx, patch.codeHosting, current.id);
      await tx.codeHosting.deleteMany({ where: { publisherId: current.id } });
      await tx.codeHosting.createMany({ data: hostingRows(current.id, patch.codeHosting) });
    }
    return tx.publisher.findUniqueOrThrow({ where: { id: current.id }, include: publisherInclude });
  });
  return toPublisherDto(updated);
}

/** Elimina il publisher e i suoi code hosting (CASCADE); i software restano senza publisher. */
export async function deletePublisher(db: PrismaClient, idOrAlternativeId: string): Promise<PublisherDto> {
  const current = await findPublisher(db, idOrAlternativeId);
  if (!current) throw new HttpError(404, "Not Found", "Publisher non trovato");
  await db.publisher.delete({ where: { id: current.id } });
  return toPublisherDto(current);
}
