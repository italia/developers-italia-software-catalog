import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

// Prisma 7 non legge più il .env da solo: se DATABASE_URL non è già nell'ambiente
// (CI, container), usa il .env alla radice del monorepo.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
