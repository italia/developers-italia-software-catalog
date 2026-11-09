-- software.software_url_id -> software_urls.id e software_urls.software_id -> software.id
-- sono due chiavi esterne circolari, entrambe NOT NULL: rendendole DEFERRABLE, dentro
-- una transazione URL e software si possono inserire in qualsiasi ordine e i vincoli
-- vengono controllati al commit. Prisma non gestisce la deferrability, quindi è SQL a mano.
ALTER TABLE "software" ALTER CONSTRAINT "software_software_url_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "software_urls" ALTER CONSTRAINT "software_urls_software_id_fkey" DEFERRABLE INITIALLY DEFERRED;
