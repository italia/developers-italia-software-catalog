import type { Prisma, PrismaClient, Vocabulary, VocabularyTerm } from "@sw-catalog/db";
import type { VocabularyDetailDto, VocabularyDto, VocabularyTermDto } from "@sw-catalog/shared";
import { type AuditInput, audit } from "../lib/audit.ts";
import { HttpError } from "../lib/problem.ts";

// Liste editoriali del catalogo (D13). Le liste nascono dal seed (db:seed:vocabularies);
// dalla dashboard gli ADMIN ne modificano nome e descrizione e gestiscono le voci.

type Actor = Pick<AuditInput, "actorType" | "actorId">;
type Tx = Prisma.TransactionClient;

export interface TermInput {
  key: string;
  labelIt?: string | null;
  labelEn?: string | null;
  active?: boolean;
}

export const toTermDto = (t: VocabularyTerm): VocabularyTermDto => ({
  id: t.id,
  key: t.key,
  labelIt: t.labelIt,
  labelEn: t.labelEn,
  position: t.position,
  active: t.active,
  updatedAt: t.updatedAt.toISOString(),
});

function toDto(v: Vocabulary, termCount: number, activeTermCount: number): VocabularyDto {
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    termCount,
    activeTermCount,
    updatedAt: v.updatedAt.toISOString(),
  };
}

export async function listVocabularies(db: PrismaClient): Promise<VocabularyDto[]> {
  const [vocabularies, counts] = await Promise.all([
    db.vocabulary.findMany({ orderBy: { name: "asc" } }),
    db.vocabularyTerm.groupBy({ by: ["vocabularyId", "active"], _count: { _all: true } }),
  ]);
  const count = (id: string, active?: boolean) =>
    counts.filter((c) => c.vocabularyId === id && (active === undefined || c.active === active)).reduce((n, c) => n + c._count._all, 0);
  return vocabularies.map((v) => toDto(v, count(v.id), count(v.id, true)));
}

export async function getVocabulary(db: PrismaClient, id: string, all: boolean): Promise<VocabularyDetailDto> {
  const v = await db.vocabulary.findUnique({
    where: { id },
    include: { terms: { orderBy: [{ position: "asc" }, { key: "asc" }] } },
  });
  if (!v) throw new HttpError(404, "Not Found", "Lista non trovata");
  const active = v.terms.filter((t) => t.active);
  return { ...toDto(v, v.terms.length, active.length), terms: (all ? v.terms : active).map(toTermDto) };
}

/** Cambia updated_at della lista: chi la legge (catalogo) sa che è cambiata. */
const touch = (tx: Tx, id: string) => tx.vocabulary.update({ where: { id }, data: { updatedAt: new Date() } });

async function vocabularyOrThrow(tx: Tx, id: string) {
  const v = await tx.vocabulary.findUnique({ where: { id } });
  if (!v) throw new HttpError(404, "Not Found", "Lista non trovata");
  return v;
}

async function termOrThrow(tx: Tx, vocabularyId: string, termId: string) {
  const t = await tx.vocabularyTerm.findFirst({ where: { id: termId, vocabularyId } });
  if (!t) throw new HttpError(404, "Not Found", "Voce non trovata");
  return t;
}

async function assertKeyFree(tx: Tx, vocabularyId: string, key: string, termId?: string) {
  const other = await tx.vocabularyTerm.findUnique({ where: { vocabularyId_key: { vocabularyId, key } } });
  if (other && other.id !== termId) throw new HttpError(409, "Conflict", `La chiave "${key}" esiste già in questa lista`);
}

export function updateVocabulary(
  db: PrismaClient,
  id: string,
  data: { name?: string | undefined; description?: string | null | undefined },
  actor: Actor,
) {
  return db.$transaction(async (tx) => {
    await vocabularyOrThrow(tx, id);
    const v = await tx.vocabulary.update({ where: { id }, data });
    const fields = Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined);
    await audit(tx, { entityType: "vocabularies", entityId: id, action: "updated", ...actor, data: { fields } });
    return v;
  });
}

export function createTerm(db: PrismaClient, vocabularyId: string, input: TermInput, actor: Actor) {
  return db.$transaction(async (tx) => {
    await vocabularyOrThrow(tx, vocabularyId);
    await assertKeyFree(tx, vocabularyId, input.key);
    const last = await tx.vocabularyTerm.aggregate({ where: { vocabularyId }, _max: { position: true } });
    const term = await tx.vocabularyTerm.create({
      data: { ...input, vocabularyId, position: (last._max.position ?? -1) + 1 },
    });
    await touch(tx, vocabularyId);
    await audit(tx, { entityType: "vocabularies", entityId: vocabularyId, action: "term_created", ...actor, data: { key: term.key } });
    return term;
  });
}

export function updateTerm(db: PrismaClient, vocabularyId: string, termId: string, input: Partial<TermInput>, actor: Actor) {
  return db.$transaction(async (tx) => {
    await vocabularyOrThrow(tx, vocabularyId);
    const current = await termOrThrow(tx, vocabularyId, termId);
    if (input.key !== undefined && input.key !== current.key) await assertKeyFree(tx, vocabularyId, input.key, termId);
    const term = await tx.vocabularyTerm.update({ where: { id: termId }, data: input });
    await touch(tx, vocabularyId);
    await audit(tx, {
      entityType: "vocabularies",
      entityId: vocabularyId,
      action: "term_updated",
      ...actor,
      data: { key: term.key, fields: Object.keys(input).filter((k) => input[k as keyof TermInput] !== undefined), ...(input.key !== undefined && input.key !== current.key && { previousKey: current.key }) },
    });
    return term;
  });
}

export function deleteTerm(db: PrismaClient, vocabularyId: string, termId: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    await vocabularyOrThrow(tx, vocabularyId);
    const term = await termOrThrow(tx, vocabularyId, termId);
    await tx.vocabularyTerm.delete({ where: { id: termId } });
    await touch(tx, vocabularyId);
    await audit(tx, { entityType: "vocabularies", entityId: vocabularyId, action: "term_deleted", ...actor, data: { key: term.key } });
  });
}

/** Nuovo ordine: termIds deve contenere tutte le voci della lista, una volta sola. */
export function reorderTerms(db: PrismaClient, vocabularyId: string, termIds: string[], actor: Actor) {
  return db.$transaction(async (tx) => {
    await vocabularyOrThrow(tx, vocabularyId);
    const terms = await tx.vocabularyTerm.findMany({ where: { vocabularyId }, select: { id: true } });
    const ids = new Set(terms.map((t) => t.id));
    if (termIds.length !== ids.size || new Set(termIds).size !== termIds.length || termIds.some((id) => !ids.has(id))) {
      throw new HttpError(422, "Unprocessable Entity", "L'ordine deve elencare tutte le voci della lista, ciascuna una volta");
    }
    for (const [position, id] of termIds.entries()) await tx.vocabularyTerm.update({ where: { id }, data: { position } });
    await touch(tx, vocabularyId);
    await audit(tx, { entityType: "vocabularies", entityId: vocabularyId, action: "terms_reordered", ...actor });
  });
}
