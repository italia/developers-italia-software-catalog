import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

export * from "./generated/prisma/client.ts";

let client: PrismaClient | undefined;

/** Client Prisma condiviso (driver adapter `pg`, richiesto da Prisma 7). */
export function getDb(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (client) return client;
  if (!databaseUrl) throw new Error("DATABASE_URL non impostata");

  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  return client;
}
export * from "./publisher-match.ts";
export * from "./vocabulary-seed.ts";
