import type { PrismaClient } from "@sw-catalog/db";
import type { IpaEntityDto } from "@sw-catalog/shared";

// Anagrafica IndicePA: ricerca per l'onboarding e sincronizzazione dagli open data.

type IpaRow = { ipa: string; description: string; category: string | null; fiscalCode: string | null; website: string | null; pec: string[] };

async function withPublisherIds(db: PrismaClient, rows: IpaRow[]): Promise<IpaEntityDto[]> {
  const publishers = await db.publisher.findMany({
    where: { alternativeId: { in: rows.map((r) => r.ipa), mode: "insensitive" } },
    select: { id: true, alternativeId: true },
  });
  const byIpa = new Map(publishers.map((p) => [p.alternativeId!.toLowerCase(), p.id]));
  return rows.map((r) => ({ ...r, publisherId: byIpa.get(r.ipa.toLowerCase()) ?? null }));
}

const select = { ipa: true, description: true, category: true, fiscalCode: true, website: true, pec: true } as const;

/** Codice IPA esatto o per prefisso, codice fiscale esatto, oppure parole nella denominazione. */
export async function searchIpa(db: PrismaClient, q: string, limit = 10): Promise<IpaEntityDto[]> {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  const rows = await db.ipaEntity.findMany({
    where: {
      OR: [
        { ipa: { startsWith: q.trim(), mode: "insensitive" } },
        { fiscalCode: q.trim() },
        { AND: words.map((w) => ({ description: { contains: w, mode: "insensitive" as const } })) },
      ],
    },
    select,
    orderBy: { description: "asc" },
    take: limit,
  });
  return withPublisherIds(db, rows);
}

export async function findIpa(db: PrismaClient, ipa: string): Promise<IpaEntityDto | null> {
  const row = await db.ipaEntity.findFirst({ where: { ipa: { equals: ipa, mode: "insensitive" } }, select });
  return row ? (await withPublisherIds(db, [row]))[0]! : null;
}

// --- Sincronizzazione dagli open data IndicePA --------------------------------

/** Dataset "Enti" del portale open data IndicePA (CKAN). */
const ENTI_RESOURCE = "d09adf99-dc10-4349-8c53-27b1e5aa97b6";
const CKAN = process.env.IPA_CKAN_URL ?? "https://indicepa.gov.it/ipa-dati/api/3/action";

interface EnteRecord {
  Codice_IPA: string;
  Denominazione_ente: string;
  Codice_fiscale_ente: string | null;
  Tipologia: string | null;
  Sito_istituzionale: string | null;
  [mail: `Mail${number}` | `Tipo_Mail${number}`]: string | null;
}

const website = (raw: string | null) => {
  const s = raw?.trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

export function toIpaRow(r: EnteRecord): IpaRow {
  const pec: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const mail = r[`Mail${i}`]?.trim();
    if (mail && r[`Tipo_Mail${i}`]?.toLowerCase() === "pec") pec.push(mail.toLowerCase());
  }
  return {
    ipa: r.Codice_IPA.trim(),
    description: r.Denominazione_ente.trim(),
    category: r.Tipologia?.trim() || null,
    fiscalCode: r.Codice_fiscale_ente?.trim() || null,
    website: website(r.Sito_istituzionale),
    pec,
  };
}

async function fetchEnti(log: (m: string) => void): Promise<EnteRecord[]> {
  const pageSize = 5000;
  const all: EnteRecord[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = `${CKAN}/datastore_search?resource_id=${ENTI_RESOURCE}&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers: { "User-Agent": "developers-italia-software-catalog" } });
    if (!res.ok) throw new Error(`IndicePA: HTTP ${res.status} su ${url}`);
    const body = (await res.json()) as { success: boolean; result: { records: EnteRecord[]; total: number } };
    if (!body.success) throw new Error("IndicePA: risposta senza success");
    all.push(...body.result.records);
    log(`  ${all.length}/${body.result.total}`);
    if (body.result.records.length < pageSize || all.length >= body.result.total) return all;
  }
}

/**
 * Upsert di tutti gli enti in una transazione (niente finestre senza dati, chiude B11),
 * poi rimozione di quelli spariti dagli open data, tranne quelli citati da una richiesta
 * di onboarding (FK).
 */
export async function syncIpa(db: PrismaClient, log: (m: string) => void = console.log) {
  log("scarico gli enti da IndicePA…");
  const rows = (await fetchEnti(log)).filter((r) => r.Codice_IPA && r.Denominazione_ente).map(toIpaRow);
  if (rows.length < 1000) throw new Error(`IndicePA: solo ${rows.length} enti, mi fermo per sicurezza`);

  const syncedAt = new Date();
  const result = await db.$transaction(
    async (tx) => {
      for (let i = 0; i < rows.length; i += 2000) {
        const batch = JSON.stringify(rows.slice(i, i + 2000));
        await tx.$executeRaw`
          INSERT INTO ipa_entities (ipa, description, category, fiscal_code, website, pec, synced_at)
          SELECT ipa, description, category, "fiscalCode", website, pec, ${syncedAt}
          FROM jsonb_to_recordset(${batch}::jsonb)
            AS x(ipa text, description text, category text, "fiscalCode" text, website text, pec text[])
          ON CONFLICT (ipa) DO UPDATE SET
            description = EXCLUDED.description, category = EXCLUDED.category,
            fiscal_code = EXCLUDED.fiscal_code, website = EXCLUDED.website,
            pec = EXCLUDED.pec, synced_at = EXCLUDED.synced_at`;
      }
      const removed = await tx.$executeRaw`
        DELETE FROM ipa_entities e WHERE e.synced_at < ${syncedAt}
          AND NOT EXISTS (SELECT 1 FROM onboarding_requests o WHERE o.ipa = e.ipa)`;
      return { upserted: rows.length, removed };
    },
    { timeout: 120_000 },
  );
  log(`enti aggiornati: ${result.upserted}, rimossi: ${result.removed}`);
  return result;
}
