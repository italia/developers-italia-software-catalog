-- Novità della v2: il publisher di ogni software (nell'API Go non esisteva).
-- Facoltativo: i software esistenti si valorizzano con scripts/backfill-publishers.ts.
-- AlterTable
ALTER TABLE "software" ADD COLUMN     "publisher_id" TEXT;

-- CreateIndex
CREATE INDEX "software_publisher_id_idx" ON "software"("publisher_id");

-- AddForeignKey
ALTER TABLE "software" ADD CONSTRAINT "software_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "publishers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

