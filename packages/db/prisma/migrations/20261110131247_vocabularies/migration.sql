-- CreateTable
CREATE TABLE "vocabularies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vocabularies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_terms" (
    "id" TEXT NOT NULL,
    "vocabulary_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label_it" TEXT,
    "label_en" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vocabulary_terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vocabulary_terms_vocabulary_id_position_idx" ON "vocabulary_terms"("vocabulary_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_terms_vocabulary_id_key_key" ON "vocabulary_terms"("vocabulary_id", "key");

-- AddForeignKey
ALTER TABLE "vocabulary_terms" ADD CONSTRAINT "vocabulary_terms_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "vocabularies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
