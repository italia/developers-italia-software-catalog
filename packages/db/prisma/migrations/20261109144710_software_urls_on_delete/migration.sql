-- Cancellando un software si cancellano i suoi URL (CASCADE). Il vincolo inverso è NO ACTION
-- e non RESTRICT, perché RESTRICT viene controllato subito anche se il vincolo è deferrable.
-- DEFERRABLE va riscritto a mano: Prisma non lo gestisce (vedi 20261109150000_deferrable_software_url_fks).
-- DropForeignKey
ALTER TABLE "software" DROP CONSTRAINT "software_software_url_id_fkey";

-- DropForeignKey
ALTER TABLE "software_urls" DROP CONSTRAINT "software_urls_software_id_fkey";

-- AddForeignKey
ALTER TABLE "software" ADD CONSTRAINT "software_software_url_id_fkey" FOREIGN KEY ("software_url_id") REFERENCES "software_urls"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "software_urls" ADD CONSTRAINT "software_urls_software_id_fkey" FOREIGN KEY ("software_id") REFERENCES "software"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
