import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@sw-catalog/db";
import { normalizeUrl, type SoftwareDto } from "@sw-catalog/shared";
import { HttpError } from "../lib/problem.ts";
import { publiccodeName } from "../lib/publiccode.ts";

export const softwareInclude = {
  url: true,
  urls: true,
  publisher: { select: { id: true, description: true, alternativeId: true } },
} satisfies Prisma.SoftwareInclude;
type SoftwareWithUrls = Prisma.SoftwareGetPayload<{ include: typeof softwareInclude }>;

export function toSoftwareDto(s: SoftwareWithUrls): SoftwareDto {
  return {
    id: s.id,
    publisherId: s.publisherId,
    publisher: s.publisher,
    url: s.url.url,
    aliases: s.urls.filter((u) => u.id !== s.softwareUrlId).map((u) => u.url),
    name: publiccodeName(s.publiccodeYml),
    publiccodeYml: s.publiccodeYml,
    active: s.active,
    vitality: s.vitality,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export interface SoftwareInput {
  url: string;
  aliases?: string[];
  publiccodeYml: string;
  active?: boolean;
  vitality?: string | null;
  publisherId?: string | null;
}

/** Gli URL devono appartenere solo a questo software: altrimenti 409. */
async function assertUrlsFree(tx: Prisma.TransactionClient, urls: string[], softwareId: string) {
  const taken = await tx.softwareUrl.findMany({
    where: { url: { in: urls }, softwareId: { not: softwareId } },
  });
  if (taken.length > 0) {
    throw new HttpError(409, "Conflict", `URL già usati da un altro software: ${taken.map((t) => t.url).join(", ")}`);
  }
}

export async function createSoftware(db: PrismaClient, input: SoftwareInput): Promise<SoftwareDto> {
  const id = randomUUID();
  const url = normalizeUrl(input.url);
  const aliases = [...new Set((input.aliases ?? []).map(normalizeUrl))].filter((a) => a !== url);

  // software ↔ software_urls hanno FK circolari DEFERRABLE: l'ordine qui non conta.
  const created = await db.$transaction(async (tx) => {
    await assertUrlsFree(tx, [url, ...aliases], id);
    const mainUrlId = randomUUID();
    await tx.softwareUrl.create({ data: { id: mainUrlId, url, softwareId: id } });
    await tx.software.create({
      data: {
        id,
        softwareUrlId: mainUrlId,
        publiccodeYml: input.publiccodeYml,
        active: input.active ?? true,
        vitality: input.vitality ?? null,
        publisherId: input.publisherId ?? null,
      },
    });
    if (aliases.length) {
      await tx.softwareUrl.createMany({ data: aliases.map((a) => ({ id: randomUUID(), url: a, softwareId: id })) });
    }
    return tx.software.findUniqueOrThrow({ where: { id }, include: softwareInclude });
  });

  return toSoftwareDto(created);
}

/**
 * Modifica parziale. Regole sugli URL (come la v1):
 * - `url` diverso dall'attuale diventa il canonico; il vecchio resta come alias se `aliases` non è passato;
 * - se `aliases` è passato, gli URL del software diventano esattamente {url} ∪ aliases.
 */
export async function updateSoftware(
  db: PrismaClient,
  id: string,
  patch: Partial<SoftwareInput>,
): Promise<SoftwareDto> {
  const updated = await db.$transaction(async (tx) => {
    const current = await tx.software.findUnique({ where: { id }, include: softwareInclude });
    if (!current) throw new HttpError(404, "Not Found", "Software non trovato");

    const url = patch.url ? normalizeUrl(patch.url) : current.url.url;
    const wanted = patch.aliases
      ? new Set([url, ...patch.aliases.map(normalizeUrl)])
      : new Set([...current.urls.map((u) => u.url), url]);

    await assertUrlsFree(tx, [...wanted], id);

    // Crea gli URL mancanti, elimina quelli non più voluti.
    const existing = new Map(current.urls.map((u) => [u.url, u.id]));
    for (const u of wanted) {
      if (!existing.has(u)) {
        const newId = randomUUID();
        await tx.softwareUrl.create({ data: { id: newId, url: u, softwareId: id } });
        existing.set(u, newId);
      }
    }

    await tx.software.update({
      where: { id },
      data: {
        softwareUrlId: existing.get(url)!,
        ...(patch.publiccodeYml !== undefined && { publiccodeYml: patch.publiccodeYml }),
        ...(patch.active !== undefined && { active: patch.active }),
        ...(patch.vitality !== undefined && { vitality: patch.vitality }),
        ...(patch.publisherId !== undefined && { publisherId: patch.publisherId }),
      },
    });

    const toDelete = current.urls.filter((u) => !wanted.has(u.url)).map((u) => u.id);
    if (toDelete.length) await tx.softwareUrl.deleteMany({ where: { id: { in: toDelete } } });

    return tx.software.findUniqueOrThrow({ where: { id }, include: softwareInclude });
  });

  return toSoftwareDto(updated);
}

/** Elimina il software con i suoi URL (FK in CASCADE); restituisce lo stato precedente. */
export async function deleteSoftware(db: PrismaClient, id: string): Promise<SoftwareDto> {
  return db.$transaction(async (tx) => {
    const current = await tx.software.findUnique({ where: { id }, include: softwareInclude });
    if (!current) throw new HttpError(404, "Not Found", "Software non trovato");
    await tx.software.delete({ where: { id } });
    return toSoftwareDto(current);
  });
}
