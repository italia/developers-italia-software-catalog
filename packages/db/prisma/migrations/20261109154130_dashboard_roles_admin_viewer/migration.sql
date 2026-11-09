-- Ruoli della dashboard: solo ADMIN (indirizzi in DASHBOARD_ADMIN_EMAILS) e VIEWER (sola lettura).
-- Eventuali utenti EDITOR diventano VIEWER prima della conversione dell'enum.
-- AlterEnum
BEGIN;
CREATE TYPE "dashboard_role_new" AS ENUM ('ADMIN', 'VIEWER');
ALTER TABLE "public"."dashboard_users" ALTER COLUMN "role" DROP DEFAULT;
UPDATE "dashboard_users" SET "role" = 'VIEWER' WHERE "role"::text = 'EDITOR';
ALTER TABLE "dashboard_users" ALTER COLUMN "role" TYPE "dashboard_role_new" USING ("role"::text::"dashboard_role_new");
ALTER TYPE "dashboard_role" RENAME TO "dashboard_role_old";
ALTER TYPE "dashboard_role_new" RENAME TO "dashboard_role";
DROP TYPE "public"."dashboard_role_old";
ALTER TABLE "dashboard_users" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
COMMIT;

-- AlterTable
ALTER TABLE "dashboard_users" ALTER COLUMN "role" SET DEFAULT 'VIEWER';

