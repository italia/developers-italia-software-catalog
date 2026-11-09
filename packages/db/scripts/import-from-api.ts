#!/usr/bin/env bun
// Importa publisher e software da un'API v1 (default: produzione) nel database locale.
// Serve a partire con dati reali in sviluppo. È idempotente: si può rilanciare.
//
//   bun run scripts/import-from-api.ts [--base URL] [--only publishers|software] [--limit N]
//
// Conserva id, created_at e updated_at originali: il crawler usa created_at ≠ updated_at
// per riconoscere i software disattivati a mano.
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/index.ts";

const { values: args } = parseArgs({
  options: {
    base: { type: "string", default: "https://api.developers.italia.it/v1" },
    only: { type: "string" },
    limit: { type: "string" },
  },
});

const base = args.base!.replace(/\/$/, "");
const limit = args.limit ? Number(args.limit) : Infinity;
const db = getDb();

type V1Publisher = {
  id: string;
  description: string;
  email?: string;
  active: boolean;
  alternativeId?: string;
  codeHosting: { url: string; group: boolean }[];
  createdAt: string;
  updatedAt: string;
};

type V1Software = {
  id: string;
  url: string;
  aliases: string[];
  publiccodeYml: string;
  active: boolean;
  vitality?: string;
  createdAt: string;
  updatedAt: string;
};

async function* paginate<T>(path: string): AsyncGenerator<T> {
  let next: string | null = `${base}${path}?all=true&page[size]=100`;
  let count = 0;

  while (next) {
    const res = await fetch(next);
    if (!res.ok) throw new Error(`GET ${next}: ${res.status}`);
    const body = (await res.json()) as { data: T[]; links?: { next?: string } };

    for (const item of body.data) {
      if (count++ >= limit) return;
      yield item;
    }

    const link = body.links?.next;
    next = link ? (link.startsWith("http") ? link : `${base}${path}${link.slice(link.indexOf("?"))}`) : null;
  }
}

async function importPublishers() {
  let ok = 0;
  let failed = 0;

  for await (const p of paginate<V1Publisher>("/publishers")) {
    try {
      await db.$transaction(async (tx) => {
        const data = {
          description: p.description,
          email: p.email || null,
          active: p.active,
          alternativeId: p.alternativeId || null,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        };
        await tx.publisher.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
        await tx.codeHosting.deleteMany({ where: { publisherId: p.id } });
        await tx.codeHosting.createMany({
          data: p.codeHosting.map((ch) => ({ id: randomUUID(), url: ch.url, group: ch.group, publisherId: p.id })),
          skipDuplicates: true,
        });
      });
      ok++;
    } catch (e) {
      failed++;
      console.error(`publisher ${p.id} (${p.description}): ${(e as Error).message.split("\n").at(-1)}`);
    }
  }
  console.log(`publishers: ${ok} importati, ${failed} errori`);
}

async function importSoftware() {
  let ok = 0;
  let failed = 0;

  for await (const s of paginate<V1Software>("/software")) {
    try {
      // I vincoli tra software e software_urls sono DEFERRABLE: l'ordine degli insert
      // dentro la transazione non conta.
      await db.$transaction(async (tx) => {
        const existing = await tx.softwareUrl.findUnique({ where: { url: s.url } });
        const mainUrlId = existing?.id ?? randomUUID();
        await tx.softwareUrl.upsert({
          where: { url: s.url },
          create: { id: mainUrlId, url: s.url, softwareId: s.id },
          update: { softwareId: s.id },
        });

        const data = {
          softwareUrlId: mainUrlId,
          publiccodeYml: s.publiccodeYml,
          active: s.active,
          vitality: s.vitality ?? null,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
        };
        await tx.software.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });

        for (const alias of s.aliases ?? []) {
          await tx.softwareUrl.upsert({
            where: { url: alias },
            create: { id: randomUUID(), url: alias, softwareId: s.id },
            update: { softwareId: s.id },
          });
        }
      });
      ok++;
    } catch (e) {
      failed++;
      console.error(`software ${s.id} (${s.url}): ${(e as Error).message.split("\n").at(-1)}`);
    }
  }
  console.log(`software: ${ok} importati, ${failed} errori`);
}

if (!args.only || args.only === "publishers") await importPublishers();
if (!args.only || args.only === "software") await importSoftware();
await db.$disconnect();
